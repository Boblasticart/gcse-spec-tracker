/**
 * Bulk note writer (J2). Writes prepared notes for catalogue spec points that
 * don't have one yet, sharing the work between every AI provider whose key is
 * set (see content/notes/providers.json), each kept under its own limits.
 *
 *   npx tsx scripts/notes/write.ts [--specs a,b] [--limit 50] [--minutes 300] [--retry-failures]
 *
 * Every note must pass the QA gate (src/lib/notes/qa.ts) and the figure render
 * check before it is saved to content/notes/{spec}/{topic}.json. A note that
 * fails is retried once on another provider (told what was wrong), then goes on
 * content/notes/failures.json for Claude to fix. Progress and each provider's
 * daily use are kept in content/notes/progress.json, so a run can stop at any
 * moment and the next one carries on.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOGUE, allPoints, getPoint } from "@/content";
import { isLegacySpecId, noteShardPath } from "@/lib/notes/store";
import { qaNote } from "@/lib/notes/qa";
import { parseModelJson } from "@/server/ai/json";

import { buildNotePrompt } from "./prompt";
import { ModelUnavailable, RateLimited, complete, resolveModels, type ProviderConfig } from "./providers";
import { checkFigures, figuresOf } from "./render-check";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** Where notes, progress and failures go (NOTES_DIR lets CI test the writer without touching the real files). */
const NOTES = process.env.NOTES_DIR ?? join(ROOT, "content", "notes");
const PROGRESS = join(NOTES, "progress.json");
const FAILURES = join(NOTES, "failures.json");
const MAX_ATTEMPTS = 2;

interface Progress {
  v: 1;
  /** Requests made per provider on a UTC day. */
  usage: Record<string, { day: string; n: number }>;
  /** Which provider/model wrote each saved note. */
  notes: Record<string, { by: string; ts: string }>;
  totals: { written: number; failed: number };
}

type Failures = Record<string, { errors: string[]; tried: string[]; ts: string }>;

