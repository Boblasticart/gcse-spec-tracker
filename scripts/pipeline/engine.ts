/**
 * The automatic content pipeline's engine. It makes "items" (a note, a set of
 * flashcards, anything a job describes) by asking the AI providers the owner
 * has keys for, checks every reply, and saves only what passes.
 *
 * It is built to run with nobody watching:
 * - each provider is kept under its own free limits, and several models are tried;
 * - a model that keeps failing the checks is skipped for a week;
 * - an item that fails is retried on another provider straight away, then again
 *   on later days (up to MAX_TRIES), then listed as "stuck" in STATUS.md;
 * - progress is saved after every item, so a run can stop at any moment.
 *
 * What to make is described by a Kind (see kinds in scripts/pipeline/jobs.ts).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseModelJson } from "@/server/ai/json";

import { ModelUnavailable, RateLimited, complete, resolveModels, type ProviderConfig } from "../notes/providers";

/** One kind of content the pipeline can make. */
export interface Kind {
  /** Job id, e.g. "notes". */
  id: string;
  /** Folder holding this job's progress.json and failures.json. */
  dir: string;
  /** Every item this job should end up with, in the order to make them. `group` is shown in the status report (e.g. the spec id). */
  items(): { id: string; group: string; done: boolean }[];
  /** The prompt for one item; `errors` = why the last attempt was rejected. */
  prompt(id: string, errors: readonly string[]): string;
  /** Turns the model's reply into the thing to save, repairing what it safely can. Any error means "do not save". */
  check(id: string, raw: unknown, by: string): Promise<{ value: unknown; errors: string[] }>;
  save(id: string, value: unknown): void;
  /** Called once when the job ends (e.g. to close a browser). */
  close?(): Promise<void>;
}

export interface Failure {
  errors: string[];
  tried: string[];
  ts: string;
  /** How many runs have failed this item (missing = 1). */
  n?: number;
}
export type Failures = Record<string, Failure>;

export interface Progress {
  v: 1;
  /** Kept for older files; the shared record is now in state.json. */
  usage?: Record<string, { day: string; n: number }>;
  /** Which provider/model made each saved item. */
  notes: Record<string, { by: string; ts: string }>;
  totals: { written: number; failed: number };
}

/** Shared between all jobs: what each provider has used today, and how each model is doing. */
export interface State {
  v: 1;
  usage: Record<string, { day: string; n: number }>;
  /** Per "provider/model": replies that passed / failed the checks since `since`. */
  models: Record<string, { ok: number; bad: number; since: string }>;
}

export interface RunOptions {
  /** Most items to make this run, across all jobs. */
  limit: number;
  /** Stop starting new items after this time (ms since epoch). */
  deadline: number;
  /** Retry everything on the failures list now, ignoring the wait and the try limit. */
  retryFailures: boolean;
  providers: ProviderConfig[];
  /** Folder for state.json and STATUS.md. */
  stateDir: string;
  /** Repo root (for git pushes during long runs). */
  root: string;
}

export interface JobResult {
  id: string;
  written: number;
  rejected: number;
  attempts: number;
}

/** An item is retried on later days until it has failed this many runs. */
export const MAX_TRIES = 6;
/** A failed item waits this long before the next run tries it again. */
export const RETRY_AFTER_MS = 12 * 3600_000;
/** Attempts on one item within a run (each on a different provider). */
const MAX_ATTEMPTS = 2;
/** A model with at least this many checked replies and under POOR_SHARE passing is skipped. */
const POOR_MIN = 10;
const POOR_SHARE = 0.15;
const HEALTH_DAYS = 7;

export const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);
export const writeJson = (file: string, data: unknown): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
};
const today = (): string => new Date().toISOString().slice(0, 10);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Has this failed item used up its tries? */
export function isStuck(f: Failure | undefined): boolean {
  return !!f && (f.n ?? 1) >= MAX_TRIES;
}

/** Items still to make, in the kind's order: new ones, plus failed ones whose wait is over. */
export function pendingItems(items: readonly { id: string; done: boolean }[], failures: Failures, retryFailures: boolean, now = Date.now()): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (it.done) continue;
    const f = failures[it.id];
    if (f && !retryFailures && (isStuck(f) || now - Date.parse(f.ts) < RETRY_AFTER_MS)) continue;
    out.push(it.id);
  }
  return out;
}

/** True when a model has been tried enough and almost never passes the checks. */
export function isPoor(h: { ok: number; bad: number } | undefined): boolean {
  if (!h) return false;
  const n = h.ok + h.bad;
  return n >= POOR_MIN && h.ok / n < POOR_SHARE;
}

