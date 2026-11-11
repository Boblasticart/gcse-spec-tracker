/**
 * Numbers for the live progress dashboard, worked out from the saved docs.
 * Pure functions so the maths is unit-tested (tests/unit/metrics.test.ts).
 */
import { allPoints, type Subject } from "@/content";
import { addDays, londonToday, pct } from "@/lib/dates";
import { asProgress } from "@/lib/docs";

/** The new `stats/time` doc: seconds of active study per London day. */
export const STATS_TIME_PATH = "stats/time";

export interface StudyTimeDoc {
  days: Record<string, number>;
  v: 1;
}

export function asStudyTime(data: unknown): StudyTimeDoc {
  const days: Record<string, number> = {};
  const raw = (data as { days?: unknown } | null | undefined)?.days;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) days[k] = Math.round(v);
    }
  }
  return { days, v: 1 };
}

/** Adds study time to a day. At most 6 hours a day is counted, so a stuck timer can't run away. */
export function addStudySeconds(data: unknown, day: string, seconds: number): StudyTimeDoc {
  const doc = asStudyTime(data);
  const add = Math.max(0, Math.floor(seconds));
  doc.days[day] = Math.min(6 * 3600, (doc.days[day] ?? 0) + add);
  return doc;
}

export interface SubjectMetrics {
  sid: string;
  name: string;
  total: number;
  /** [not done, needs work, done] */
  counts: [number, number, number];
  /** % of points marked Done. */
  mastery: number;
}

export function subjectMetrics(subject: Subject, progress: unknown): SubjectMetrics {
  const p = asProgress(progress);
  const counts: [number, number, number] = [0, 0, 0];
  const pts = allPoints(subject);
  for (const pt of pts) {
    const v = p.s[pt.id];
    counts[v === 1 || v === 2 ? v : 0]++;
  }
  return { sid: subject.id, name: subject.name, total: pts.length, counts, mastery: pct(counts[2], pts.length) };
}

interface MarkedLike {
  aw?: unknown;
  mx?: unknown;
  ts?: unknown;
}

interface QuizResultLike {
  aw?: unknown;
  mx?: unknown;
  ts?: unknown;
  items?: unknown;
}

export interface StudyMetrics {
  /** Exam questions answered (Today's 7 and Improvement) plus quiz questions answered. */
  answered: number;
  marksAwarded: number;
  marksAvailable: number;
  /** % of marks gained, or null when nothing has been marked. */
  marksPct: number | null;
  /** Days in a row with study, ending today (or yesterday, if today hasn't started yet). */
  streak: number;
  secondsToday: number;
  secondsWeek: number;
  secondsTotal: number;
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** London day of an ISO timestamp, or null. */
function dayOf(ts: unknown): string | null {
  if (typeof ts !== "string") return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : londonToday(d);
}

/** A day counts towards the streak with an answer, a quiz, or at least a minute of study. */
export const STREAK_MIN_SECONDS = 60;

export function studyMetrics(
  answers: readonly MarkedLike[],
  quizResults: readonly QuizResultLike[],
  time: unknown,
  today: string,
): StudyMetrics {
  let answered = 0;
  let aw = 0;
  let mx = 0;
  const active = new Set<string>();
  for (const a of answers) {
    answered++;
    aw += num(a.aw);
    mx += num(a.mx);
    const d = dayOf(a.ts);
    if (d) active.add(d);
  }
  for (const r of quizResults) {
    const items = Array.isArray(r.items) ? (r.items as { ans?: unknown }[]) : [];
    answered += items.filter((it) => typeof it?.ans === "string" && it.ans.trim()).length;
    aw += num(r.aw);
    mx += num(r.mx);
    const d = dayOf(r.ts);
    if (d) active.add(d);
  }
  const { days } = asStudyTime(time);
  let total = 0;
  let week = 0;
  const weekStart = addDays(today, -6);
  for (const [d, s] of Object.entries(days)) {
    total += s;
    if (d >= weekStart && d <= today) week += s;
    if (s >= STREAK_MIN_SECONDS) active.add(d);
  }
  let streak = 0;
  let day = active.has(today) ? today : addDays(today, -1);
  while (active.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return {
    answered,
    marksAwarded: aw,
    marksAvailable: mx,
    marksPct: mx ? pct(aw, mx) : null,
    streak,
    secondsToday: days[today] ?? 0,
    secondsWeek: week,
    secondsTotal: total,
  };
}

/** "0 min", "45 min", "2 h 5 min". */
export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
