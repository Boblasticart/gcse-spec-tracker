import { pointLabel } from "@/content";
import { shortDay } from "@/lib/dates";
import { asProgress, type ReviewState } from "@/lib/docs";

/** A saved question (`q/*`, or the shared bank in data/questions.json). */
export interface QuestionDoc {
  sid?: string;
  pid?: string;
  label?: string;
  q?: string;
  marks?: number;
  scheme?: string[];
  src?: string;
  date?: string;
}

/** A marked answer (`a/*`). */
export interface AnswerDoc {
  ans?: string;
  aw: number;
  mx: number;
  ok?: boolean;
  hit?: number[];
}

export interface ImproveInput {
  sid: string;
  progress: unknown;
  /** Every question, keyed by id: the bank first, then the account's `q/*` (which win). */
  questions: Readonly<Record<string, QuestionDoc>>;
  answers: Readonly<Record<string, AnswerDoc>>;
  /** Question ids in today's set for this subject (`daily/{today}-{sid}`). */
  todayQids: readonly string[];
}

export interface ImproveModel {
  /** Points marked Needs work, soonest review first. */
  needsWork: string[];
  /** Points marked Done. */
  mastered: string[];
  /** Needs-work points with three correct in a row, waiting for a decision. */
  ready: string[];
  attempted: number;
  correct: number;
  /** Missed questions first, then seed questions not yet tried (and not in today's set). */
  waiting: string[];
  empty: boolean;
}

/** Legacy `renderImprove` without the HTML. */
export function improveModel({ sid, progress, questions, answers, todayQids }: ImproveInput): ImproveModel {
  const p = asProgress(progress);
  const nw = Object.keys(p.s).filter((id) => p.s[id] === 1);
  const dn = Object.keys(p.s).filter((id) => p.s[id] === 2);
  let attempted = 0;
  let correct = 0;
  for (const m of Object.values(p.m)) {
    attempted += Number(m?.n) || 0;
    correct += Number(m?.c) || 0;
  }
  const due = (id: string): string => p.m[id]?.d || "0";
  const needsWork = nw.slice().sort((a, b) => due(a).localeCompare(due(b)));
  const inToday = new Set(todayQids);
  const qs = Object.keys(questions).filter((id) => {
    const q = questions[id];
    if (!q || q.sid !== sid) return false;
    const a = answers[id];
    return a ? !a.ok : q.src === "seed" && !inToday.has(id);
  });
  const missed = qs.filter((id) => answers[id]);
  const fresh = qs.filter((id) => !answers[id]);
  return {
    needsWork: nw.length ? needsWork : [],
    mastered: dn,
    ready: nw.filter((id) => !!p.m[id]?.p),
    attempted,
    correct,
    waiting: missed.concat(fresh),
    empty: !nw.length && !dn.length,
  };
}

/** Legacy `meta`: the review line under a point. */
export function reviewMeta(m: ReviewState | undefined): string {
  return m ? `${m.c}/${m.n} correct · streak ${m.b} · next check ${shortDay(m.d)}` : "Not tested yet";
}

/** Legacy `lab`: the saved label, else the spec label, else the id. */
export function pointName(progress: unknown, pid: string): string {
  return asProgress(progress).c[pid] || pointLabel(pid) || pid;
}
