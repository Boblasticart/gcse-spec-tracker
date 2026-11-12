"use client";

import { useMemo, type ReactNode } from "react";

import { useStudyTimer } from "@/client/tracker/study-timer";
import { useDoc, useDocs } from "@/client/sync/react";
import { useAnswers, useQuestions } from "@/client/tracker/questions";
import { useRestoreScroll } from "@/client/tracker/ui-state";
import { getSubject } from "@/content";
import { londonToday, pct } from "@/lib/dates";
import { asProgress } from "@/lib/docs";
import { NoteLink } from "@/features/notes/links";
import { QuestionCard } from "@/features/questions/question-card";
import { DecisionButtons } from "./decision";

import { improveModel, pointName, reviewMeta } from "./model";

function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-heading text-xl font-semibold">
        <span>{title}</span>
        <small className="shrink-0 font-sans text-sm font-medium text-muted">{note}</small>
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function PointList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line rounded-2xl border border-line bg-surface px-4 text-sm shadow-card">{children}</ul>;
}

/** Legacy `renderImprove`: what needs work, what's ready for a decision, questions to redo and what's mastered. */
export function ImproveView({ sid }: { sid: string }) {
  const subject = getSubject(sid);
  const progress = useDoc(`progress/${sid}`);
  const phase = useDocs((s) => s.phase);
  const today = londonToday();
  const daily = useDoc(`daily/${today}-${sid}`) as { qids?: unknown } | undefined;
  const { questions } = useQuestions();
  const answers = useAnswers();
  useRestoreScroll();
  useStudyTimer();

  const todayQids = useMemo(() => (Array.isArray(daily?.qids) ? daily.qids.map(String) : []), [daily]);
  const model = useMemo(() => improveModel({ sid, progress, questions, answers, todayQids }), [sid, progress, questions, answers, todayQids]);
  if (!subject) return null;
  if (phase !== "ready") return <p className="mt-8 text-center text-muted">Loading your progress...</p>;

  const p = asProgress(progress);
  if (model.empty) {
    return (
      <p className="mt-8 text-center text-muted" data-testid="improve-empty">
        Nothing covered in {subject.name} yet. When you finish a topic with me it appears here as Needs work, with questions to prove it.
      </p>
    );
  }

  const stat = (n: ReactNode, label: string): ReactNode => (
    <div className="rounded-2xl border border-line bg-surface p-4 text-center shadow-card">
      <strong className="block font-heading text-3xl font-bold tabular-nums">{n}</strong>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );

  return (
    <div className="mt-6">
      <div className="grid grid-cols-3 gap-3" data-testid="improve-stats">
        {stat(model.needsWork.length, "need work")}
        {stat(model.mastered.length, "mastered")}
        {stat(model.attempted ? `${pct(model.correct, model.attempted)}%` : "-", "answers correct")}
      </div>

      {model.ready.length ? (
        <Panel title="Ready for your decision" note="3 correct in a row">
          <PointList>
            {model.ready.map((id) => (
              <li key={id} data-point={id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5">
                <span className="min-w-0 flex-1">{pointName(p, id)}</span>
                <DecisionButtons sid={sid} pid={id} label={pointName(p, id)} />
              </li>
            ))}
          </PointList>
        </Panel>
      ) : null}

      <Panel title="Points to improve" note="3 correct in a row, then you decide">
        {model.needsWork.length ? (
          <PointList>
            {model.needsWork.map((id) => (
              <li key={id} data-point={id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5">
                <span className="min-w-0 flex-1">
                  {pointName(p, id)}{" "}
                  <NoteLink pid={id} from="improve" className="ml-1 inline-flex rounded-md border border-line px-1.5 py-0.5 text-xs font-semibold text-accent-text hover:border-accent">
                    Notes<span className="sr-only"> for {pointName(p, id)}</span>
                  </NoteLink>
                </span>
                <span className="text-xs text-muted">{reviewMeta(p.m[id])}</span>
              </li>
            ))}
          </PointList>
        ) : (
          <p className="text-muted">No points need work right now.</p>
        )}
      </Panel>

      <Panel title="Questions to go over again" note={`${model.waiting.length} waiting`}>
        {model.waiting.length ? (
          <div className="space-y-3">
            {model.waiting.map((id) => {
              const q = questions[id];
              return q && q.q ? <QuestionCard key={id} id={id} q={{ ...q, marks: Number(q.marks) || 1, q: q.q }} /> : null;
            })}
          </div>
        ) : (
          <p className="text-muted">All caught up. New misses from your daily questions land here.</p>
        )}
      </Panel>

      {model.mastered.length ? (
        <Panel title="Mastered" note="these come back later to keep them fresh">
          <PointList>
            {model.mastered.map((id) => (
              <li key={id} data-point={id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5">
                <span className="min-w-0 flex-1">{pointName(p, id)}</span>
                <span className="text-xs text-muted">{reviewMeta(p.m[id])}</span>
              </li>
            ))}
          </PointList>
        </Panel>
      ) : null}
    </div>
  );
}
