/**
 * The legacy tracker's study rules (Today's 7, marking, weakness review and
 * topic quizzes) as pure functions over the saved docs. Each one is a direct
 * port of the legacy code named in its comment; tests/unit/study.test.ts
 * checks them against the legacy behaviour.
 */
import { pointLabel } from "@/content";
import { addDays } from "@/lib/dates";
import { asProgress, type ProgressDoc, type ReviewState } from "@/lib/docs";

/** Legacy `INT`: days until the next review, by box. */
export const REVIEW_INTERVALS: readonly number[] = [1, 2, 4, 8, 16, 32];

const interval = (box: number): number => REVIEW_INTERVALS[box] ?? REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1] ?? 32;

/** A question as saved in `q/*` (or the bank). */
export interface StudyQuestion {
  sid?: string;
  pid?: string;
  label?: string;
  marks: number;
  q: string;
  scheme?: string[];
  notes?: string;
  src?: string;
  date?: string;
}

/** The fields of a question the grouping rules need (bank questions may lack the rest). */
export interface QuestionRef {
  sid?: string;
  pid?: string;
  label?: string;
  src?: string;
}

/** A marked answer as saved in `a/*` (legacy `att`). */
export interface SavedAnswer {
  sid?: string;
  pid: string;
  ans: string;
  aw: number;
  mx: number;
  ok: boolean;
  hit: number[];
  expl: string;
  tip: string;
  ts: string;
  tries: number;
}

export interface MarkOutcome {
  aw: number;
  hit: number[];
  expl: string;
  tip: string;
}

/** Legacy `submitQ`: the answer doc saved after marking. Pass mark is 70%. */
export function answerDoc(q: StudyQuestion, ans: string, r: MarkOutcome, prev: unknown, nowIso: string): SavedAnswer {
  const tries = Number((prev as { tries?: unknown } | null | undefined)?.tries) || 0;
  return {
    sid: q.sid,
    pid: q.pid || "",
    ans,
    aw: r.aw,
    mx: q.marks,
    ok: r.aw / q.marks >= 0.7,
    hit: r.hit,
    expl: r.expl,
    tip: r.tip,
    ts: nowIso,
    tries: tries + 1,
  };
}

/** Legacy `recordResult`: moves the point's spaced-review box after an answer is marked. */
export function recordResult(progress: unknown, q: StudyQuestion, aw: number, mx: number, today: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  const pid = q.pid;
  if (!q.sid || !pid) return p;
  const pass = mx > 0 && aw / mx >= 0.7;
  const m: ReviewState = (p.m[pid] = p.m[pid] ?? { b: 0, n: 0, c: 0 });
  m.n++;
  if (pass) {
    m.c++;
    m.b = Math.min(m.b + 1, 5);
  } else m.b = 0;
  m.l = today;
  m.d = addDays(today, interval(m.b));
  if (!pass) m.p = 0;
  if (p.s[pid] === 2) {
    if (!pass) p.s[pid] = 1;
  } else {
    p.s[pid] = 1;
    if (m.b >= 3) m.p = 1;
  }
  p.c[pid] = pointLabel(pid) || q.label || "";
  return p;
}

/** Path of today's set for a subject (legacy `daily/{date}-{sid}`). */
export const dailyKey = (today: string, sid: string): string => `${today}-${sid}`;

export interface DailyDoc {
  sid: string;
  date: string;
  qids: string[];
}

export function asDaily(data: unknown): DailyDoc | null {
  const d = data as Partial<DailyDoc> | null | undefined;
  if (!d || !Array.isArray(d.qids)) return null;
  return { sid: String(d.sid ?? ""), date: String(d.date ?? ""), qids: d.qids.map(String) };
}

/** Legacy `more7`, first choice: up to 7 untried bank questions not already in today's set. */
export function seedPool(questions: Readonly<Record<string, QuestionRef | undefined>>, answers: Readonly<Record<string, unknown>>, sid: string, used: readonly string[]): string[] {
  const u = new Set(used);
  return Object.keys(questions)
    .filter((id) => questions[id]?.sid === sid && questions[id]?.src === "seed" && !answers[id] && !u.has(id))
    .slice(0, 7);
}

/** Legacy question ids: `d{date}-{sid}-{n}` for the first set, `...-m{time}{n}` for extra ones. */
export function newQuestionId(today: string, sid: string, n: number, append: boolean, now: number): string {
  return append ? `d${today}-${sid}-m${now.toString(36)}${n}` : `d${today}-${sid}-${n}`;
}

/** Legacy `todayStats`. */
export function todayStats(daily: DailyDoc | null, answers: Readonly<Record<string, SavedAnswer | undefined>>): { n: number; done: number; aw: number; mx: number } | null {
  if (!daily) return null;
  let aw = 0;
  let mx = 0;
  let done = 0;
  for (const id of daily.qids) {
    const a = answers[id];
    if (a) {
      done++;
      aw += a.aw;
      mx += a.mx;
    }
  }
  return { n: daily.qids.length, done, aw, mx };
}

// ---------------------------------------------------------------------------
// Weakness review (legacy reviewGroups / reviewNeeds / dec)
// ---------------------------------------------------------------------------

