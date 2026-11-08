import { PROGRESS_MAPS, asProgress, collectionOf, type ProgressDoc } from "@/lib/docs";

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a progress doc: start from the server copy and replay
 * only the keys this device changed (compared with the copy it started from).
 * Locally changed keys win; keys only the server changed are kept.
 */
export function mergeProgress(base: unknown, local: unknown, server: unknown): ProgressDoc {
  const b = asProgress(base);
  const l = asProgress(local);
  const out = asProgress(structuredClone(server ?? {}));
  for (const map of PROGRESS_MAPS) {
    const target = out[map] as Record<string, unknown>;
    const lm = l[map] as Record<string, unknown>;
    const bm = b[map] as Record<string, unknown>;
    for (const key of new Set([...Object.keys(lm), ...Object.keys(bm)])) {
      if (same(lm[key], bm[key])) continue;
      if (key in lm) target[key] = structuredClone(lm[key]);
      else delete target[key];
    }
  }
  return out;
}

/**
 * What to send after a conflict. `local` is this device's latest copy
 * (`null` = delete). Progress docs merge key by key; everything else is
 * last-writer-wins, and this device's write is the latest.
 */
export function resolveConflict(path: string, base: unknown, local: unknown, server: unknown): unknown {
  if (collectionOf(path) === "progress" && local !== null && server !== null && server !== undefined) {
    return mergeProgress(base, local, server);
  }
  return local;
}
