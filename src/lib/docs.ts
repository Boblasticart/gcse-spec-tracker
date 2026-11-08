/**
 * Tracker document paths and shapes, shared by the server and the browser.
 * Paths and JSON shapes are exactly the legacy tracker's ("progress/phy" = {s,c,m,w,v:2}).
 */

/** Collections the legacy tracker saves, in its export-file order. */
export const LEGACY_COLLECTIONS = ["progress", "a", "daily", "rv", "quiz", "qr", "q", "notes"] as const;

/** New collections added by the rebuild (new things get new names). */
export const NEW_COLLECTIONS = ["papers", "stats"] as const;

/** `meta/applied` records which data/updates.json entries have been applied. Never exported. */
export const ALL_COLLECTIONS = [...LEGACY_COLLECTIONS, ...NEW_COLLECTIONS, "meta"] as const;

export type Collection = (typeof ALL_COLLECTIONS)[number];

const PATH_RE = new RegExp(`^(${ALL_COLLECTIONS.join("|")})/([A-Za-z0-9._:-]{1,160})$`);

export const MAX_DOC_BYTES = 256 * 1024;
export const MAX_BATCH = 200;

export function isDocPath(path: string): boolean {
  return PATH_RE.test(path);
}

export function collectionOf(path: string): Collection | null {
  const m = PATH_RE.exec(path);
  return m ? (m[1] as Collection) : null;
}

export function docId(path: string): string {
  return path.slice(path.indexOf("/") + 1);
}

/** `progress/{sid}` in the legacy shape. */
export interface ProgressDoc {
  /** Status per point id: 1 = needs work, 2 = done (absent = not done). */
  s: Record<string, number>;
  /** Saved label per point id (legacy LBL). */
  c: Record<string, string>;
  /** Spaced-review state per point id. */
  m: Record<string, ReviewState>;
  /** Notes read per point id. */
  w: Record<string, number>;
  v: 2;
}

export interface ReviewState {
  /** Box (0..5) into REVIEW_INTERVALS. */
  b: number;
  /** Times answered. */
  n: number;
  /** Times correct. */
  c: number;
  /** Last answered (YYYY-MM-DD). */
  l?: string;
  /** Next due (YYYY-MM-DD). */
  d?: string;
  /** "Three in a row" prompt pending (1) or not (0). */
  p?: number;
}

export const PROGRESS_MAPS = ["s", "c", "m", "w"] as const;
export type ProgressMap = (typeof PROGRESS_MAPS)[number];

export function emptyProgress(): ProgressDoc {
  return { s: {}, c: {}, m: {}, w: {}, v: 2 };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Reads any stored progress doc, filling missing maps, without dropping unknown fields. */
export function asProgress(data: unknown): ProgressDoc {
  const d = isRecord(data) ? data : {};
  return {
    ...d,
    s: isRecord(d.s) ? (d.s as ProgressDoc["s"]) : {},
    c: isRecord(d.c) ? (d.c as ProgressDoc["c"]) : {},
    m: isRecord(d.m) ? (d.m as ProgressDoc["m"]) : {},
    w: isRecord(d.w) ? (d.w as ProgressDoc["w"]) : {},
    v: 2,
  };
}

/** The legacy export file (`gcse-spec-tracker-export`, version 1). */
export interface ExportFile {
  format: "gcse-spec-tracker-export";
  version: 1;
  exported: string;
  collections: Partial<Record<Collection, Record<string, unknown>>>;
}

export const EXPORT_FORMAT = "gcse-spec-tracker-export";

/** A doc as the API returns it. Deleted docs come back (in deltas) with `data: null`. */
export interface DocDto {
  path: string;
  data: unknown;
  version: number;
  deleted: boolean;
  updatedAt: string;
}

/** One change sent to PUT /api/docs. */
export interface DocChangeIn {
  path: string;
  /** `null` deletes the doc. */
  data: unknown;
  /** The version this change was made on top of (0 when the doc did not exist). */
  baseVersion: number;
}

export type ChangeResult =
  | { path: string; status: "ok"; version: number; updatedAt: string }
  | { path: string; status: "conflict"; server: DocDto | null };
