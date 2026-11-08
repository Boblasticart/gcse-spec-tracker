import { pointLabel } from "@/content";
import { asProgress, type ProgressDoc } from "@/lib/docs";

/** 0 = not done, 1 = needs work, 2 = done. */
export type PointStatus = 0 | 1 | 2;

export const STATUS_LABELS: readonly string[] = ["Not done", "Needs work", "Done"];

export function statusOf(progress: unknown, pid: string): PointStatus {
  const v = asProgress(progress).s[pid];
  return v === 1 || v === 2 ? v : 0;
}

/** Legacy `setStatus`: Not done removes the point from `s` and `c`; otherwise saves the status and its label. */
export function withStatus(progress: unknown, pid: string, status: PointStatus): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  if (status === 0) {
    delete p.s[pid];
    delete p.c[pid];
  } else {
    p.s[pid] = status;
    p.c[pid] = pointLabel(pid);
  }
  return p;
}

/** [not done, needs work, done] counts over these point ids (legacy `count`). */
export function countStatuses(progress: unknown, pids: readonly string[]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (const pid of pids) c[statusOf(progress, pid)]++;
  return c;
}
