"use client";

import { useSession } from "@/client/session";
import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { getSubject, papersFor, type PracticePaper } from "@/content";
import { londonToday, shortDay } from "@/lib/dates";
import { asPapersDone, PAPERS_DONE_PATH, togglePaperDone } from "@/lib/papers-done";
import { buttonClass } from "@/ui/button";
import { cn } from "@/ui/cn";

/** Legacy `renderPapers`: practice paper PDFs grouped by paper, each with Open PDF and Mark attempted. */
export function PapersView({ sid }: { sid: string }) {
  const subject = getSubject(sid);
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const saved = useDoc(PAPERS_DONE_PATH);
  const done = asPapersDone(user ? saved : undefined);
  if (!subject) return null;
  const list = papersFor(subject.id);
  if (!list.length) return <p className="mt-4 text-muted">No practice papers for this subject yet.</p>;

  const groups: { name: string; papers: PracticePaper[] }[] = [];
  for (const p of list) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) groups.push((g = { name: p.group, papers: [] }));
    g.papers.push(p);
  }
  const doneCount = list.filter((p) => done[p.key]).length;
  const marks = list.reduce((a, p) => a + p.marks, 0);

  const toggle = (key: string): void => {
    if (!user) {
      prompt("to tick off practice papers");
      return;
    }
    engine.update(PAPERS_DONE_PATH, (doc) => togglePaperDone(doc, key, londonToday()));
  };

  return (
    <div>
      <h1 className="font-heading text-3xl font-bold tracking-tight">{subject.name} practice papers</h1>
      <div className="mt-4 rounded-2xl border border-line bg-accent-soft p-4 text-sm leading-relaxed" data-testid="papers-intro">
        <b>
          {list.length} practice papers, {marks} marks in total.
        </b>{" "}
        One per topic, covering the whole {subject.board} {subject.name} spec. Each has exam-style questions in the layout of the real paper, followed by the full
        mark scheme and a page of examiner tips. The questions are original, not real past papers. Open one, print it or work on screen, then mark yourself honestly. Tick
        it off here when you have finished ({doneCount}/{list.length} so far).
        {groups.some((g) => /^Calculation/.test(g.name))
          ? " The calculation question sets drill every required equation from grade 4 to grade 9, with a topic formula list at the front and worked answers at the back."
          : ""}
      </div>
      {groups.map((g) => (
        <section key={g.name} className="mt-8" aria-label={g.name}>
          <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-heading text-xl font-semibold">
            <span>{g.name}</span>
            <small className="shrink-0 font-sans text-sm font-medium text-muted">
              {g.papers.filter((p) => done[p.key]).length}/{g.papers.length} attempted
            </small>
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {g.papers.map((p) => {
              const when = done[p.key];
              return (
                <li key={p.key} data-paper={p.key} className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center", when && "bg-done-soft/60")}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-sm text-muted">
                      {p.pages} pages · {p.marks} marks{when ? ` · attempted ${shortDay(when)}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <button
                      type="button"
                      aria-pressed={!!when}
                      disabled={!!user && !ready}
                      onClick={() => toggle(p.key)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition sm:flex-none active:scale-95 disabled:opacity-50 motion-reduce:active:scale-100",
                        when ? "border-transparent bg-done text-on-fill" : "border-line-strong bg-surface hover:bg-subtle",
                      )}
                    >
                      {when ? "Attempted" : "Mark attempted"}
                      <span className="sr-only">: {p.title}</span>
                    </button>
                    <a href={`/${p.url}`} target="_blank" rel="noopener" className={buttonClass("primary", "flex-1 px-3 py-2 sm:flex-none")}>
                      Open PDF<span className="sr-only">: {p.title} (opens in a new tab)</span>
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
