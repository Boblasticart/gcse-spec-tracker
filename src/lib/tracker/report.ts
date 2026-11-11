/**
 * What goes in the "Download progress PDF" report, worked out from the same
 * docs and metrics as the dashboard. Pure, so it is unit-tested and the PDF
 * component only has to lay it out.
 */
import { getPoint, pointLabel, SPEC } from "@/content";
import { londonToday, pct, shortDay } from "@/lib/dates";
import { asProgress } from "@/lib/docs";

import { formatMinutes, studyMetrics, subjectMetrics } from "./metrics";

export interface ReportSubject {
  sid: string;
  name: string;
  board: string;
  code: string;
  total: number;
  counts: [number, number, number];
  mastery: number;
  /** Points marked Needs work, as "Topic > Point" labels. */
  needsWork: string[];
}

export interface ReportMark {
  day: string;
  subject: string;
  label: string;
  aw: number;
  mx: number;
}

export interface ReportData {
  email: string;
  /** e.g. "11 Nov 2026". */
  date: string;
  overall: { total: number; counts: [number, number, number]; mastery: number };
  subjects: ReportSubject[];
  recentMarks: ReportMark[];
  answered: number;
  marksPct: number | null;
  streak: number;
  studyToday: string;
  studyWeek: string;
  studyTotal: string;
}

export interface ReportInput {
  email: string;
  today: string;
  /** Every doc the account has, by path (as in the sync store). */
  docs: Readonly<Record<string, unknown>>;
}

/** PDFs use the standard Helvetica font, so keep labels to characters it has. */
const plain = (s: string): string =>
  s
    .replace(/›/g, ">")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^ -~ -ÿ]/g, "");

const RECENT = 12;

export function buildReport({ email, today, docs }: ReportInput): ReportData {
  const byPrefix = (prefix: string): [string, Record<string, unknown>][] =>
    Object.entries(docs)
      .filter(([p, d]) => p.startsWith(prefix) && d && typeof d === "object")
      .map(([p, d]) => [p.slice(prefix.length), d as Record<string, unknown>]);

  const subjects: ReportSubject[] = SPEC.map((s) => {
    const progress = docs[`progress/${s.id}`];
    const m = subjectMetrics(s, progress);
    const p = asProgress(progress);
    const needsWork = Object.keys(p.s)
      .filter((id) => p.s[id] === 1 && getPoint(id)?.subject.id === s.id)
      .map((id) => plain(p.c[id] || pointLabel(id)));
    return { sid: s.id, name: s.name, board: s.board, code: s.code, total: m.total, counts: m.counts, mastery: m.mastery, needsWork };
  });
  const counts = subjects.reduce<[number, number, number]>((t, s) => [t[0] + s.counts[0], t[1] + s.counts[1], t[2] + s.counts[2]], [0, 0, 0]);
  const total = counts[0] + counts[1] + counts[2];

  const answers = byPrefix("a/");
  const study = studyMetrics(
    answers.map(([, a]) => a),
    byPrefix("qr/").map(([, r]) => r),
    docs["stats/time"],
    today,
  );

  const recentMarks: ReportMark[] = answers
    .map(([, a]) => a)
    .filter((a) => typeof a.ts === "string" && typeof a.aw === "number" && typeof a.mx === "number")
    .sort((x, y) => String(y.ts).localeCompare(String(x.ts)))
    .slice(0, RECENT)
    .map((a) => {
      const ref = getPoint(String(a.pid ?? ""));
      return {
        day: shortDay(londonToday(new Date(String(a.ts)))),
        subject: ref?.subject.name ?? "",
        label: plain(ref ? `${ref.topic.name} > ${ref.point.text}` : "Question"),
        aw: a.aw as number,
        mx: a.mx as number,
      };
    });

  return {
    email,
    date: new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    overall: { total, counts, mastery: pct(counts[2], total) },
    subjects,
    recentMarks,
    answered: study.answered,
    marksPct: study.marksPct,
    streak: study.streak,
    studyToday: formatMinutes(study.secondsToday),
    studyWeek: formatMinutes(study.secondsWeek),
    studyTotal: formatMinutes(study.secondsTotal),
  };
}

export const reportFileName = (today: string): string => `gcse-progress-${today}.pdf`;
