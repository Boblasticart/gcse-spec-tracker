import "server-only";

import { fillPrompt, getPoint, getSubject, getTopic, LEGACY_PROMPTS, pointLabel, type Subject } from "@/content";
import type {
  GeneratedQuestion,
  QuestionIn,
  QuizMarkItem,
  ReviewItem,
  TaskId,
  TaskInput,
  TaskOutput,
} from "@/lib/ai/tasks";
import { pct } from "@/lib/dates";
import type { ProgressDoc } from "@/lib/docs";
import { normNote } from "@/lib/notes/normalize";

import { HttpError } from "../http";
import { AiOutputError, asObject } from "./json";

/** What a task needs besides its input: today's date and the student's saved progress. */
export interface TaskContext {
  today: string;
  progress: (sid: string) => Promise<ProgressDoc>;
}

export interface BuiltPrompt<T extends TaskId> {
  prompt: string;
  /** Turns the parsed model JSON into the task's result (throws AiOutputError on unusable output). */
  finish: (raw: unknown) => TaskOutput<T>;
}

type Builder<T extends TaskId> = (input: TaskInput<T>, ctx: TaskContext) => Promise<BuiltPrompt<T>>;

const subjectOr400 = (sid: string): Subject => {
  const s = getSubject(sid);
  if (!s) throw new HttpError(400, "UNKNOWN_SUBJECT", "That subject isn't in the tracker.");
  return s;
};

/** Legacy `arr`. */
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const clampMarks = (v: unknown, max: number): number => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const numbers = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : []);

/** Legacy mark-scheme listing: "1. point\n2. point" (indent "  " in review and quiz blocks). */
const schemeLines = (scheme: readonly string[], indent = ""): string =>
  scheme.map((m, i) => `${indent}${i + 1}. ${m}`).join("\n");

/**
 * Legacy point choice for Today's 7: every point with a status, needs-work
 * first, then done (so mastered topics come back when nothing is weak),
 * anything not yet due last, earliest due first; repeated up to 7.
 */
export function pickTodayPoints(progress: ProgressDoc, today: string): string[] {
  const S = progress.s;
  const M = progress.m;
  const rank = (id: string): number => (S[id] === 1 ? 0 : 1) + ((M[id]?.d ?? "") > today ? 2 : 0);
  const ids = Object.keys(S).sort((a, b) => rank(a) - rank(b) || (M[a]?.d ?? "").localeCompare(M[b]?.d ?? ""));
  if (!ids.length) return [];
  const pts: string[] = [];
  for (let i = 0; pts.length < 7; i++) pts.push(ids[i % ids.length] as string);
  return pts;
}

const todaysSeven: Builder<"todaysSeven"> = async (input, ctx) => {
  const s = subjectOr400(input.sid);
  const t = input.today ?? ctx.today;
  const progress = await ctx.progress(s.id);
  const pts = pickTodayPoints(progress, t);
  if (!pts.length) throw new HttpError(400, "NOTHING_COVERED", "Nothing covered yet, so there is nothing to ask about.");
  const label = (id: string): string => progress.c[id] || pointLabel(id);
  const listText = pts.map((id, i) => `${i + 1}. ${label(id)}`).join("\n");
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.todaysSeven, [s.board, s.name, s.board, listText]),
    finish: (raw) => {
      const qs = list(asObject(raw).questions)
        .map(asObject)
        .filter((x) => x.q && Array.isArray(x.scheme) && x.scheme.length)
        .slice(0, 7);
      if (qs.length < 5) throw new AiOutputError("Too few questions");
      const questions: GeneratedQuestion[] = qs.map((x, i) => {
        const pid = pts[(Number(x.n) || i + 1) - 1] ?? pts[i] ?? pts[0] ?? "";
        const scheme = (x.scheme as unknown[]).map(String);
        return {
          sid: s.id,
          pid,
          label: label(pid),
          marks: Math.max(1, scheme.length),
          q: String(x.q),
          scheme,
          notes: String(x.notes || ""),
          src: "daily",
          date: t,
        };
      });
      return { date: t, pts, questions };
    },
  };
};

const markAnswer: Builder<"markAnswer"> = async ({ question: q, answer }) => {
  const notesLine = q.notes ? `Examiner notes: ${q.notes}\n` : "";
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.markAnswer, [q.marks, q.q, schemeLines(q.scheme), notesLine, answer, q.marks]),
    finish: (raw) => {
      const r = asObject(raw);
      return { aw: clampMarks(r.awarded, q.marks), hit: numbers(r.hit), expl: String(r.explanation || ""), tip: String(r.tip || "") };
    },
  };
};

