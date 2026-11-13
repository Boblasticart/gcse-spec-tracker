/**
 * Render check for note figures (J2 QA gate, part 2).
 *
 * Draws every figure exactly as the app does (through `cleanSvg`) in a real
 * browser and measures each label. A figure fails if a label is cut off by
 * the edge of the picture, or if two labels overlap.
 *
 *   node scripts/notes/render-check.ts <note.json | topic-shard.json | folder> ...
 *
 * Exit code 1 if any figure fails; the report goes to stdout as JSON lines.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanSvg } from "../../src/lib/notes/svg.ts";

export interface Figure {
  /** Where it came from, e.g. `phy.0.1 figure 2`. */
  id: string;
  svg: string;
}

export interface FigureProblem {
  id: string;
  problem: "cut-off" | "overlap" | "empty";
  detail: string;
}

/** Minimal slice of Playwright's Page, so this file needs no Playwright types to load. */
interface PageLike {
  setContent(html: string): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}

/** How much of the smaller label must be covered before two labels count as overlapping. */
export const OVERLAP_SHARE = 0.3;
/** Pixels a label may poke past the edge before it counts as cut off. */
export const EDGE_PX = 1.5;
/**
 * Labels are measured in Arial-sized text (Liberation Sans has Arial's exact
 * widths and is installed with Playwright's browser on CI), so results are the
 * same on every machine and match most students' devices.
 */
/** Width figures are drawn at (about a phone in landscape / a narrow desktop column). */
export const DRAW_WIDTH = 640;

/** Collects every figure in a note (top-level `svg` and in-section `fig`). */
export function figuresOf(pid: string, note: unknown): Figure[] {
  const n = (note && typeof note === "object" ? note : {}) as { svg?: unknown; core?: unknown };
  const list: unknown[] = [...(Array.isArray(n.svg) ? n.svg : [])];
  if (Array.isArray(n.core)) for (const c of n.core) if (c && typeof c === "object" && Array.isArray((c as { fig?: unknown }).fig)) list.push(...(c as { fig: unknown[] }).fig);
  return list.map((f, i) => ({ id: `${pid} figure ${i + 1}`, svg: String((f as { svg?: unknown } | null)?.svg ?? "") }));
}

export async function checkFigures(page: PageLike, figures: readonly Figure[]): Promise<FigureProblem[]> {
  const cleaned = figures.map((f) => ({ id: f.id, svg: cleanSvg(f.svg) }));
  const problems: FigureProblem[] = cleaned.filter((f) => !f.svg).map((f) => ({ id: f.id, problem: "empty", detail: "not a usable SVG" }));
  const ok = cleaned.filter((f) => f.svg);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:#1b2540;background:#fff}
    figure{margin:0 0 16px;width:${DRAW_WIDTH}px}
    svg{display:block;width:100%;height:auto;overflow:hidden}
  </style></head><body>${ok.map((f, i) => `<figure data-i="${i}">${f.svg}</figure>`).join("")}</body></html>`;
  await page.setContent(html);
  const found = await page.evaluate(
    ({ share, edge }) => {
      const out: { i: number; problem: "cut-off" | "overlap"; detail: string }[] = [];
      document.querySelectorAll("figure").forEach((fig) => {
        const i = Number(fig.getAttribute("data-i"));
        const svg = fig.querySelector("svg");
        if (!svg) return;
        const s = svg.getBoundingClientRect();
        const labels = [...svg.querySelectorAll("text")]
          .filter((t) => (t.textContent ?? "").trim() !== "")
          .map((t) => ({ text: (t.textContent ?? "").trim(), r: t.getBoundingClientRect() }))
          .filter((l) => l.r.width > 0 && l.r.height > 0);
        for (const l of labels) {
          if (l.r.left < s.left - edge || l.r.right > s.right + edge || l.r.top < s.top - edge || l.r.bottom > s.bottom + edge) {
            out.push({ i, problem: "cut-off", detail: `"${l.text}" runs past the edge` });
          }
        }
        for (let a = 0; a < labels.length; a++) {
          for (let b = a + 1; b < labels.length; b++) {
            const p = labels[a]!.r;
            const q = labels[b]!.r;
            const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
            const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
            if (w <= 0 || h <= 0) continue;
            const smaller = Math.min(p.width * p.height, q.width * q.height);
            if ((w * h) / smaller >= share) out.push({ i, problem: "overlap", detail: `"${labels[a]!.text}" overlaps "${labels[b]!.text}"` });
          }
        }
      });
      return out;
    },
    { share: OVERLAP_SHARE, edge: EDGE_PX },
  );
  for (const f of found) problems.push({ id: ok[f.i]!.id, problem: f.problem, detail: f.detail });
  return problems;
}

/** Reads notes from files: a single note `{...}` named `{pid}.json`, or a topic file `{pid: note}`. */
export function readNotes(paths: readonly string[]): Map<string, unknown> {
  const notes = new Map<string, unknown>();
  const add = (file: string): void => {
    const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const name = file.split("/").pop()!.replace(/\.json$/, "");
    if (/^[a-z][a-z0-9_]*\.\d+\.\d+$/.test(name)) notes.set(name, data);
    else for (const [pid, note] of Object.entries(data)) notes.set(pid, note);
  };
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p)) if (f.endsWith(".json") && !f.startsWith("progress") && !f.startsWith("failures")) add(join(p, f));
    } else add(p);
  }
  return notes;
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error("usage: node scripts/notes/render-check.ts <note.json | topic.json | folder> ...");
    process.exit(2);
  }
  type Chromium = { launch(): Promise<{ newPage(): Promise<PageLike>; close(): Promise<void> }> };
  const pw = (await import("@playwright/test")) as unknown as { chromium?: Chromium; default?: { chromium: Chromium } };
  const chromium = (pw.chromium ?? pw.default?.chromium)!;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let failed = 0;
  for (const [pid, note] of readNotes(paths)) {
    const problems = await checkFigures(page, figuresOf(pid, note));
    if (problems.length) failed++;
    console.log(JSON.stringify({ pid, ok: problems.length === 0, problems }));
  }
  await browser.close();
  if (failed) {
    console.error(`render-check: ${failed} note(s) have figure problems`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
