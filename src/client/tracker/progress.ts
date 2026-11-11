import { pointLabel } from "@/content";
import { addDays } from "@/lib/dates";
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

/** Legacy `all`: every point in the list set to one status (Mark all done / Reset topic). */
export function withStatuses(progress: unknown, pids: readonly string[], status: PointStatus): ProgressDoc {
  let p = asProgress(structuredClone(progress ?? {}));
  for (const pid of pids) p = withStatus(p, pid, status);
  return p;
}

/** Legacy `markViewed`: the student has opened this point's notes. */
export function withNoteRead(progress: unknown, pid: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  if (!p.w[pid]) p.w[pid] = 1;
  return p;
}

export function isNoteRead(progress: unknown, pid: string): boolean {
  return !!asProgress(progress).w[pid];
}

/** Legacy `master`: after three correct in a row, class the point as mastered. */
export function withMastered(progress: unknown, pid: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  const m = p.m[pid];
  if (m) m.p = 0;
  p.s[pid] = 2;
  p.c[pid] = pointLabel(pid);
  return p;
}

/** Legacy `more`: keep practising, so the point comes back for review tomorrow. */
export function withMorePractice(progress: unknown, pid: string, today: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  const m = p.m[pid];
  if (m) {
    m.p = 0;
    m.b = 2;
    m.d = addDays(today, 1);
  }
  return p;
}
