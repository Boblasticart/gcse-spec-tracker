"use client";

import { useState } from "react";

import { runAi } from "@/client/ai";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { londonToday } from "@/lib/dates";
import { asProgress } from "@/lib/docs";
import { answerDoc, recordResult, type SavedAnswer, type StudyQuestion } from "@/lib/tracker/study";
import { DecisionButtons } from "@/features/improve/decision";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";

/** Typed-answer drafts, kept while the page is open (legacy `DR`). */
const drafts = new Map<string, string>();

/**
 * Legacy `qcard`: one exam-style question. Type an answer, have it marked
 * against the mark scheme (legacy `submitQ`), see which marking points you
 * hit, try again, and decide on the point after three correct in a row.
 */
export function QuestionCard({ id, q }: { id: string; q: StudyQuestion }) {
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const saved = useDoc(`a/${id}`) as SavedAnswer | undefined;
  const progress = useDoc(`progress/${q.sid ?? ""}`);
  const [draft, setDraft] = useState(() => drafts.get(id) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(false);
  const showForm = !saved || retry;
  const marks = Number(q.marks) || 0;

  const submit = async (): Promise<void> => {
    const ans = draft.trim();
    if (!ans) {
      setErr("Type an answer first.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await runAi("markAnswer", { question: { marks, q: q.q, scheme: q.scheme ?? [], notes: q.notes || undefined }, answer: ans }, "Sign in to get your answers marked.");
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    const today = londonToday();
    engine.update(`a/${id}`, (prev) => answerDoc(q, ans, r.result, prev, new Date().toISOString()));
    if (q.sid && q.pid) engine.update(`progress/${q.sid}`, (doc) => recordResult(doc, q, r.result.aw, marks, today));
    drafts.delete(id);
    setDraft("");
    setRetry(false);
  };

  const p = asProgress(progress);
  const pid = q.pid ?? "";
  const canDecide = !!q.sid && !!pid && !!p.m[pid]?.p && p.s[pid] === 1;
  const hit = new Set(saved?.hit ?? []);

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 shadow-card" data-question={id} aria-label={`Question: ${q.q.slice(0, 60)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
        <span>{q.label ?? ""}</span>
        <span>
          {marks} mark{marks === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{q.q}</p>

      {showForm ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`ans-${id}`}>
            Your answer
          </label>
          <textarea
            id={`ans-${id}`}
            rows={4}
            value={draft}
            disabled={busy}
            placeholder="Type your answer here"
            onChange={(e) => {
              setDraft(e.target.value);
              drafts.set(id, e.target.value);
            }}
            className="w-full rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-sm transition focus:border-accent focus:outline-none disabled:opacity-60"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} busy={busy} disabled={!ready}>
              {busy ? "Marking..." : "Submit for marking"}
            </Button>
            {retry ? (
              <Button variant="ghost" onClick={() => setRetry(false)}>
                Cancel
              </Button>
            ) : null}
            {err ? (
              <span role="alert" className="text-sm text-danger">
                {err}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {saved ? (
        <div
          className={cn("mt-3 rounded-xl border-l-4 px-4 py-3", saved.ok ? "border-done bg-done-soft" : "border-work bg-work-soft")}
          data-testid="mark-result"
        >
          <p>
            <b className="tabular-nums">
              {saved.aw}/{saved.mx}
            </b>{" "}
            <span>{saved.ok ? "Correct. Moving on." : "Not there yet. Here is what the mark scheme wanted."}</span>
          </p>
          <p className="mt-1 text-sm">
            <i>Your answer:</i> {saved.ans}
          </p>
          <ul className="mt-2 space-y-1 text-sm" aria-label="Mark scheme">
            {(q.scheme ?? []).map((m, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="font-bold">
                  {hit.has(i + 1) ? "✓" : "✗"}
                </span>
                <span>
                  <span className="sr-only">{hit.has(i + 1) ? "Got: " : "Missed: "}</span>
                  {m}
                </span>
              </li>
            ))}
          </ul>
          {saved.expl ? <p className="mt-2 text-sm">{saved.expl}</p> : null}
          {saved.tip ? (
            <p className="mt-2 text-sm">
              <b>Common mistake:</b> {saved.tip}
            </p>
          ) : null}
          {!retry && !saved.ok ? (
            <Button variant="secondary" className="mt-3" onClick={() => setRetry(true)}>
              Try it again
            </Button>
          ) : null}
          {canDecide ? (
            <div className="mt-3 rounded-xl border border-line bg-surface p-3">
              <p className="text-sm">
                <b>Three correct in a row on this point.</b> Class it as mastered, or keep practising?
              </p>
              <div className="mt-2">
                <DecisionButtons sid={q.sid ?? ""} pid={pid} label={q.label ?? pid} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
