/** Reads content/pipeline/jobs.json and turns each enabled job into something the engine can run. */
import { join } from "node:path";

import { notesKind } from "../notes/kind";
import { customJobProblems, customKind, type CustomJob } from "./custom";
import { readJson, type Kind } from "./engine";

export type JobConfig = { id: string; kind: "notes"; enabled?: boolean; specs?: string[] } | CustomJob;

/** `notesDir` and `specIds` let a run (or CI) point the notes job somewhere else or at a few specs. */
export function loadKinds(root: string, notesDir: string, specIds: readonly string[] | null): Kind[] {
  const config = readJson<{ jobs: JobConfig[] }>(join(root, "content", "pipeline", "jobs.json"), { jobs: [{ id: "notes", kind: "notes" }] });
  const kinds: Kind[] = [];
  for (const job of config.jobs ?? []) {
    if (job.enabled === false) continue;
    if (job.kind === "notes") {
      kinds.push(notesKind(notesDir, specIds ?? (job.specs?.length ? job.specs : null)));
    } else if (job.kind === "custom") {
      const problems = customJobProblems(job);
      if (problems.length) console.log(`job "${String(job.id)}" skipped: ${problems.join("; ")}`);
      else kinds.push(customKind(specIds ? { ...job, specs: [...specIds] } : job, root));
    } else {
      console.log(`job "${String((job as { id?: unknown }).id)}" skipped: unknown kind`);
    }
  }
  return kinds;
}
