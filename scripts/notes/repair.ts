/**
 * Safe, automatic repairs for a generated note, done before the quality gate.
 * Nothing is invented: repairs only rename fields the model mislabelled, tidy
 * stray HTML, and drop broken extras (an incomplete key term, a diagram that
 * can't be drawn) when enough good ones remain. Whatever is left still has to
 * pass the full gate.
 */
import { MINIMUMS, qaFigure, type Depth } from "@/lib/notes/qa";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** First non-empty value among the given field names. */
function pick(o: Obj, names: readonly string[]): unknown {
  for (const n of names) {
    const v = o[n];
    if (Array.isArray(v) ? v.length : text(v)) return v;
  }
  return undefined;
}

const lines = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map(text).filter(Boolean)
    : text(v)
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

/** `<b>x</b>` to `**x**`, and other plain layout tags removed (never touches SVG). */
function tidyText(s: string): string {
  return s
    .replace(/<\/?(b|strong)\s*>/gi, "**")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?(i|em|p|span|div)\s*>/gi, "");
}

function tidyDeep(v: unknown, key = ""): unknown {
  if (key === "svg") return v;
  if (typeof v === "string") return tidyText(v);
  if (Array.isArray(v)) return v.map((x) => tidyDeep(x));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tidyDeep(x, k)]));
  return v;
}

/** Where each figure lives, in the same order the gate and the render check number them (top-level `svg`, then each core section's `fig`). */
function figureSlots(note: Obj): { list: unknown[]; i: number }[] {
  const out: { list: unknown[]; i: number }[] = [];
  const top = arr(note.svg);
  top.forEach((_, i) => out.push({ list: top, i }));
  for (const c of arr(note.core)) {
    if (!isObj(c)) continue;
    const figs = arr(c.fig);
    figs.forEach((_, i) => out.push({ list: figs, i }));
  }
  return out;
}

/** Removes the numbered figures (1-based, gate order). Returns false and changes nothing if fewer than `min` would remain. */
export function dropFigures(note: Obj, numbers: readonly number[], min: number): boolean {
  const slots = figureSlots(note);
  const bad = new Set(numbers.filter((n) => n >= 1 && n <= slots.length));
  if (!bad.size || slots.length - bad.size < min) return false;
  const doomed = new Set(slots.filter((_, i) => bad.has(i + 1)).map((s) => s.list[s.i]));
  if (Array.isArray(note.svg)) note.svg = note.svg.filter((f) => !doomed.has(f));
  for (const c of arr(note.core)) if (isObj(c) && Array.isArray(c.fig)) c.fig = c.fig.filter((f) => !doomed.has(f));
  return true;
}

/** Figure numbers named in gate or render-check messages such as "figure 4: ..." or "maths_aqa_f.1.0 figure 4: ...". */
export function figureNumbers(errors: readonly string[]): number[] {
  return [...new Set(errors.map((e) => /(?:^|\s)figure (\d+):/.exec(e)?.[1]).filter((n): n is string => !!n).map(Number))];
}

/** Repairs a raw note in a copy. `repairs` says what was changed (for the log). */
export function repairNote(raw: unknown, depth: Depth): { note: unknown; repairs: string[] } {
  if (!isObj(raw)) return { note: raw, repairs: [] };
  const repairs: string[] = [];
  const min = MINIMUMS[depth];
  const note = tidyDeep(structuredClone(raw)) as Obj;
  if (JSON.stringify(note) !== JSON.stringify(raw)) repairs.push("removed HTML tags from text");

  // Key terms given as {term: definition}.
  if (isObj(note.terms)) note.terms = Object.entries(note.terms).map(([t, d]) => ({ t, d }));

  /** Rebuilds a list with the right field names and drops items that are still incomplete. */
  const fix = (key: string, build: (o: Obj) => Obj | null, fromText?: (s: string) => Obj | string | null): void => {
    if (!Array.isArray(note[key])) return;
    const before = note[key] as unknown[];
    const after = before.map((v) => (isObj(v) ? build(v) : typeof v === "string" && fromText ? fromText(v.trim()) : null)).filter((v) => v !== null && v !== "");
    if (after.length < before.length) repairs.push(`dropped ${before.length - after.length} incomplete ${key}`);
    note[key] = after;
  };
  fix("terms", (o) => {
    const t = text(pick(o, ["t", "term", "name", "word", "key"]));
    const d = text(pick(o, ["d", "def", "definition", "meaning", "desc", "description"]));
    return t && d ? { ...o, t, d } : null;
  });
  fix("mistakes", (o) => {
    const w = text(pick(o, ["w", "wrong", "mistake", "error", "misconception"]));
    const r = text(pick(o, ["r", "right", "correct", "correction", "fix"]));
    return w && r ? { ...o, w, r } : null;
  });
  fix(
    "exam",
    (o) => {
      const q = text(pick(o, ["q", "question"]));
      const marks = Number(pick(o, ["marks", "mark"]));
      const model = lines(pick(o, ["model", "answer", "ms", "markscheme"]));
      return q && marks > 0 ? { ...o, q, marks, model } : null;
    },
    (s) => s || null, // legacy notes keep exam tips as plain text
  );
  fix("worked", (o) => {
    const q = text(pick(o, ["q", "question", "problem"]));
    const steps = lines(pick(o, ["steps", "working", "solution", "method"]));
    const ans = text(pick(o, ["ans", "answer", "final", "result"]));
    return q && steps.length && ans ? { ...o, q, steps, ans } : null;
  });

  // Empty core sections (no heading or no content) go if enough full ones remain.
  if (Array.isArray(note.core)) {
    const full = note.core.filter((c) => isObj(c) && text(c.h) && (text(c.p) || arr(c.bullets).length > 0 || isObj(c.table)));
    if (full.length < note.core.length && full.length >= min.core) {
      repairs.push(`dropped ${note.core.length - full.length} empty core sections`);
      note.core = full;
    }
  }

  // Figures the gate would reject go if enough good ones remain.
  const bad = figureSlots(note)
    .map((s, i) => (qaFigure(s.list[s.i], `figure ${i + 1}`).errors.length ? i + 1 : 0))
    .filter(Boolean);
  if (bad.length && dropFigures(note, bad, min.figures)) repairs.push(`dropped ${bad.length} broken diagrams`);

  return { note, repairs };
}