const reviewWeaknesses: Builder<"reviewWeaknesses"> = async ({ sid, items }) => {
  const s = subjectOr400(sid);
  const blocks = items
    .map(
      (it, i) =>
        `${i + 1}. Spec point: ${it.label}\nQuestion (${it.question.marks} marks): ${it.question.q}\nMark scheme:\n${schemeLines(it.question.scheme, "  ")}\nStudent answer: ${it.ans}\nMark scheme points earned: ${it.hit.join(", ") || "none"}\nAwarded: ${it.aw}/${it.mx}`,
    )
    .join("\n\n");
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.reviewWeaknesses, [s.board, s.name, s.board, blocks]),
    finish: (raw) => {
      const out: (ReviewItem | null)[] = items.map(() => null);
      for (const x of list(asObject(raw).items).map(asObject)) {
        const i = (Number(x.n) || 0) - 1;
        if (i >= 0 && i < out.length) {
          out[i] = { mistakes: arr(x.mistakes), missing: arr(x.missing), terms: arr(x.terms), tip: String(x.tip || "") };
        }
      }
      return { items: out };
    },
  };
};

const writeNote: Builder<"writeNote"> = async ({ pid }) => {
  const ref = getPoint(pid);
  if (!ref) throw new HttpError(400, "UNKNOWN_POINT", "That spec point isn't in the tracker.");
  const { subject: s, topic, paperName, point } = ref;
  const others = topic.points
    .filter((x) => x.id !== pid)
    .map((x) => x.text)
    .join("; ");
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.writeNote, [
      s.board,
      s.name,
      s.board,
      s.code,
      paperName,
      topic.name,
      point.text,
      others || "none",
      s.board,
      s.board,
    ]),
    finish: (raw) => {
      const note = normNote(raw);
      if (!note.core.length) throw new AiOutputError("Note has no sections");
      return { note: { ...note, src: "ai" } };
    },
  };
};

const writeQuiz: Builder<"writeQuiz"> = async ({ tid }) => {
  const ref = getTopic(tid);
  if (!ref) throw new HttpError(400, "UNKNOWN_TOPIC", "That topic isn't in the tracker.");
  const { subject: s, topic } = ref;
  const listText = topic.points.map((p, i) => `${i + 1}. ${p.text}`).join("\n");
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.writeQuiz, [s.board, s.name, topic.name, s.board, s.code, listText, s.board, s.board]),
    finish: (raw) => {
      const qs = list(asObject(raw).questions)
        .map(asObject)
        .filter((x) => x.q && Array.isArray(x.scheme) && x.scheme.length)
        .slice(0, 12);
      if (qs.length < 6) throw new AiOutputError("Too few quiz questions");
      const pts = topic.points;
      return {
        sid: s.id,
        tid,
        qs: qs.map((x) => {
          const scheme = (x.scheme as unknown[]).map(String);
          return {
            pid: (pts[(Number(x.pt) || 1) - 1] ?? pts[0])?.id ?? "",
            marks: scheme.length,
            q: String(x.q),
            scheme,
            notes: String(x.notes || ""),
          };
        }),
      };
    },
  };
};

const markQuiz: Builder<"markQuiz"> = async ({ tid, questions, answers }) => {
  const ref = getTopic(tid);
  if (!ref) throw new HttpError(400, "UNKNOWN_TOPIC", "That topic isn't in the tracker.");
  const s = ref.subject;
  const ans = (i: number): string => (answers[i] ?? "").trim();
  if (!questions.some((_, i) => ans(i))) throw new HttpError(400, "NO_ANSWERS", "Type at least one answer first.");
  const blocks = questions
    .map(
      (q: QuestionIn, i) =>
        `${i + 1}. Question (${q.marks} marks): ${q.q}\nMark scheme:\n${schemeLines(q.scheme, "  ")}\n${q.notes ? `Examiner notes: ${q.notes}\n` : ""}Student answer: ${ans(i) || "(no answer)"}`,
    )
    .join("\n\n");
  return {
    prompt: fillPrompt(LEGACY_PROMPTS.markQuiz, [s.board, s.name, blocks]),
    finish: (raw) => {
      const replies = list(asObject(raw).items).map(asObject);
      let aw = 0;
      let mx = 0;
      const items: QuizMarkItem[] = questions.map((q, i) => {
        const it = replies.find((x) => Number(x.n) === i + 1) ?? {};
        const a = clampMarks(it.awarded, q.marks);
        aw += a;
        mx += q.marks;
        return { aw: a, hit: numbers(it.hit), expl: String(it.explanation || ""), ans: ans(i) };
      });
      const p = pct(aw, mx);
      return { aw, mx, pct: p, pass: p >= 80, items };
    },
  };
};

export const BUILDERS: { [T in TaskId]: Builder<T> } = {
  todaysSeven,
  markAnswer,
  reviewWeaknesses,
  writeNote,
  writeQuiz,
  markQuiz,
};

/** The legacy error message for each task when the AI fails. */
export const FAILURE_MESSAGES: Readonly<Record<TaskId, string>> = {
  todaysSeven: "Could not write the questions. Try again in a moment.",
  markAnswer: "Marking failed. Try again in a moment.",
  reviewWeaknesses: "Could not write the review. Try again in a moment.",
  writeNote: "Could not write the notes. Try again in a moment.",
  writeQuiz: "Could not write the quiz. Try again in a moment.",
  markQuiz: "Marking failed. Your answers are still here. Try again in a moment.",
};

