/**
 * Practice papers marked as attempted. The legacy tracker kept these in
 * localStorage (`gcse-papers-v1` = { [paperKey]: "YYYY-MM-DD" }); the rebuild
 * saves the same map in the account as the new doc `papers/done`.
 */

export const PAPERS_DONE_PATH = "papers/done";

export type PapersDone = Record<string, string>;

export function asPapersDone(data: unknown): PapersDone {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: PapersDone = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) if (typeof v === "string" && v) out[k] = v;
  return out;
}

/** Legacy `pdone`: mark attempted today, or clear it if it was already marked. */
export function togglePaperDone(data: unknown, key: string, today: string): PapersDone {
  const done = asPapersDone(data);
  if (done[key]) delete done[key];
  else done[key] = today;
  return done;
}
