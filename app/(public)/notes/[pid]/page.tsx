import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPoint } from "@/content";
import { NoteBody } from "@/features/notes/note-body";
import { NoteReader } from "@/features/notes/note-reader";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { noteShardPath } from "@/lib/notes/store";
import { readPreparedNote } from "@/server/notes";

export async function generateMetadata({ params }: PageProps<"/notes/[pid]">): Promise<Metadata> {
  const ref = getPoint((await params).pid);
  return { title: ref ? `${ref.point.text} notes` : "Notes" };
}

/** Notes reader for one spec point (legacy view `note`). Prepared notes are public; read ticks need an account. */
export default async function NotesPage({ params }: PageProps<"/notes/[pid]">) {
  const { pid } = await params;
  const ref = getPoint(pid);
  if (!ref) notFound();
  // Catalogue specs: the browser loads the note from a static file. Legacy specs: read here.
  const shard = noteShardPath(pid);
  const note = shard ? null : await readPreparedNote(pid);
  return (
    <TrackerShell subject={ref.subject} view="spec" reader>
      <NoteReader pid={pid} prepared={!!note} shard={shard}>
        {note ? (
          <>
            <p className="text-sm text-muted">
              {note.src === "ai"
                ? "Written by AI when you opened it. Check anything surprising against your spec or textbook."
                : "Prepared notes, written to the specification."}
            </p>
            <NoteBody note={note} />
          </>
        ) : null}
      </NoteReader>
    </TrackerShell>
  );
}
