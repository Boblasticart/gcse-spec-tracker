/**
 * The AI tasks the tracker can ask for, with their inputs (checked on the
 * server with zod) and their results. Each maps to one legacy prompt.
 */
import { z } from "zod";

import type { PromptId } from "@/content/types";
import type { NoteDoc } from "@/lib/notes/normalize";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Dates must look like 2026-11-08." });
const text = (max: number) => z.string().max(max);

/** A question with its mark scheme, as stored in `q/*` and `quiz/*`. */
export const questionSchema = z.object({
  marks: z.number().int().min(1).max(20),
  q: text(4000),
  scheme: z.array(text(1000)).max(20),
  notes: text(2000).optional(),
});

export type QuestionIn = z.infer<typeof questionSchema>;

export const taskSchemas = {
  /** Today's 7 for a subject: the server picks the points from the student's saved progress. */
  todaysSeven: z.object({ sid: z.string(), today: day.optional() }),
  markAnswer: z.object({ question: questionSchema, answer: text(6000).min(1) }),
  reviewWeaknesses: z.object({
    sid: z.string(),
    items: z
      .array(
        z.object({
          label: text(400),
          question: questionSchema,
          ans: text(6000),
          hit: z.array(z.number()).max(20),
          aw: z.number().min(0).max(20),
          mx: z.number().min(0).max(20),
        }),
      )
      .min(1)
      .max(30),
  }),
  writeNote: z.object({ pid: z.string() }),
  writeQuiz: z.object({ tid: z.string() }),
  markQuiz: z.object({
    tid: z.string(),
    questions: z.array(questionSchema).min(1).max(12),
    answers: z.array(text(6000)).max(12),
  }),
} satisfies Record<PromptId, z.ZodType>;

export type TaskId = keyof typeof taskSchemas;
export type TaskInput<T extends TaskId> = z.infer<(typeof taskSchemas)[T]>;

export const TASK_IDS = Object.keys(taskSchemas) as TaskId[];

/** A generated question (legacy `q/*` doc, without the id). */
export interface GeneratedQuestion {
  sid: string;
  pid: string;
  label: string;
  marks: number;
  q: string;
  scheme: string[];
  notes: string;
  src: "daily";
  date: string;
}

export interface MarkResult {
  aw: number;
  hit: number[];
  expl: string;
  tip: string;
}

export interface ReviewItem {
  mistakes: string[];
  missing: string[];
  terms: string[];
  tip: string;
}

export interface QuizQuestion {
  pid: string;
  marks: number;
  q: string;
  scheme: string[];
  notes: string;
}

export interface QuizMarkItem {
  aw: number;
  hit: number[];
  expl: string;
  ans: string;
}

export interface TaskOutputs {
  todaysSeven: { date: string; pts: string[]; questions: GeneratedQuestion[] };
  markAnswer: MarkResult;
  /** One entry per input item, in order; null where the AI said nothing. */
  reviewWeaknesses: { items: (ReviewItem | null)[] };
  writeNote: { note: NoteDoc };
  writeQuiz: { sid: string; tid: string; qs: QuizQuestion[] };
  markQuiz: { aw: number; mx: number; pct: number; pass: boolean; items: QuizMarkItem[] };
}

export type TaskOutput<T extends TaskId> = TaskOutputs[T];
