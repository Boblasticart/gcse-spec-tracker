"use client";

import { useMemo, useState } from "react";

import { runAi } from "@/client/ai";
import { useStudyTimer } from "@/client/tracker/study-timer";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { useAnswers, useQuestions } from "@/client/tracker/questions";
import { getSubject } from "@/content";
import { londonToday, shortDay } from "@/lib/dates";
import { asProgress } from "@/lib/docs";
import {
  asDaily,
  dailyKey,
  newQuestionId,
  reviewNeeds,
  seedPool,
  todayStats,
  type DailyDoc,
  type ReviewDoc,
  type SavedAnswer,
  type StudyQuestion,
} from "@/lib/tracker/study";
import { QuestionCard } from "@/features/questions/question-card";
import { StatusBar } from "@/features/tracker/status-bar";
import { Button } from "@/ui/button";

import { WeaknessReview } from "./weakness-review";

/** The time used in new question ids (read in event handlers only). */
const clockNow = (): number => Date.now();

/** Review panel open per subject while the page is open (legacy `REVOPEN`). */
const reviewOpen = new Set<string>();

/** Legacy `renderToday`: today's 7 exam-style questions for a subject, 7 more, and the weakness review. */
export function TodayView({ sid }: { sid: string }) {
  const subject = getSubject(sid);
  const engine = useEngine();
  const phase = useDocs((s) => s.phase);
  const today = londonToday();
  const key = dailyKey(today, sid);
  const daily = asDaily(useDoc(`daily/${key}`));
  const progress = useDoc(`progress/${sid}`);
  const review = useDoc(`rv/${key}`) as ReviewDoc | undefined;
  const { questions } = useQuestions();
  const answers = useAnswers() as Record<string, SavedAnswer | undefined>;
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [revBusy, setRevBusy] = useState(false);
  const [revErr, setRevErr] = useState("");
  const [revOpen, setRevOpen] = useState(() => reviewOpen.has(sid));
  const stats = useMemo(() => todayStats(daily, answers), [daily, answers]);
  useStudyTimer();

  if (!subject) return null;
  if (phase !== "ready") return <p className="mt-8 text-center text-muted">Loading your questions...</p>;
  const covered = Object.keys(asProgress(progress).s).length > 0;

  const saveDaily = (d: DailyDoc): void => engine.update(`daily/${key}`, () => d);

  /** Legacy `genToday`. */
  const gen = async (append: boolean): Promise<void> => {
    if (genBusy) return;
    if (!covered) {
      setGenErr("Nothing covered yet, so there is nothing to ask about.");
      return;
    }
    setGenBusy(true);
    setGenErr("");
    if (append && daily) {
      const pool = seedPool(questions, answers, sid, daily.qids);
      if (pool.length) {
        saveDaily({ sid, date: today, qids: daily.qids.concat(pool) });
        setGenBusy(false);
        return;
      }
    }
    const r = await runAi("todaysSeven", { sid, today }, "Sign in, then try again.");
    setGenBusy(false);
    if (!r.ok) {
      setGenErr(r.message);
      return;
    }
    const now = clockNow();
    const qids = r.result.questions.map((doc, i) => {
      const id = newQuestionId(today, sid, i + 1, append, now);
      engine.update(`q/${id}`, () => doc);
      return id;
    });
    saveDaily({ sid, date: today, qids: append && daily ? daily.qids.concat(qids) : qids });
  };

  const setOpen = (open: boolean): void => {
    if (open) reviewOpen.add(sid);
    else reviewOpen.delete(sid);
    setRevOpen(open);
  };

  /** Legacy `genReview`. */
  const genReview = async (): Promise<void> => {
    const need = reviewNeeds(daily, questions, answers, review?.items ?? {});
    if (revBusy || !need.length) return;
    setRevBusy(true);
    setRevErr("");
    const items = need.map((id) => {
      const q = questions[id] as StudyQuestion;
      const a = answers[id] as SavedAnswer;
      return { label: q.label ?? "", question: { marks: Number(q.marks) || 1, q: q.q, scheme: q.scheme ?? [], notes: q.notes || undefined }, ans: a.ans, hit: a.hit ?? [], aw: a.aw, mx: a.mx };
    });
    const r = await runAi("reviewWeaknesses", { sid, items }, "Sign in to get your answers reviewed.");
    setRevBusy(false);
    if (!r.ok) {
      setRevErr(r.message);
      return;
    }
    engine.update(`rv/${key}`, (prev) => {
      const have = { ...((prev as ReviewDoc | undefined)?.items ?? {}) };
      r.result.items.forEach((it, i) => {
        const id = need[i];
        if (id && it) have[id] = it;
      });
      return { sid, date: today, items: have, ts: new Date().toISOString() } satisfies ReviewDoc;
    });
  };

  const toggleReview = (): void => {
    const need = reviewNeeds(daily, questions, answers, review?.items ?? {});
    if (revOpen && !need.length) setOpen(false);
    else {
      setOpen(true);
      void genReview();
    }
  };

  if (!daily || !stats) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Today&apos;s 7: {subject.name}</h1>
        <p className="text-sm text-muted">{shortDay(today)}</p>
        <p className="mx-auto mt-3 max-w-prose text-muted">
          {covered
            ? `Today's ${subject.name} questions have not arrived yet. Tap below to write today's set.`
            : `Nothing in ${subject.name} is covered yet, so there are no questions. Once you finish a topic it appears here.`}
        </p>
        {covered ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => void gen(false)} busy={genBusy}>
              {genBusy ? "Writing questions..." : "Write today's 7 now"}
            </Button>
            {genErr ? (
              <span role="alert" className="text-sm text-danger">
                {genErr}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div>
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Today&apos;s 7: {subject.name}</h1>
        <p className="text-sm text-muted">
          {shortDay(today)} · {subject.board} exam-style questions on spec you have covered
        </p>
        <p className="mt-4 flex items-baseline gap-2">
          <strong className="font-heading text-4xl font-bold tabular-nums" data-testid="today-done">
            {stats.done}/{stats.n}
          </strong>
          <span className="text-sm text-muted">
            answered{stats.mx ? ` · ${stats.aw}/${stats.mx} marks` : ""}
          </span>
        </p>
        <StatusBar counts={[stats.n - stats.done, 0, stats.done]} className="mt-3" />
      </section>

      <div className="mt-6 space-y-4">
        {daily.qids.map((id) => {
          const q = questions[id];
          return q && q.q ? <QuestionCard key={id} id={id} q={{ ...q, marks: Number(q.marks) || 1, q: q.q }} /> : null;
        })}
      </div>

      <section className="mt-8 rounded-2xl border border-line bg-surface-2 p-5 text-center">
        <p>
          {stats.done >= stats.n ? "All answered. Want to keep going?" : "Want to get ahead?"} Get 7 more questions on your weak topics in {subject.name}.
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => void gen(true)} busy={genBusy}>
            {genBusy ? "Writing questions..." : "Give me 7 more"}
          </Button>
          <Button variant="secondary" onClick={toggleReview} busy={revBusy}>
            {revBusy ? "Reviewing..." : revOpen ? "Hide review" : "Review my weaknesses"}
          </Button>
          {genErr ? (
            <span role="alert" className="text-sm text-danger">
              {genErr}
            </span>
          ) : null}
        </div>
      </section>

      {revOpen ? (
        <WeaknessReview sid={sid} daily={daily} questions={questions} answers={answers} review={review} busy={revBusy} error={revErr} progress={progress} />
      ) : null}
    </div>
  );
}