const readJson = <T>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);
const writeJson = (file: string, data: unknown): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 1)}\n`);
};
const today = (): string => new Date().toISOString().slice(0, 10);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Points that still need a note, in catalogue order. */
export function pendingPoints(specIds: readonly string[] | null, failures: Failures, retryFailures: boolean): string[] {
  const out: string[] = [];
  const shards = new Map<string, Record<string, unknown>>();
  // The owner's order: most popular subject first.
  const order = ["maths", "englang", "englit", "combsci", "biology", "chemistry", "physics", "history", "geography", "rs", "french", "spanish", "cs", "pe", "business"];
  const specs = [...CATALOGUE].sort((a, b) => order.indexOf(a.course) - order.indexOf(b.course));
  for (const s of specs) {
    if (isLegacySpecId(s.id) || (specIds && !specIds.includes(s.id))) continue;
    for (const p of allPoints(s)) {
      const path = noteShardPath(p.id);
      if (!path) continue;
      const file = join(NOTES, path.replace(/^\/content\/notes\//, ""));
      if (!shards.has(file)) shards.set(file, readJson<Record<string, unknown>>(file, {}));
      if (shards.get(file)![p.id] !== undefined) continue;
      if (failures[p.id] && !retryFailures) continue;
      out.push(p.id);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const specIds = arg("specs")?.split(",").filter(Boolean) ?? null;
  const limit = Number(arg("limit") ?? 50);
  const deadline = Date.now() + Number(arg("minutes") ?? 300) * 60_000;
  const retryFailures = process.argv.includes("--retry-failures");

  const config = readJson<{ providers: ProviderConfig[] }>(join(ROOT, "content", "notes", "providers.json"), { providers: [] });
  const providers =
    process.env.NOTES_MOCK === "1"
      ? [{ id: "mock", env: "NOTES_MOCK", kind: "mock" as const, model: "replay", rpm: 600, rpd: 10_000, maxTokens: 0 }]
      : config.providers.filter((p) => process.env[p.env]);
  console.log(`providers with keys: ${providers.map((p) => p.id).join(", ") || "none"}`);
  if (!providers.length) {
    console.error("No AI keys are set (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY ...). Nothing to do.");
    process.exit(1);
  }

  const progress = readJson<Progress>(PROGRESS, { v: 1, usage: {}, notes: {}, totals: { written: 0, failed: 0 } });
  const failures = readJson<Failures>(FAILURES, {});
  const queue = pendingPoints(specIds, failures, retryFailures).slice(0, limit);
  console.log(`${queue.length} points to write`);
  if (!queue.length) return;

  const pw = (await import("@playwright/test")) as typeof import("@playwright/test") & { default?: typeof import("@playwright/test") };
  const chromium = pw.chromium ?? pw.default!.chromium;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let checking: Promise<unknown> = Promise.resolve();
  /** One render check at a time (one page). */
  const renderCheck = (pid: string, note: unknown): Promise<string[]> => {
    const run = checking.then(async () => (await checkFigures(page, figuresOf(pid, note))).map((p) => `${p.id}: ${p.problem}: ${p.detail}`));
    checking = run.catch(() => undefined);
    return run;
  };

  const used = (p: ProviderConfig): number => (progress.usage[p.id]?.day === today() ? progress.usage[p.id]!.n : 0);
  const spend = (p: ProviderConfig): void => {
    progress.usage[p.id] = { day: today(), n: used(p) + 1 };
  };
  const save = (): void => {
    writeJson(PROGRESS, progress);
    writeJson(FAILURES, failures);
  };

  /** Retry queue: pid plus what earlier attempts got wrong and who tried. */
  const retries: { pid: string; errors: string[]; tried: string[] }[] = [];
  let inFlight = 0;

  const saveNote = (pid: string, note: Record<string, unknown>, by: string): void => {
    const path = noteShardPath(pid)!;
    const file = join(NOTES, path.replace(/^\/content\/notes\//, ""));
    const shard = readJson<Record<string, unknown>>(file, {});
    shard[pid] = note;
    writeJson(file, shard);
    progress.notes[pid] = { by, ts: new Date().toISOString() };
    progress.totals.written++;
    delete failures[pid];
    save();
    // In the workflow, push every few notes so they reach the preview during a long run (and survive a cut-off).
    const every = Number(process.env.NOTES_COMMIT_EVERY ?? 0);
    if (every > 0 && progress.totals.written % every === 0) pushNotes();
  };

  const pushNotes = (): void => {
    try {
      execSync("git add content/notes", { cwd: ROOT, stdio: "ignore" });
      execSync('git diff --cached --quiet || git commit -q -m "Notes: progress (written and checked by the Write notes workflow)"', { cwd: ROOT, stdio: "ignore", shell: "/bin/bash" });
      execSync("git pull -q --rebase origin rebuild && git push -q origin HEAD:rebuild", { cwd: ROOT, stdio: "ignore", shell: "/bin/bash" });
      console.log("pushed notes so far");
    } catch (e) {
      console.log(`could not push notes yet: ${(e as Error).message.slice(0, 120)}`);
    }
  };

  const worker = async (base: ProviderConfig): Promise<void> => {
    const key = process.env[base.env]!;
    const models = base.kind === "mock" ? [base.model] : await resolveModels(base, key);
    let mi = 0;
    console.log(`[${base.id}] models: ${models.join(", ") || "none"}`);
    if (!models.length) return;
    let p: ProviderConfig = { ...base, model: models[0]! };
    let stalls = 0;
    // Several workers can share one provider; together they stay under its requests-per-minute.
    const gap = Math.ceil((60_000 / p.rpm) * Math.max(1, base.parallel ?? 1));
    let next = 0;
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
          for (const r of retries.splice(0)) {
            failures[r.pid] = { errors: r.errors.slice(0, 20), tried: r.tried, ts: new Date().toISOString() };
            progress.totals.failed++;
          }
          save();
          return;
        }
        await sleep(5000);
        continue;
      }
      inFlight++;
      const wait = next - Date.now();
      if (wait > 0) await sleep(wait);
      next = Date.now() + gap;
      const ref = getPoint(job.pid)!;
      const by = `${p.id}/${p.model}`;
      let errors: string[];
      try {
        spend(p);
        const text = await complete(p, key, buildNotePrompt(ref, job.errors));
        const raw = parseModelJson(text) as Record<string, unknown>;
        const note = { ...raw, pid: job.pid, sid: ref.subject.id, v: 2, src: "pre", by, ts: new Date().toISOString() };
        const qa = qaNote(note, { pid: job.pid, course: ref.subject.course });
        errors = [...qa.errors, ...(qa.ok ? await renderCheck(job.pid, note) : [])];
        if (!errors.length) {
          saveNote(job.pid, note, by);
          console.log(`[${p.id}] ok ${job.pid} (${progress.totals.written} written)`);
          inFlight--;
          continue;
        }
      } catch (e) {
        if (e instanceof ModelUnavailable) {
          // Not this note's fault: put it back and move on to the provider's next model.
          console.log(`[${p.id}] ${p.model} can't be used (${e.message.slice(0, 160)})`);
          if (job.tried.length) retries.unshift(job);
          else queue.unshift(job.pid);
          inFlight--;
          mi++;
          if (mi >= models.length) {
            console.log(`[${p.id}] no usable model left; stopping`);
            return;
          }
          p = { ...base, model: models[mi]! };
          continue;
        }
        if (e instanceof RateLimited) {
          console.log(`[${p.id}] rate limited${e.daily ? " for today" : ""}: ${e.message.slice(0, 120)}`);
          // A model that keeps not answering (common with free models) is swapped for the next one.
          stalls = /no reply|cut off/.test(e.message) ? stalls + 1 : 0;
          if (stalls >= 2 && mi + 1 < models.length) {
            mi++;
            stalls = 0;
            p = { ...base, model: models[mi]! };
            console.log(`[${p.id}] switching to ${p.model}`);
          }
          if (job.tried.length) retries.unshift(job);
          else queue.unshift(job.pid);
          inFlight--;
          if (e.daily) {
            // Allowances are per model (Gemini, Groq): carry on with the next model before giving up for today.
            if (mi + 1 < models.length) {
              mi++;
              stalls = 0;
              p = { ...base, model: models[mi]! };
              console.log(`[${p.id}] switching to ${p.model} for the rest of today`);
              continue;
            }
            progress.usage[p.id] = { day: today(), n: p.rpd };
            save();
            return;
          }
          next = Date.now() + e.retryAfterMs;
          continue;
        }
        errors = [`${by} failed: ${(e as Error).message.slice(0, 200)}`];
      }
      inFlight--;
      const tried = [...job.tried, p.id];
      console.log(`[${p.id}] rejected ${job.pid}: ${errors.slice(0, 3).join(" | ")}`);
      if (tried.length < MAX_ATTEMPTS && (providers.length === 1 || tried.length < providers.length)) {
        retries.push({ pid: job.pid, errors, tried });
      } else {
        failures[job.pid] = { errors: errors.slice(0, 20), tried, ts: new Date().toISOString() };
        progress.totals.failed++;
        save();
      }
    }
  };

  await Promise.all(providers.flatMap((p) => Array.from({ length: Math.max(1, p.parallel ?? 1) }, () => p)).map(worker));
  save();
  await browser.close();
  console.log(`done: ${progress.totals.written} written in total, ${Object.keys(failures).length} on the failures list, ${queue.length} left in this batch`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
