"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useSession } from "@/client/session";
import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { isNoteRead, withStatuses, type PointStatus } from "@/client/tracker/progress";
import { SPEC_FILTERS, uiActions, useRestoreScroll, useUi } from "@/client/tracker/ui-state";
import { getSubject, type Topic } from "@/content";
import { NoteLink } from "@/features/notes/links";
import { quizHref } from "@/features/notes/note-reader";
import { StatusBar } from "@/features/tracker/status-bar";
import { buttonClass } from "@/ui/button";
import { cn } from "@/ui/cn";

import { specRows } from "./model";
import { PointStatusControl } from "./point-status";

const chipClass = (pressed: boolean): string =>
  cn(
    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors active:scale-95 motion-reduce:active:scale-100",
    pressed ? "border-transparent bg-fg text-bg" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg",
  );

/** Legacy `renderSpec`: filters, expand/collapse, papers → topics → points with status, notes and quiz. */
export function SpecView({ sid }: { sid: string }) {
  const subject = getSubject(sid);
  const { user } = useSession();
  const progress = useDoc(`progress/${sid}`);
  const filter = useUi((s) => s.filter);
  const openList = useUi((s) => s.open);
  const expandAll = useUi((s) => s.expandAll);
  const open = useMemo(() => new Set(openList), [openList]);
  useRestoreScroll();
  if (!subject) return null;

  const mine = user ? progress : undefined;
  const { papers, shown } = specRows(subject, mine, filter, open);
  const topicIds = subject.papers.flatMap((p) => p.topics.map((t) => t.id));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Filter spec points">
        {SPEC_FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} className={chipClass(filter === f.id)} onClick={() => uiActions.setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" className={chipClass(false)} onClick={() => uiActions.expandAll(!expandAll, topicIds)}>
          {expandAll ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {shown === 0 ? <p className="mt-8 text-center text-muted">Nothing in this view. Try a different filter.</p> : null}

      {papers.map((paper) => (
        <section key={paper.name} className="mt-8" aria-label={paper.name}>
          <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-heading text-xl font-semibold">
            <span>{paper.name}</span>
            <small className="shrink-0 font-sans text-sm font-medium text-muted">{paper.pctDone}% done</small>
          </h2>
          <div className="mt-3 space-y-2">
            {paper.topics.map((row) => {
              const panelId = `topic-${row.topic.id}`;
              return (
                <div key={row.topic.id} className="rounded-2xl border border-line bg-surface shadow-card" data-topic={row.topic.id}>
                  <button
                    type="button"
                    aria-expanded={row.open}
                    aria-controls={panelId}
                    onClick={() => uiActions.toggleTopic(row.topic.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1 font-medium">{row.topic.name}</span>
                    <span className="text-sm text-muted tabular-nums" data-testid="topic-count">
                      {row.counts[2]}/{row.topic.points.length} done{row.counts[1] ? ` · ${row.counts[1]} to fix` : ""}
                    </span>
                    <StatusBar counts={row.counts} mini className="basis-full" />
                  </button>
                  {row.open ? (
                    <div id={panelId} className="border-t border-line px-4">
                      <ul className="divide-y divide-line text-sm">
                        {row.points.map((p) => (
                          <li key={p.id} data-point={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
                            <span className="min-w-0 flex-1">
                              {p.text}{" "}
                              <NoteLink
                                pid={p.id}
                                from="spec"
                                className="ml-1 inline-flex rounded-md border border-line px-1.5 py-0.5 text-xs font-semibold text-accent-text hover:border-accent"
                              >
                                {user && isNoteRead(progress, p.id) ? "Notes ✓" : "Notes"}
                                <span className="sr-only"> for {p.text}</span>
                              </NoteLink>
                            </span>
                            <PointStatusControl sid={subject.id} pid={p.id} label={p.text} />
                          </li>
                        ))}
                      </ul>
                      <TopicFooter sid={subject.id} topic={row.topic} progress={mine} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Legacy quiz bar and bulk buttons under an open topic. */
function TopicFooter({ sid, topic, progress }: { sid: string; topic: Topic; progress: unknown }) {
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const lastQuiz = useDoc(`qr/${topic.id}`) as { pct?: unknown } | undefined;
  const read = topic.points.filter((x) => isNoteRead(progress, x.id)).length;
  const allRead = read === topic.points.length;
  const pids = topic.points.map((p) => p.id);

  const setAll = (status: PointStatus): void => {
    if (!user) {
      prompt("to track your progress");
      return;
    }
    engine.update(`progress/${sid}`, (doc) => withStatuses(doc, pids, status));
  };

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted" data-testid="quiz-meta">
          {read}/{topic.points.length} notes read
          {user && typeof lastQuiz?.pct === "number" ? ` · last quiz ${lastQuiz.pct}%` : ""}
        </span>
        <Link href={quizHref(topic.id)} className={buttonClass(allRead ? "primary" : "secondary", "px-3 py-1.5")}>
          {allRead ? "Quiz me on this topic" : "Quiz me anyway"}
        </Link>
      </div>
      <div className="mt-2 flex gap-2 text-sm">
        <button type="button" disabled={!!user && !ready} className={buttonClass("ghost", "px-2.5 py-1")} onClick={() => setAll(2)}>
          Mark all done
        </button>
        <button type="button" disabled={!!user && !ready} className={buttonClass("ghost", "px-2.5 py-1 text-muted")} onClick={() => setAll(0)}>
          Reset topic
        </button>
      </div>
    </div>
  );
}
