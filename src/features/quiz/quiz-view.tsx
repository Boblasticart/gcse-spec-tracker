"use client";

import { useEffect, useRef, useState } from "react";

import { runAi } from "@/client/ai";
import { useStudyTimer } from "@/client/tracker/study-timer";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { getPoint, getTopic } from "@/content";
import { londonToday } from "@/lib/dates";
import { applyQuizResult, asQuiz, asQuizResult, quizLostPoints, type QuizDoc, type QuizResultDoc } from "@/lib/tracker/study";
import { BackButton, NoteLink } from "@/features/notes/links";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";

/** Quiz answers typed so far, kept while the page is open (legacy `QZDR`). */
const quizDrafts = new Map<string, string[]>();

const pointText = (pid: string): string => getPoint(pid)?.point.text ?? "";

/** Legacy `renderQuiz`: a 10-question topic quiz written by AI, marked by AI; 80% marks the whole topic Done. */
export function QuizView({ tid }: { tid: string }) {
  const ref = getTopic(tid);
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const quiz = asQuiz(useDoc(`quiz/${tid}`));
  const res = asQuizResult(useDoc(`qr/${tid}`));
  const [drafts, setDrafts] = useState<string[]>(() => quizDrafts.get(tid) ?? []);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState("");
  const [retake, setRetake] = useState(false);
  const started = useRef(false);
  useStudyTimer();

  const setDraft = (i: number, v: string): void => {
    setDrafts((d) => {
      const next = [...d];
      next[i] = v;
      quizDrafts.set(tid, next);
      return next;
    });
  };
  const clearDrafts = (): void => {
    quizDrafts.delete(tid);
    setDrafts([]);
  };

  /** Legacy `genQuiz`. */
  const genQuiz = async (): Promise<void> => {
    if (busy || !ref) return;
    setBusy(true);
    setErr("");
    setRetake(false);
    const r = await runAi("writeQuiz", { tid }, "Sign in to take the quiz.");
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    const doc: QuizDoc = { sid: r.result.sid, tid, ts: new Date().toISOString(), qs: r.result.qs };
    clearDrafts();
    engine.update(`quiz/${tid}`, () => doc);
  };

  // Legacy: opening a topic's quiz writes one the first time.
  useEffect(() => {
    if (ready && !quiz && !started.current) {
      started.current = true;
      void genQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first load
  }, [ready, quiz]);

  if (!ref) return null;
  const { subject, topic } = ref;

  /** Legacy `submitQuiz`. */
  const submit = async (): Promise<void> => {
    if (!quiz || marking) return;
    if (!drafts.some((x) => x && x.trim())) {
      setErr("Type at least one answer first.");
      return;
    }
    setMarking(true);
    setErr("");
    const r = await runAi(
      "markQuiz",
      { tid, questions: quiz.qs.map((q) => ({ marks: q.marks, q: q.q, scheme: q.scheme, notes: q.notes || undefined })), answers: quiz.qs.map((_, i) => drafts[i] ?? "") },
      "Sign in to get your answers marked.",
    );
    setMarking(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    const result: QuizResultDoc = { sid: subject.id, tid, qts: quiz.ts, ...r.result, ts: new Date().toISOString() };
    setRetake(false);
    engine.update(`progress/${subject.id}`, (doc) =>
      applyQuizResult(
        doc,
        topic.points.map((p) => p.id),
        result.pass,
        londonToday(),
      ),
    );
    engine.update(`qr/${tid}`, () => result);
  };

  const header = (
    <>
      <BackButton sid={subject.id} />
      <p className="mt-4 text-sm text-muted">
        {subject.board} {subject.name} › {topic.name}
      </p>
      <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">Topic quiz</h1>
      <p className="mt-1 text-sm text-muted">
        Pass mark 80%. Pass and the whole topic is marked Done. Below that it stays Needs work and you see what to re-read.
      </p>
    </>
  );
  const errLine = err ? (
    <span role="alert" className="text-sm text-danger">
      {err}
    </span>
  ) : null;

  if (!quiz) {
    return (
      <article>
        {header}
        {busy || !ready ? (
          <p className="mt-6 text-muted">{busy ? "The AI is writing your quiz. This takes about a minute." : "Opening your quiz..."}</p>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => void genQuiz()}>Start the quiz</Button>
            {errLine}
          </div>
        )}
      </article>
    );
  }

  const showRes = res && res.qts === quiz.ts && !retake;
  if (showRes) {
    const lost = quizLostPoints(quiz, res);
    return (
      <article>
        {header}
        <div className={cn("mt-5 rounded-xl border-l-4 px-4 py-3", res.pass ? "border-done bg-done-soft" : "border-work bg-work-soft")} data-testid="quiz-result">
          <b className="tabular-nums">
            {res.aw}/{res.mx} · {res.pct}%
          </b>{" "}
          {res.pass
            ? "Topic finished. Every point in this topic is now marked Done."
            : "Not finished yet. The points stay on Needs work. Re-read the notes below, then try again."}
        </div>
        {lost.length ? (
          <>
            <h2 className="mt-5 font-semibold">Re-read these notes</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {lost.map((pid) => {
                const t = pointText(pid);
                return (
                  <li key={pid}>
                    <NoteLink pid={pid} className="inline-flex rounded-full border border-line px-3 py-1 text-sm hover:border-accent">
                      {t.length > 46 ? `${t.slice(0, 46)}...` : t}
                    </NoteLink>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
        <div className="mt-5 space-y-4">
          {quiz.qs.map((q, i) => {
            const it = res.items[i];
            const hit = new Set(it?.hit ?? []);
            const aw = it?.aw ?? 0;
            return (
              <article key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
                  <span>
                    Question {i + 1} · {pointText(q.pid)}
                  </span>
                  <span className="tabular-nums">
                    {aw}/{q.marks}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap">{q.q}</p>
                <div className={cn("mt-3 rounded-xl border-l-4 px-4 py-3 text-sm", aw >= q.marks ? "border-done bg-done-soft" : "border-work bg-work-soft")}>
                  <p>
                    <i>Your answer:</i> {it?.ans || "(blank)"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {q.scheme.map((m, j) => (
                      <li key={j} className="flex gap-2">
                        <span aria-hidden className="font-bold">
                          {hit.has(j + 1) ? "✓" : "✗"}
                        </span>
                        <span>
                          <span className="sr-only">{hit.has(j + 1) ? "Got: " : "Missed: "}</span>
                          {m}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {it?.expl ? <p className="mt-2">{it.expl}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setRetake(true);
              clearDrafts();
            }}
          >
            Try this quiz again
          </Button>
          <Button variant="secondary" onClick={() => void genQuiz()} busy={busy}>
            {busy ? "Writing..." : "New quiz"}
          </Button>
          {errLine}
        </div>
      </article>
    );
  }

  const total = quiz.qs.reduce((a, q) => a + q.marks, 0);
  return (
    <article>
      {header}
      <div className="mt-5 space-y-4">
        {quiz.qs.map((q, i) => (
          <article key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
              <span>
                Question {i + 1} · {pointText(q.pid)}
              </span>
              <span>
                {q.marks} mark{q.marks === 1 ? "" : "s"}
              </span>
            </div>
            <label htmlFor={`qz-${i}`} className="mt-2 block whitespace-pre-wrap">
              {q.q}
            </label>
            <textarea
              id={`qz-${i}`}
              rows={q.marks > 3 ? 5 : 3}
              value={drafts[i] ?? ""}
              disabled={marking}
              placeholder="Type your answer"
              onChange={(e) => setDraft(i, e.target.value)}
              className="mt-2 w-full rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm transition focus:border-accent focus:outline-none disabled:opacity-60"
            />
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} busy={marking} disabled={!ready}>
          {marking ? "Marking..." : `Submit quiz (${total} marks)`}
        </Button>
        <Button variant="secondary" onClick={() => void genQuiz()} busy={busy} disabled={marking}>
          {busy ? "Writing..." : "New quiz"}
        </Button>
        {errLine}
      </div>
    </article>
  );
}
