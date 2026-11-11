"use client";

import { useEffect, useMemo, useState } from "react";

import { useDocs } from "@/client/sync/react";
import type { AnswerDoc, QuestionDoc } from "@/features/improve/model";

/** The shared question bank (legacy adapter: data/questions.json merged under the account's `q/*`). */
let bankPromise: Promise<Record<string, QuestionDoc>> | null = null;

function loadBank(): Promise<Record<string, QuestionDoc>> {
  bankPromise ??= fetch("/data/questions.json")
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : {}))
    .then((d) => (d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, QuestionDoc>) : {}))
    .catch(() => {
      bankPromise = null;
      return {};
    });
  return bankPromise;
}

export function useQuestionBank(): Record<string, QuestionDoc> | null {
  const [bank, setBank] = useState<Record<string, QuestionDoc> | null>(null);
  useEffect(() => {
    let live = true;
    void loadBank().then((b) => {
      if (live) setBank(b);
    });
    return () => {
      live = false;
    };
  }, []);
  return bank;
}

/** Every doc in one collection of the account, keyed by id (e.g. `a/*`). */
export function useCollection<T>(collection: string): Record<string, T> {
  const docs = useDocs((s) => s.docs);
  return useMemo(() => {
    const prefix = `${collection}/`;
    const out: Record<string, T> = {};
    for (const [path, entry] of Object.entries(docs)) {
      if (path.startsWith(prefix) && entry.data !== null && entry.data !== undefined) out[path.slice(prefix.length)] = entry.data as T;
    }
    return out;
  }, [docs, collection]);
}

/** The bank with the account's own questions on top (same ids: the account's copy wins, bank order kept). */
export function useQuestions(): { questions: Record<string, QuestionDoc>; loaded: boolean } {
  const bank = useQuestionBank();
  const mine = useCollection<QuestionDoc>("q");
  const questions = useMemo(() => ({ ...(bank ?? {}), ...mine }), [bank, mine]);
  return { questions, loaded: bank !== null };
}

export function useAnswers(): Record<string, AnswerDoc> {
  return useCollection<AnswerDoc>("a");
}
