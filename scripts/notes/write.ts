/**
 * Entry point of the automatic content pipeline (the Write notes workflow runs
 * this file). It runs every enabled job in content/pipeline/jobs.json, in
 * order, sharing each AI provider's daily allowance between them. See
 * scripts/pipeline/engine.ts for how it works and docs/PIPELINE.md for how to
 * add a job.
 *
 *   npx tsx scripts/notes/write.ts [--specs a,b] [--limit 50] [--minutes 300] [--retry-failures]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadState, publishNotesLive, pushContent, readJson, runJob, type JobResult, type Progress } from "../pipeline/engine";
import { loadKinds } from "../pipeline/jobs";
import { statusReport } from "../pipeline/status";
import type { ProviderConfig } from "./providers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** NOTES_DIR lets CI test the pipeline without touching the real files. */
const NOTES = process.env.NOTES_DIR ?? join(ROOT, "content", "notes");
const STATE_DIR = process.env.NOTES_DIR ? join(process.env.NOTES_DIR, "_pipeline") : join(ROOT, "content", "pipeline");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const specIds = arg("specs")?.split(",").filter(Boolean) ?? null;
  const limit = Number(arg("limit") ?? 50);
  const deadline = Date.now() + Number(arg("minutes") ?? 300) * 60_000;
  const retryFailures = process.argv.includes("--retry-failures");

  const config = readJson<{ providers: ProviderConfig[] }>(join(ROOT, "content", "notes", "providers.json"), { providers: [] });
  const providers: ProviderConfig[] =
    process.env.NOTES_MOCK === "1"
      ? [{ id: "mock", env: "NOTES_MOCK", kind: "mock", model: "replay", rpm: 600, rpd: 10_000, maxTokens: 0 }]
      : config.providers.filter((p) => process.env[p.env]);
  console.log(`providers with keys: ${providers.map((p) => p.id).join(", ") || "none"}`);
  if (!providers.length) {
    console.error("No AI keys are set (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY ...). Nothing to do.");
    process.exit(1);
  }

  // The day's use per provider used to live in the notes progress file: carry it over once.
  const state = loadState(STATE_DIR, readJson<Partial<Progress>>(join(NOTES, "progress.json"), {}).usage);
  const kinds = loadKinds(ROOT, NOTES, specIds);
  const results: JobResult[] = [];
  let left = limit;
  for (const kind of kinds) {
    if (left <= 0 || Date.now() > deadline) break;
    const r = await runJob(kind, { limit, deadline, retryFailures, providers, stateDir: STATE_DIR, root: ROOT }, state, left);
    results.push(r);
    left -= r.written;
  }

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, "STATUS.md"), statusReport(kinds, state, results));

  // Always commit notes + pipeline state at the end of the run, even when
  // NOTES_COMMIT_EVERY is not set (the scheduled run uses main's notes.yml,
  // which may not set it). pushContent() is resilient — it won't throw.
  pushContent(ROOT, "Notes: progress (written and checked by the Write notes workflow)");
  // Finished notes go on the live site by themselves unless jobs.json says "publish_live": false.
  const settings = readJson<{ publish_live?: boolean }>(join(ROOT, "content", "pipeline", "jobs.json"), {});
  if (settings.publish_live !== false) publishNotesLive(ROOT);

  const attempts = results.reduce((n, r) => n + r.attempts, 0);
  const written = results.reduce((n, r) => n + r.written, 0);
  console.log(`done: ${written} saved this run from ${attempts} requests`);
  // Asked the AI many times and nothing at all passed: something is truly wrong, so fail the run (GitHub emails the owner).
  if (attempts >= 20 && written === 0) {
    console.error("Nothing passed the checks this run. See content/pipeline/STATUS.md and the failures files.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
