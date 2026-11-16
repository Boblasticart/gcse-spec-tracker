/**
 * The "notes" job: one full revision note per catalogue spec point, saved to
 * content/notes/{spec}/{topic}.json. Every note must pass the quality gate
 * (src/lib/notes/qa.ts) and the figure render check before it is saved.
 */
import { join } from "node:path";

import { CATALOGUE, allPoints, getPoint } from "@/content";
import { COURSE_DEPTH, MINIMUMS, qaNote } from "@/lib/notes/qa";
import { isLegacySpecId, noteShardPath } from "@/lib/notes/store";

import { readJson, writeJson, type Kind } from "../pipeline/engine";
import { buildNotePrompt } from "./prompt";
import { checkFigures, figuresOf } from "./render-check";
import { dropFigures, figureNumbers, repairNote } from "./repair";

/** The owner's order: most popular subject first. */
export const COURSE_ORDER = ["maths", "englang", "englit", "combsci", "biology", "chemistry", "physics", "history", "geography", "rs", "french", "spanish", "cs", "pe", "business"];

interface Browser {
  newPage(): Promise<Parameters<typeof checkFigures>[0]>;
  close(): Promise<void>;
}

/** `dir` = where notes, progress and failures go; `specIds` = only these specs (null = all). */
export function notesKind(dir: string, specIds: readonly string[] | null): Kind {
  const fileOf = (pid: string): string | null => {
    const path = noteShardPath(pid);
    return path ? join(dir, path.replace(/^\/content\/notes\//, "")) : null;
  };

  let browser: Browser | null = null;
  let page: Parameters<typeof checkFigures>[0] | null = null;
  let checking: Promise<unknown> = Promise.resolve();
  /** One render check at a time (one page). The browser starts the first time it is needed. */
  const renderCheck = (pid: string, note: unknown): Promise<string[]> => {
    const run = checking.then(async () => {
      if (!page) {
        const pw = (await import("@playwright/test")) as unknown as { chromium?: { launch(): Promise<Browser> }; default?: { chromium: { launch(): Promise<Browser> } } };
        browser = await (pw.chromium ?? pw.default!.chromium).launch();
        page = await browser.newPage();
      }
      return (await checkFigures(page, figuresOf(pid, note))).map((p) => `${p.id}: ${p.problem}: ${p.detail}`);
    });
    checking = run.catch(() => undefined);
    return run;
  };

  return {
    id: "notes",
    dir,
    items() {
      const out: { id: string; group: string; done: boolean }[] = [];
      const shards = new Map<string, Record<string, unknown>>();
      const specs = [...CATALOGUE].sort((a, b) => COURSE_ORDER.indexOf(a.course) - COURSE_ORDER.indexOf(b.course));
      for (const s of specs) {
        // Legacy specs already have their notes (data/notes): never rewritten.
        if (isLegacySpecId(s.id) || (specIds && !specIds.includes(s.id))) continue;
        for (const p of allPoints(s)) {
          const file = fileOf(p.id);
          if (!file) continue;
          if (!shards.has(file)) shards.set(file, readJson<Record<string, unknown>>(file, {}));
          out.push({ id: p.id, group: s.id, done: shards.get(file)![p.id] !== undefined });
        }
      }
      return out;
    },
    prompt: (pid, errors) => buildNotePrompt(getPoint(pid)!, errors),
    async check(pid, raw, by) {
      const ref = getPoint(pid)!;
      const depth = COURSE_DEPTH[ref.subject.course];
      const { note: fixed, repairs } = repairNote(raw, depth);
      const note = { ...(fixed as Record<string, unknown>), pid, sid: ref.subject.id, v: 2, src: "pre", by, ts: new Date().toISOString() };
      const qa = qaNote(note, { pid, course: ref.subject.course });
      let errors = [...qa.errors];
      if (qa.ok) {
        errors = await renderCheck(pid, note);
        // Diagrams with cut-off or overlapping labels are dropped if enough good ones remain; then everything is checked again.
        if (errors.length && dropFigures(note, figureNumbers(errors), MINIMUMS[depth].figures)) {
          repairs.push(`dropped ${figureNumbers(errors).length} diagrams with label problems`);
          const again = qaNote(note, { pid, course: ref.subject.course });
          errors = again.ok ? await renderCheck(pid, note) : again.errors;
        }
      }
      if (repairs.length) console.log(`[notes] ${pid} repaired: ${repairs.join("; ")}`);
      return { value: note, errors };
    },
    save(pid, value) {
      const file = fileOf(pid)!;
      const shard = readJson<Record<string, unknown>>(file, {});
      shard[pid] = value;
      writeJson(file, shard);
    },
    async close() {
      await checking.catch(() => undefined);
      await browser?.close();
    },
  };
}