export interface ReviewGroup {
  pid: string;
  sid: string;
  label: string;
  aw: number;
  mx: number;
  qs: string[];
}

export interface ReviewEntry {
  mistakes: string[];
  missing: string[];
  terms: string[];
  tip: string;
}

export interface ReviewDoc {
  sid: string;
  date: string;
  items: Record<string, ReviewEntry>;
  ts: string;
}

/** Legacy `reviewGroups`: today's answered questions, grouped by spec point. */
export function reviewGroups(
  daily: DailyDoc | null,
  questions: Readonly<Record<string, QuestionRef | undefined>>,
  answers: Readonly<Record<string, SavedAnswer | undefined>>,
): ReviewGroup[] {
  if (!daily) return [];
  const g = new Map<string, ReviewGroup>();
  for (const id of daily.qids) {
    const q = questions[id];
    const a = answers[id];
    if (!q || !a) continue;
    const pid = q.pid ?? "";
    let x = g.get(pid);
    if (!x) g.set(pid, (x = { pid, sid: q.sid ?? "", label: q.label ?? "", aw: 0, mx: 0, qs: [] }));
    x.aw += a.aw;
    x.mx += a.mx;
    x.qs.push(id);
  }
  return [...g.values()];
}

/** Legacy `reviewNeeds`: today's answers that lost marks and have no review yet. */
export function reviewNeeds(
  daily: DailyDoc | null,
  questions: Readonly<Record<string, QuestionRef | undefined>>,
  answers: Readonly<Record<string, SavedAnswer | undefined>>,
  reviewed: Readonly<Record<string, unknown>>,
): string[] {
  if (!daily) return [];
  return daily.qids.filter((id) => {
    const a = answers[id];
    return !!a && a.aw < a.mx && !!questions[id] && !reviewed[id];
  });
}

/** Legacy suggestion in the review: Mastered if done already or box 3+. */
export function reviewSuggestion(progress: unknown, pid: string): "Mastered" | "Needs more work" {
  const p = asProgress(progress);
  return p.s[pid] === 2 || (p.m[pid]?.b ?? 0) >= 3 ? "Mastered" : "Needs more work";
}

/** Legacy `dec`: the student's decision in the weakness review. */
export function decideReview(progress: unknown, pid: string, status: 1 | 2, today: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  if (status === 2) {
    p.s[pid] = 2;
    const m = p.m[pid];
    if (m) m.p = 0;
  } else {
    p.s[pid] = 1;
    const m: ReviewState = (p.m[pid] = p.m[pid] ?? { b: 0, n: 0, c: 0 });
    m.p = 0;
    m.b = Math.min(m.b, 1);
    m.d = addDays(today, 1);
  }
  p.c[pid] = pointLabel(pid);
  return p;
}

// ---------------------------------------------------------------------------
// Topic quizzes (legacy genQuiz / submitQuiz)
// ---------------------------------------------------------------------------

export interface QuizDoc {
  sid: string;
  tid: string;
  ts: string;
  qs: { pid: string; marks: number; q: string; scheme: string[]; notes: string }[];
}

export interface QuizResultDoc {
  sid: string;
  tid: string;
  /** The `ts` of the quiz this result is for. */
  qts: string;
  aw: number;
  mx: number;
  pct: number;
  pass: boolean;
  items: { aw: number; hit: number[]; expl: string; ans: string }[];
  ts: string;
}

export function asQuiz(data: unknown): QuizDoc | null {
  const d = data as Partial<QuizDoc> | null | undefined;
  if (!d || !Array.isArray(d.qs) || !d.qs.length) return null;
  return d as QuizDoc;
}

export function asQuizResult(data: unknown): QuizResultDoc | null {
  const d = data as Partial<QuizResultDoc> | null | undefined;
  if (!d || typeof d.pct !== "number" || !Array.isArray(d.items)) return null;
  return d as QuizResultDoc;
}

/** Legacy `submitQuiz`: pass (80%+) marks every point in the topic Done; otherwise Needs work, back tomorrow. */
export function applyQuizResult(progress: unknown, pids: readonly string[], pass: boolean, today: string): ProgressDoc {
  const p = asProgress(structuredClone(progress ?? {}));
  for (const pid of pids) {
    const m: ReviewState = (p.m[pid] = p.m[pid] ?? { b: 0, n: 0, c: 0 });
    p.c[pid] = pointLabel(pid);
    if (pass) {
      p.s[pid] = 2;
      m.p = 0;
      m.b = Math.max(m.b, 3);
      m.d = addDays(today, interval(m.b));
    } else {
      p.s[pid] = 1;
      m.p = 0;
      m.b = Math.min(m.b, 1);
      m.d = addDays(today, 1);
    }
  }
  return p;
}

/** Legacy: the points whose quiz questions lost marks ("Re-read these notes"). */
export function quizLostPoints(quiz: QuizDoc, res: QuizResultDoc): string[] {
  const lost = new Set<string>();
  quiz.qs.forEach((q, i) => {
    const it = res.items[i];
    if (it && it.aw < q.marks) lost.add(q.pid);
  });
  return [...lost];
}

