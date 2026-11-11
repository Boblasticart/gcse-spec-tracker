import type { NoteDoc } from "./normalize";

/** Poem annotation keys and their labels (legacy `PMK`). */
export const POEM_KEYS = { lang: "Language", struct: "Structure", form: "Form", ctx: "Context", big: "Big idea" } as const;
export type PoemKey = keyof typeof POEM_KEYS;

export const isPoemKey = (k: string): k is PoemKey => Object.hasOwn(POEM_KEYS, k);

export type PoemSegment = { text: string } | { text: string; num: number; k: PoemKey };

export interface PoemLine {
  /** Line number to print (every 5th line and the first), or null. */
  no: number | null;
  segments: PoemSegment[];
}

export interface PoemAnnotation {
  num: number;
  k: PoemKey;
  w: string;
  n: string;
}

export interface PoemStanzaLayout {
  label: string;
  /** The annotated lines when the poem is public domain, otherwise null (show the gist instead). */
  lines: PoemLine[] | null;
  gist: string;
  notes: PoemAnnotation[];
}

type Poem = NonNullable<NoteDoc["poem"]>;

/**
 * Legacy `poemHtml` layout: numbers the annotations across the poem, places
 * each one on the first non-overlapping occurrence of its words, and numbers
 * the lines.
 */
export function layoutPoem(p: Poem): PoemStanzaLayout[] {
  let num = 0;
  let ln = 0;
  return p.stanzas.map((s) => {
    const marks: [number, number, number, PoemKey][][] = s.lines.map(() => []);
    const notes: PoemAnnotation[] = [];
    for (const x of s.notes) {
      num++;
      const k: PoemKey = isPoemKey(x.k) ? x.k : "lang";
      let placed = false;
      if (p.pd && x.w) {
        for (let i = 0; i < s.lines.length && !placed; i++) {
          const line = s.lines[i] ?? "";
          let from = 0;
          while (!placed) {
            const j = line.indexOf(x.w, from);
            if (j < 0) break;
            const e = j + x.w.length;
            const row = marks[i] ?? [];
            if (!row.some((m) => j < m[1] && e > m[0])) {
              row.push([j, e, num, k]);
              placed = true;
            } else from = j + 1;
          }
        }
      }
      notes.push({ num, k, w: x.w, n: x.n });
    }

    let lines: PoemLine[] | null = null;
    if (p.pd && s.lines.length) {
      lines = s.lines.map((t, i) => {
        ln++;
        const ms = (marks[i] ?? []).sort((a, b) => a[0] - b[0]);
        const segments: PoemSegment[] = [];
        let c = 0;
        for (const m of ms) {
          if (m[0] > c) segments.push({ text: t.slice(c, m[0]) });
          segments.push({ text: t.slice(m[0], m[1]), num: m[2], k: m[3] });
          c = m[1];
        }
        if (c < t.length) segments.push({ text: t.slice(c) });
        return { no: ln % 5 === 0 || ln === 1 ? ln : null, segments };
      });
    }
    return { label: s.label, lines, gist: s.gist, notes };
  });
}
