"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/client/session";
import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useDoc, useDocs, useEngine } from "@/client/sync/react";
import { isNoteRead, withNoteRead } from "@/client/tracker/progress";
import { getPoint } from "@/content";
import { normNote } from "@/lib/notes/normalize";
import { Button, buttonClass } from "@/ui/button";
import { cardClass } from "@/ui/card";

import { BackButton, noteHref } from "./links";
import { NoteBody } from "./note-body";

const short = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}...` : s);

export const quizHref = (tid: string): Route => `/quiz/${tid}` as Route;

/**
 * Legacy `renderNote`: the reader frame around one point's notes. The
 * prepared note (from data/notes) arrives already rendered as `children`;
 * otherwise a note the AI wrote for this account (`notes/{pid}`) is shown.
 * Opening a note marks it read (legacy `markViewed`).
 */
export function NoteReader({ pid, prepared, children }: { pid: string; prepared: boolean; children?: ReactNode }) {
  const ref = getPoint(pid);
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const aiNoteRaw = useDoc(`notes/${pid}`);
  const sid = ref?.subject.id ?? "";
  const progressPath = `progress/${sid}`;
  const progress = useDoc(progressPath);
  const hasNote = prepared || aiNoteRaw !== undefined;
  const read = isNoteRead(progress, pid);

  useEffect(() => {
    if (user && ready && hasNote && !read) engine.update(progressPath, (doc) => withNoteRead(doc, pid));
  }, [user, ready, hasNote, read, engine, progressPath, pid]);

  if (!ref) return null;
  const { subject, topic, index } = ref;
  const pts = topic.points;
  const prev = index > 0 ? pts[index - 1] : undefined;
  const next = index < pts.length - 1 ? pts[index + 1] : undefined;
  const readCount = pts.filter((p) => isNoteRead(progress, p.id)).length;

  let body: ReactNode;
  if (prepared) body = children;
  else if (aiNoteRaw !== undefined) {
    const note = normNote(aiNoteRaw);
    body = (
      <>
        <p className="text-sm text-muted">
          {(aiNoteRaw as { src?: unknown }).src === "ai"
            ? "Written by AI when you opened it. Check anything surprising against your spec or textbook."
            : "Prepared notes, written to the specification."}
        </p>
        <NoteBody note={note} />
      </>
    );
  } else {
    body = (
      <div className={cardClass(false, "mt-4 p-5")} data-testid="note-missing">
        <p className="font-medium">There are no prepared notes for this point yet.</p>
        {user ? (
          ready ? (
            <p className="mt-1 text-sm text-muted">Writing notes with AI for points like this one is coming back soon.</p>
          ) : (
            <p className="mt-1 text-sm text-muted">Opening your notes...</p>
          )
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Sign in to see notes saved to your account.</p>
            <Button className="mt-3" onClick={() => prompt("to see your notes")}>
              Sign in
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <article className="pb-4">
      <BackButton sid={sid} />
      <p className="mt-4 text-sm text-muted" data-testid="note-crumb">
        {subject.board} {subject.name} › {topic.name}
        {user ? ` · ${readCount}/${pts.length} read` : ""}
      </p>
      <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight sm:text-3xl">{ref.point.text}</h1>
      <div className="mt-3">{body}</div>
      <nav aria-label="Notes in this topic" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {prev ? (
          <Link href={noteHref(prev.id)} className={buttonClass("ghost")} rel="prev">
            ← {short(prev.text, 38)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={noteHref(next.id)} className={buttonClass("primary")} rel="next">
            Next: {short(next.text, 34)} →
          </Link>
        ) : (
          <Link href={quizHref(topic.id)} className={buttonClass("primary")}>
            Quiz me on this topic
          </Link>
        )}
      </nav>
    </article>
  );
}
