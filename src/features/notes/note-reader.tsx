"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { runAi } from "@/client/ai";

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
/** A catalogue note from its static topic file: undefined while loading, null if there isn't one. */
function useShardNote(shard: string | null | undefined, pid: string): unknown {
  const [state, setState] = useState<{ key: string; note: unknown }>({ key: "", note: undefined });
  const key = shard ? `${shard}#${pid}` : "";
  useEffect(() => {
    if (!shard) return;
    let live = true;
    fetch(shard)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : {}))
      .catch(() => ({}) as Record<string, unknown>)
      .then((all) => {
        if (live) setState({ key, note: all && typeof all === "object" && pid in all ? all[pid] : null });
      });
    return () => {
      live = false;
    };
  }, [shard, pid, key]);
  if (!shard) return null;
  return state.key === key ? state.note : undefined;
}

export function NoteReader({ pid, prepared, shard, children }: { pid: string; prepared: boolean; shard?: string | null; children?: ReactNode }) {
  const ref = getPoint(pid);
  const { user } = useSession();
  const prompt = useSignInPrompt();
  const engine = useEngine();
  const ready = useDocs((s) => s.phase === "ready");
  const aiNoteRaw = useDoc(`notes/${pid}`);
  const sid = ref?.subject.id ?? "";
  const progressPath = `progress/${sid}`;
  const progress = useDoc(progressPath);
  const shardNote = useShardNote(shard, pid);
  const shardLoading = shardNote === undefined;
  const hasNote = prepared || aiNoteRaw !== undefined || (shardNote !== undefined && shardNote !== null);
  const read = isNoteRead(progress, pid);

  useEffect(() => {
    if (user && ready && hasNote && !read) engine.update(progressPath, (doc) => withNoteRead(doc, pid));
  }, [user, ready, hasNote, read, engine, progressPath, pid]);

  // Legacy `genNote` / `wnote`: with no prepared note, the AI writes one and it is saved to the account.
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tried = useRef<string | null>(null);
  const writeNote = async (): Promise<void> => {
    setBusy(true);
    setErr("");
    const r = await runAi("writeNote", { pid }, "Sign in to have notes written.");
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return;
    }
    engine.update(`notes/${pid}`, () => ({ ...r.result.note, src: "ai", ts: new Date().toISOString() }));
  };
  useEffect(() => {
    if (user && ready && !hasNote && !shardLoading && tried.current !== pid) {
      tried.current = pid;
      void writeNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per point
  }, [user, ready, hasNote, shardLoading, pid]);

  if (!ref) return null;
  const { subject, topic, index } = ref;
  const pts = topic.points;
  const prev = index > 0 ? pts[index - 1] : undefined;
  const next = index < pts.length - 1 ? pts[index + 1] : undefined;
  const readCount = pts.filter((p) => isNoteRead(progress, p.id)).length;

  let body: ReactNode;
  if (prepared) body = children;
  else if (shardNote !== undefined && shardNote !== null) {
    body = (
      <>
        <p className="text-sm text-muted">Prepared notes, written to the specification.</p>
        <NoteBody note={normNote(shardNote)} />
      </>
    );
  } else if (shardLoading) {
    body = <p className="text-sm text-muted">Loading notes...</p>;
  } else if (aiNoteRaw !== undefined) {
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
        <p className="font-medium">There are no prepared notes for this point yet{user ? ", so the AI will write some for you." : "."}</p>
        {user ? (
          busy ? (
            <p className="mt-1 text-sm text-muted">The AI is writing these notes. This takes about a minute.</p>
          ) : err ? (
            <>
              <p className="mt-1 text-sm text-muted">These notes did not load.</p>
              <p role="alert" className="mt-1 text-sm text-danger">
                {err}
              </p>
              <Button className="mt-3" onClick={() => void writeNote()}>
                Try again
              </Button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Getting your notes ready.</p>
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
