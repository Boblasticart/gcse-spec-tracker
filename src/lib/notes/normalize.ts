/** A revision note, in the shape the legacy tracker stores and renders (legacy `normNote`). */

export interface NoteCallout {
  k: string;
  t: string;
  p: string;
}

export interface NoteFigure {
  cap: string;
  svg: string;
}

export interface NoteSection {
  h: string;
  p: string;
  bullets: string[];
  table: { head: string[]; rows: string[][] } | null;
  callouts: NoteCallout[];
  fig: NoteFigure[];
}

export interface NoteExamQuestion {
  q: string;
  marks: number;
  model: string[];
  tip: string;
}

export interface PoemNote {
  w: string;
  n: string;
  k: string;
}

export interface NoteDoc {
  summary: string;
  core: NoteSection[];
  analogy: { t: string; p: string } | null;
  terms: { t: string; d: string }[];
  mistakes: { w: string; r: string }[];
  exam: (NoteExamQuestion | string)[];
  worked: { q: string; steps: string[]; ans: string }[];
  quotes: { q: string; ref: string; a: string; t: string; c: string }[];
  essays: { t: string; q: string; thesis: string; plan: string[]; text: string; why: string[] }[];
  svg: NoteFigure[];
  poem: {
    title: string;
    poet: string;
    year: string;
    pd: boolean;
    how: string;
    stanzas: { label: string; lines: string[]; gist: string; notes: PoemNote[] }[];
  } | null;
  /** "ai" when written by AI on request; prepared notes have no src. */
  src?: string;
  ts?: string;
}

type Obj = Record<string, unknown>;
const A = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const O = (x: unknown): Obj => (x && typeof x === "object" ? (x as Obj) : {});
const S = (x: unknown, fallback = ""): string => (x === undefined || x === null || x === "" ? fallback : String(x));
const list = (x: unknown): string[] => A(x).map(String);

/** Same rules as the legacy `normNote`, but never throws on odd input. */
export function normNote(input: unknown): NoteDoc {
  const r = O(input);
  const analogy = O(r.analogy);
  const poem = O(r.poem);
  const note: NoteDoc = {
    summary: S(r.summary),
    core: A(r.core).map((raw) => {
      const c = O(raw);
      const table = O(c.table);
      return {
        h: S(c.h),
        p: S(c.p),
        bullets: list(c.bullets),
        table: A(table.head).length && A(table.rows).length ? { head: list(table.head), rows: A(table.rows).map(list) } : null,
        callouts: A(c.callouts).map((k) => ({ k: S(O(k).k, "key"), t: S(O(k).t), p: S(O(k).p) })),
        fig: A(c.fig).map((d) => ({ cap: S(O(d).cap), svg: S(O(d).svg) })),
      };
    }),
    analogy: analogy.p ? { t: S(analogy.t, "Analogy"), p: String(analogy.p) } : null,
    terms: A(r.terms).map((t) => ({ t: S(O(t).t), d: S(O(t).d) })),
    mistakes: A(r.mistakes).map((m) => ({ w: S(O(m).w), r: S(O(m).r) })),
    exam: A(r.exam).map((x) =>
      x && typeof x === "object"
        ? { q: S(O(x).q), marks: Number(O(x).marks) || 1, model: list(O(x).model), tip: S(O(x).tip) }
        : String(x),
    ),
    worked: A(r.worked).map((w) => ({ q: S(O(w).q), steps: list(O(w).steps), ans: S(O(w).ans) })),
    quotes: A(r.quotes).map((q) => ({ q: S(O(q).q), ref: S(O(q).ref), a: S(O(q).a), t: S(O(q).t), c: S(O(q).c) })),
    essays: A(r.essays).map((e) => ({
      t: S(O(e).t, "Model essay"),
      q: S(O(e).q),
      thesis: S(O(e).thesis),
      plan: list(O(e).plan),
      text: S(O(e).text),
      why: list(O(e).why),
    })),
    svg: A(r.svg).map((d) => ({ cap: S(O(d).cap), svg: S(O(d).svg) })),
    poem:
      r.poem && typeof r.poem === "object" && A(poem.stanzas).length
        ? {
            title: S(poem.title),
            poet: S(poem.poet),
            year: S(poem.year),
            pd: !!poem.pd,
            how: S(poem.how),
            stanzas: A(poem.stanzas).map((st) => ({
              label: S(O(st).label),
              lines: list(O(st).lines),
              gist: S(O(st).gist),
              notes: A(O(st).notes).map((x) => ({ w: S(O(x).w), n: S(O(x).n), k: S(O(x).k, "lang") })),
            })),
          }
        : null,
  };
  return note;
}