/** Puts models that are doing badly last-resort only: they are dropped unless every model is doing badly. */
export function usableModels(providerId: string, models: readonly string[], state: State): string[] {
  const good = models.filter((m) => !isPoor(state.models[`${providerId}/${m}`]));
  return good.length ? good : [...models];
}

export function loadState(stateDir: string, seedUsage?: State["usage"]): State {
  const state = readJson<State>(join(stateDir, "state.json"), { v: 1, usage: seedUsage ?? {}, models: {} });
  state.usage ??= {};
  state.models ??= {};
  // Old results fade: a model gets a fresh chance every HEALTH_DAYS.
  const cutoff = new Date(Date.now() - HEALTH_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const [k, h] of Object.entries(state.models)) if (h.since < cutoff) delete state.models[k];
  return state;
}

/** Commits and pushes everything under content/ (used during long runs and at the end). */
export function pushContent(root: string, message: string): void {
  try {
    execSync("git add content", { cwd: root, stdio: "ignore" });
    execSync(`git diff --cached --quiet || git commit -q -m "${message}"`, { cwd: root, stdio: "ignore", shell: "/bin/bash" });
    execSync("for i in 1 2 3; do git pull -q --rebase origin rebuild && git push -q origin HEAD:rebuild && exit 0; sleep 10; done; exit 1", { cwd: root, stdio: "ignore", shell: "/bin/bash" });
    console.log("pushed work so far");
  } catch (e) {
    console.log(`could not push yet: ${(e as Error).message.slice(0, 120)}`);
  }
}

