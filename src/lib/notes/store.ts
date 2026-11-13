/**
 * Where prepared notes live.
 *
 * - The eight legacy specs: `data/notes/{pid}.json` (never modified), read by the server.
 * - Every catalogue spec: `content/notes/{specId}/{topicIndex}.json`, one file per topic
 *   holding `{ [pid]: note }`. These are copied to `public/` at build time and served as
 *   static files from the CDN, and the browser loads them, so the ~300 MB of notes never
 *   goes into the server bundle.
 */
import { LEGACY_COURSE } from "@/content/catalogue";

export const NOTES_URL_PREFIX = "/content/notes";

const PID_RE = /^([a-z][a-z0-9_]{1,40})\.(\d{1,4})\.(\d{1,4})$/;

export function isLegacySpecId(specId: string): boolean {
  return Object.hasOwn(LEGACY_COURSE, specId);
}

/** The static file holding a catalogue point's note, or null for legacy points and bad ids. */
export function noteShardPath(pid: string): string | null {
  const m = PID_RE.exec(pid);
  if (!m || isLegacySpecId(m[1]!)) return null;
  return `${NOTES_URL_PREFIX}/${m[1]}/${m[2]}.json`;
}
