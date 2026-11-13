/**
 * The quality gate every generated note must pass before it is committed
 * (J2). It checks the note's shape and size, runs every figure through the
 * same SVG sanitiser the app uses, does a quick static check that figure
 * labels sit inside the picture, and asks for enough depth for the subject.
 * (The Playwright render check for overlapping labels runs separately.)
 */
import type { CourseId } from "@/content/types";

import { NOTE_SVG_TAGS, cleanSvg, parseXml, type XmlElement } from "./svg";

export type Depth = "diagram" | "some" | "text";

/** Diagrams expected for science, maths, CS, geography and PE; fewer for the rest. */
export const COURSE_DEPTH: Readonly<Record<CourseId, Depth>> = {
  physics: "diagram",
  biology: "diagram",
  chemistry: "diagram",
  combsci: "diagram",
  maths: "diagram",
  cs: "diagram",
  geography: "diagram",
  pe: "diagram",
  business: "some",
  englit: "text",
  englang: "text",
  history: "text",
  rs: "text",
  french: "text",
  spanish: "text",
};

interface Minimums {
  summary: number;
  core: number;
  terms: number;
  mistakes: number;
  exam: number;
  worked: number;
  figures: number;
  bytes: number;
}

export const MINIMUMS: Readonly<Record<Depth, Minimums>> = {
  diagram: { summary: 200, core: 8, terms: 10, mistakes: 6, exam: 8, worked: 2, figures: 3, bytes: 20_000 },
  some: { summary: 200, core: 6, terms: 8, mistakes: 5, exam: 6, worked: 1, figures: 1, bytes: 12_000 },
  text: { summary: 120, core: 4, terms: 6, mistakes: 4, exam: 4, worked: 0, figures: 0, bytes: 6_000 },
};

export const MAX_NOTE_BYTES = 120_000;
export const MAX_FIGURE_BYTES = 30_000;
/** Labels may sit this far outside the viewBox before they count as cut off. */
const EDGE_SLACK = 2;

export interface QaResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const HTML_TAG = /<\/?(script|style|iframe|img|a|div|span|p|b|i|br|svg|object|embed)\b[^>]*>/i;

function elements(node: XmlElement, out: XmlElement[] = []): XmlElement[] {
  out.push(node);
  for (const c of node.children) if (c.kind === "element") elements(c, out);
  return out;
}

const attr = (el: XmlElement, k: string): string | undefined => el.attrs.find(([n]) => n === k)?.[1];

/** Checks one figure: sanitiser keeps it whole, it has a caption, and its labels start inside the picture. */
export function qaFigure(fig: unknown, where: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const f = isObj(fig) ? fig : {};
  const svg = str(f.svg);
  if (!str(f.cap).trim()) errors.push(`${where}: figure has no caption`);
  if (svg.length > MAX_FIGURE_BYTES) errors.push(`${where}: figure is ${svg.length} bytes (max ${MAX_FIGURE_BYTES})`);
  const root = parseXml(svg);
  if (!root || root.name !== "svg" || !cleanSvg(svg)) {
    errors.push(`${where}: figure is not a usable SVG`);
    return { errors, warnings };
  }
  const all = elements(root);
  const dropped = [...new Set(all.map((e) => e.name).filter((n) => !NOTE_SVG_TAGS.has(n)))];
  if (dropped.length) errors.push(`${where}: the sanitiser would drop <${dropped.join(">, <")}>`);
  const vb = (attr(root, "viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n)) || vb[2]! <= 0 || vb[3]! <= 0) {
    errors.push(`${where}: figure needs a viewBox like "0 0 400 240"`);
    return { errors, warnings };
  }
  const [minX, minY, w, h] = vb as [number, number, number, number];
  const texts = all.filter((e) => e.name === "text");
  if (texts.length === 0) warnings.push(`${where}: figure has no labels`);
  for (const t of texts) {
    if (attr(t, "transform")) continue; // rotated labels are left to the render check
    const x = Number(attr(t, "x") ?? "0");
    const y = Number(attr(t, "y") ?? "0");
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX - EDGE_SLACK || x > minX + w + EDGE_SLACK || y < minY - EDGE_SLACK || y > minY + h + EDGE_SLACK) {
      errors.push(`${where}: label at (${x}, ${y}) is outside the picture`);
    }
  }
  return { errors, warnings };
}

/** Runs the whole gate on one note (raw JSON as Gemini wrote it). */
export function qaNote(raw: unknown, opts: { pid: string; course: CourseId }): QaResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["note is not a JSON object"], warnings };
  const min = MINIMUMS[COURSE_DEPTH[opts.course]];
  const bytes = new TextEncoder().encode(JSON.stringify(raw)).length;

  if (raw.pid !== undefined && raw.pid !== opts.pid) errors.push(`pid is ${String(raw.pid)}, expected ${opts.pid}`);
  if (bytes > MAX_NOTE_BYTES) errors.push(`note is ${bytes} bytes (max ${MAX_NOTE_BYTES})`);
  if (bytes < min.bytes) errors.push(`note is only ${bytes} bytes (expected at least ${min.bytes})`);

  const summary = str(raw.summary);
  if (summary.length < min.summary) errors.push(`summary is ${summary.length} characters (expected at least ${min.summary})`);

  const core = arr(raw.core);
  if (core.length < min.core) errors.push(`${core.length} core sections (expected at least ${min.core})`);
  core.forEach((c, i) => {
    const s = isObj(c) ? c : {};
    if (!str(s.h).trim()) errors.push(`core ${i + 1}: no heading`);
    if (!str(s.p).trim() && arr(s.bullets).length === 0 && !isObj(s.table)) errors.push(`core ${i + 1}: no text`);
  });

  const count = (key: string, need: number, ok: (v: Obj) => boolean, label: string): void => {
    const items = arr(raw[key]);
    const good = items.filter((v) => isObj(v) && ok(v)).length;
    if (good < items.length) errors.push(`${items.length - good} ${label} are incomplete`);
    if (items.length < need) errors.push(`${items.length} ${label} (expected at least ${need})`);
  };
  count("terms", min.terms, (t) => !!str(t.t) && !!str(t.d), "key terms");
  count("mistakes", min.mistakes, (m) => !!str(m.w) && !!str(m.r), "common mistakes");
  count("exam", min.exam, (x) => !!str(x.q) && Number(x.marks) > 0, "exam questions");
  count("worked", min.worked, (w) => !!str(w.q) && arr(w.steps).length > 0 && !!str(w.ans), "worked examples");

  const figures = [...arr(raw.svg), ...core.flatMap((c) => (isObj(c) ? arr(c.fig) : []))];
  if (figures.length < min.figures) errors.push(`${figures.length} diagrams (expected at least ${min.figures})`);
  figures.forEach((f, i) => {
    const r = qaFigure(f, `figure ${i + 1}`);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });

  // Text is shown as text, never as HTML: stray tags mean the model got the format wrong.
  const text = JSON.stringify({ ...raw, svg: undefined, core: core.map((c) => (isObj(c) ? { ...c, fig: undefined } : c)) });
  if (HTML_TAG.test(text)) errors.push("text contains HTML tags");

  return { ok: errors.length === 0, errors, warnings };
}
