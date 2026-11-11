import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getPoint } from "@/content";
import { normNote, type NoteDoc } from "@/lib/notes/normalize";

/** Where the prepared notes live (the legacy `data/notes/{pid}.json`, never modified). */
const NOTES_DIR = join(process.cwd(), "data", "notes");

/**
 * The prepared note for a spec point, normalised the legacy way, or null if
 * there isn't one. Only known point ids are read, so the path can't escape
 * the notes folder.
 */
export async function readPreparedNote(pid: string): Promise<NoteDoc | null> {
  if (!getPoint(pid)) return null;
  let raw: string;
  try {
    raw = await readFile(join(NOTES_DIR, `${pid}.json`), "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw) as { src?: unknown; ts?: unknown };
    const note = normNote(data);
    if (typeof data.src === "string") note.src = data.src;
    return note;
  } catch {
    return null;
  }
}
