"use client";

import { useDocs, useEngine } from "@/client/sync/react";
import { getSubject } from "@/content";
import { londonToday } from "@/lib/dates";
import { asProgress } from "@/lib/docs";
import {
  decideReview,
  reviewGroups,
  reviewNeeds,
  reviewSuggestion,
  type DailyDoc,
  type QuestionRef,
  type ReviewDoc,
  type SavedAnswer,
} from "@/lib/tracker/study";
import { cn } from "@/ui/cn";

const STATUS_NAME = ["Not done", "Needs work", "Done"] as const;

/** Legacy `renderReview`: what went wrong on today's answers, grouped by point, then the student's decision (legacy `dec`). */
export function WeaknessReview({
  sid,
  daily,
  questions,
  answers,
  review,
  busy,
  error,
  progress,
}: {
  sid: string;
  daily: DailyDoc;
  questions: Readonly<Record<string, (QuestionRef & { q?: string }) | undefined>>;
  answers: Readonly<Record<string, SavedAnswer | undefined>>;
  review: ReviewDoc | undefined;
  busy: boolean;
  error: string;
  progress: unknown;
}) {
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const subject = getSubject(sid);
  const groups = reviewGroups(daily, questions, answers);
  const items = review?.items ?? {};
  const need = reviewNeeds(daily, questions, answers, items);
  const p = asProgress(progress);

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label="Weakness review">
      <h2 className="font-heading text-xl font-semibold">Weakness review</h2>
      {!groups.length ? (
        <p className="mt-2 text-muted">Answer a few of today&apos;s questions first, then I can review them with you.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Each topic shows what went wrong, what was missing and the {subject?.board ?? "AQA"} wording to use. Then you decide: Mastered or Needs more work. My
            suggestion is only a guide.
          </p>
          {busy ? (
            <p className="mt-2 text-sm">
              <b>Reviewing your answers...</b>
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          {need.length && !busy && !error ? (
            <p className="mt-2 text-sm text-muted">
              {need.length} new answer{need.length === 1 ? "" : "s"} to review. Tap Review my weaknesses again.
            </p>
          ) : null}
          {groups.map((g) => {
            const st = p.s[g.pid] ?? 0;
            const auto = reviewSuggestion(p, g.pid);
            return (
              <section key={g.pid} className="mt-5 border-t border-line pt-4" data-review-point={g.pid} aria-label={`Review: ${g.label}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <b>{g.label}</b>
                  <span className="text-sm text-muted">
                    {g.aw}/{g.mx} marks today
                  </span>
                </div>
                {g.aw === g.mx ? <p className="mt-1 text-sm text-muted">Full marks on this point today.</p> : null}
                {g.qs.map((id) => {
                  const a = answers[id];
                  const q = questions[id];
                  if (!a || !q || a.aw >= a.mx) return null;
                  const it = items[id];
                  const text = q.q ?? "";
                  return (
                    <div key={id} className="mt-3 rounded-xl bg-surface-2 p-3 text-sm" data-review-question={id}>
                      <p>
                        {text.length > 130 ? `${text.slice(0, 130)}...` : text}{" "}
                        <i>
                          ({a.aw}/{a.mx})
                        </i>
                      </p>
                      {!it ? (
                        <p className="mt-1 text-muted">{busy ? "Working on this one..." : "Not reviewed yet."}</p>
                      ) : (
                        <>
                          {(it.mistakes ?? []).length ? (
                            <>
                              <h3 className="mt-2 font-semibold">What went wrong</h3>
                              <ul className="ml-5 list-disc">
                                {(it.mistakes ?? []).map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {(it.missing ?? []).length ? (
                            <>
                              <h3 className="mt-2 font-semibold">What you were missing</h3>
                              <ul className="ml-5 list-disc">
                                {(it.missing ?? []).map((x, i) => (
                                  <li key={i}>{x}</li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {(it.terms ?? []).length ? (
                            <>
                              <h3 className="mt-2 font-semibold">{subject?.board ?? "AQA"} terms to use</h3>
                              <ul className="mt-1 flex flex-wrap gap-1.5">
                                {(it.terms ?? []).map((x, i) => (
                                  <li key={i} className="rounded-md border border-line bg-surface px-2 py-0.5">
                                    {x}
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : null}
                          {it.tip ? (
                            <p className="mt-2">
                              <b>Examiner tip:</b> {it.tip}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted">
                    Suggested: <b className="text-fg">{auto}</b> · now marked {STATUS_NAME[st as 0 | 1 | 2] ?? "Not done"}
                  </span>
                  <div role="group" aria-label={`Decide on ${g.label}`} className="inline-flex gap-1 rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-semibold">
                    {(
                      [
                        [2, "Mastered", "bg-done"],
                        [1, "Needs more work", "bg-work"],
                      ] as const
                    ).map(([v, label, fill]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={st === v}
                        disabled={!ready}
                        onClick={() => engine.update(`progress/${sid}`, (doc) => decideReview(doc, g.pid, v, londonToday()))}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 transition active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100",
                          st === v ? `${fill} text-on-fill` : "text-muted hover:bg-subtle hover:text-fg",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}