/** Runs one job until its queue is empty, the limit or deadline is reached, or every provider is done for today. */
export async function runJob(kind: Kind, opts: RunOptions, state: State, limit: number): Promise<JobResult> {
  const { providers, deadline } = opts;
  const PROGRESS = join(kind.dir, "progress.json");
  const FAILURES = join(kind.dir, "failures.json");
  const STATE = join(opts.stateDir, "state.json");
  const progress = readJson<Progress>(PROGRESS, { v: 1, notes: {}, totals: { written: 0, failed: 0 } });
  delete progress.usage; // now kept in state.json
  const failures = readJson<Failures>(FAILURES, {});
  const result: JobResult = { id: kind.id, written: 0, rejected: 0, attempts: 0 };

  const queue = pendingItems(kind.items(), failures, opts.retryFailures).slice(0, Math.max(0, limit));
  console.log(`[${kind.id}] ${queue.length} to make this run`);
  if (!queue.length) return result;

  const used = (p: ProviderConfig): number => (state.usage[p.id]?.day === today() ? state.usage[p.id]!.n : 0);
  const spend = (p: ProviderConfig): void => {
    state.usage[p.id] = { day: today(), n: used(p) + 1 };
  };
  const mark = (by: string, ok: boolean): void => {
    const h = (state.models[by] ??= { ok: 0, bad: 0, since: today() });
    if (ok) h.ok++;
    else h.bad++;
  };
  const save = (): void => {
    writeJson(PROGRESS, progress);
    writeJson(FAILURES, failures);
    writeJson(STATE, state);
  };
  const fail = (id: string, errors: string[], tried: string[]): void => {
    failures[id] = { errors: errors.slice(0, 20), tried, ts: new Date().toISOString(), n: (failures[id]?.n ?? (failures[id] ? 1 : 0)) + 1 };
    progress.totals.failed++;
    result.rejected++;
  };

  /** Retry queue: item plus what earlier attempts got wrong and who tried. */
  const retries: { pid: string; errors: string[]; tried: string[] }[] = [];
  let inFlight = 0;
  const every = Number(process.env.NOTES_COMMIT_EVERY ?? 0);

  const worker = async (base: ProviderConfig): Promise<void> => {
    const key = process.env[base.env] ?? "";
    const models = base.kind === "mock" ? [base.model] : usableModels(base.id, await resolveModels(base, key), state);
    let mi = 0;
    console.log(`[${base.id}] models: ${models.join(", ") || "none"}`);
    if (!models.length) return;
    let p: ProviderConfig = { ...base, model: models[0]! };
    let stalls = 0;
    // Several workers can share one provider; together they stay under its requests-per-minute.
    const gap = Math.ceil((60_000 / p.rpm) * Math.max(1, base.parallel ?? 1));
    let next = 0;
    /** Moves to the provider's next model; false when there is none. */
    const nextModel = (why: string): boolean => {
      if (mi + 1 >= models.length) return false;
      mi++;
      stalls = 0;
      p = { ...base, model: models[mi]! };
      console.log(`[${p.id}] switching to ${p.model} (${why})`);
      return true;
    };
    for (;;) {
      if (Date.now() > deadline) return;
      if (used(p) >= p.rpd) {
        console.log(`[${p.id}] daily allowance used (${p.rpd}); stopping for today`);
        return;
      }
      const eligible = (r: { tried: string[] }): boolean => providers.length === 1 || !r.tried.includes(p.id);
      const ri = retries.findIndex(eligible);
      const job = ri >= 0 ? retries.splice(ri, 1)[0]! : queue.length ? { pid: queue.shift()!, errors: [], tried: [] } : null;
      if (!job) {
        if (inFlight === 0) {
          // Nobody else can take what's left (e.g. the other provider is done for today).
          for (const r of retries.splice(0)) fail(r.pid, r.errors, r.tried);
          save();
          return;
        }
        await sleep(5000);
        continue;
      }
      inFlight++;
      const putBack = (): void => {
        if (job.tried.length) retries.unshift(job);
        else queue.unshift(job.pid);
        inFlight--;
      };
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + gap;
      const by = `${p.id}/${p.model}`;
      let errors: string[];
      try {
        spend(p);
        result.attempts++;
        const text = await complete(p, key, kind.prompt(job.pid, job.errors));
        const checked = await kind.check(job.pid, parseModelJson(text), by);
        errors = checked.errors;
        if (!errors.length) {
          kind.save(job.pid, checked.value);
          progress.notes[job.pid] = { by, ts: new Date().toISOString() };
          progress.totals.written++;
          result.written++;
          delete failures[job.pid];
          mark(by, true);
          save();
          console.log(`[${p.id}] ok ${job.pid} (${result.written} this run)`);
          // In the workflow, push every few items so they reach the preview during a long run (and survive a cut-off).
          if (every > 0 && result.written % every === 0) pushContent(opts.root, "Notes: progress (written and checked by the Write notes workflow)");
          inFlight--;
          continue;
        }
      } catch (e) {
        if (e instanceof ModelUnavailable) {
          // Not this item's fault: put it back and move on to the provider's next model.
          console.log(`[${p.id}] ${p.model} can't be used (${e.message.slice(0, 160)})`);
          putBack();
          if (!nextModel("model can't be used")) {
            console.log(`[${p.id}] no usable model left; stopping`);
            return;
          }
          continue;
        }
        if (e instanceof RateLimited) {
          console.log(`[${p.id}] rate limited${e.daily ? " for today" : ""}: ${e.message.slice(0, 120)}`);
          putBack();
          // A model that keeps not answering (common with free models) is swapped for the next one.
          stalls = /no reply|cut off/.test(e.message) ? stalls + 1 : 0;
          if (stalls >= 2) nextModel("not answering");
          if (e.daily) {
            // Allowances are per model (Gemini, Groq): carry on with the next model before giving up for today.
            if (nextModel("out of allowance for today")) continue;
            state.usage[p.id] = { day: today(), n: p.rpd };
            save();
            return;
          }
          next = Date.now() + e.retryAfterMs;
          continue;
        }
        errors = [`${by} failed: ${(e as Error).message.slice(0, 200)}`];
      }
      inFlight--;
      mark(by, false);
      const tried = [...job.tried, p.id];
      console.log(`[${p.id}] rejected ${job.pid}: ${errors.slice(0, 3).join(" | ")}`);
      if (tried.length < MAX_ATTEMPTS && (providers.length === 1 || tried.length < providers.length)) {
        retries.push({ pid: job.pid, errors, tried });
      } else {
        fail(job.pid, errors, tried);
        save();
      }
      // A model that almost never passes the checks wastes the allowance: move on if there is another.
      if (isPoor(state.models[by])) nextModel("its replies keep failing the checks");
    }
  };

  try {
    await Promise.all(providers.flatMap((p) => Array.from({ length: Math.max(1, p.parallel ?? 1) }, () => p)).map(worker));
    // Anything still waiting for a second opinion when every worker has stopped counts as failed for this run.
    for (const r of retries.splice(0)) fail(r.pid, r.errors, r.tried);
  } finally {
    save();
    await kind.close?.();
  }
  console.log(`[${kind.id}] done: ${result.written} saved, ${result.rejected} failed this run, ${Object.keys(failures).length} on the failures list`);
  return result;
}
