import "server-only";

import type { TaskId, TaskInput } from "@/lib/ai/tasks";

import type { Model } from "./model";

/** Test-only: allowed when AI_MOCK=1 and never on Vercel. */
export function mockAllowed(): boolean {
  return process.env.AI_MOCK === "1" && !process.env.VERCEL;
}

/** An answer counts as right in the mock if it contains the word "correct". */
const isRight = (s: string): boolean => /\bcorrect\b/i.test(s);

/**
 * A predictable stand-in for Gemini, used by e2e tests. It answers each task
 * with JSON in the shape the legacy prompt asks for.
 */
export const mockModel: Model = async ({ task, input }) => {
  const reply = (v: unknown): string => JSON.stringify(v);
  switch (task as TaskId) {
    case "todaysSeven":
      return reply({
        questions: Array.from({ length: 7 }, (_, i) => ({
          n: i + 1,
          marks: 2,
          q: `Mock question ${i + 1}: explain this spec point.`,
          scheme: [`First marking point ${i + 1}`, `Second marking point ${i + 1}`],
          notes: "Allow equivalent wording.",
        })),
      });
    case "markAnswer": {
      const { question, answer } = input as TaskInput<"markAnswer">;
      const right = isRight(answer);
      return reply({
        awarded: right ? question.marks : 0,
        hit: right ? question.scheme.map((_, i) => i + 1) : [],
        explanation: right ? "" : "Mention both marking points from the mark scheme.",
        tip: "Use the key terms from the mark scheme.",
      });
    }
    case "reviewWeaknesses": {
      const { items } = input as TaskInput<"reviewWeaknesses">;
      return reply({
        items: items.map((_, i) => ({
          n: i + 1,
          mistakes: ["You missed a marking point."],
          missing: ["The key idea from the mark scheme."],
          terms: ["key term"],
          tip: "Learn the definition word for word.",
        })),
      });
    }
    case "writeNote":
      return reply({
        summary: "Mock revision note.",
        core: [{ h: "The key idea", p: "A **mock** explanation.", bullets: ["First fact", "Second fact"], callouts: [{ k: "key", t: "Must know", p: "The main fact." }] }],
        terms: [{ t: "Term", d: "Definition." }],
        mistakes: [{ w: "Wrong idea", r: "Right idea" }],
        exam: [{ q: "Explain the idea.", marks: 2, model: ["Point one", "Point two"], tip: "Be precise." }],
        worked: [],
      });
    case "writeQuiz":
      return reply({
        questions: Array.from({ length: 10 }, (_, i) => ({
          pt: 1,
          marks: 2,
          q: `Mock quiz question ${i + 1}.`,
          scheme: ["Marking point A", "Marking point B"],
          notes: "",
        })),
      });
    case "markQuiz": {
      const { questions, answers } = input as TaskInput<"markQuiz">;
      return reply({
        items: questions.map((q, i) => ({
          n: i + 1,
          awarded: isRight(answers[i] ?? "") ? q.marks : 0,
          hit: isRight(answers[i] ?? "") ? q.scheme.map((_, j) => j + 1) : [],
          explanation: isRight(answers[i] ?? "") ? "" : "Give both marking points.",
        })),
      });
    }
  }
};
