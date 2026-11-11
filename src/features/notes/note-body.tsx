import { Fragment, type ReactNode } from "react";

import type { NoteDoc, NoteFigure } from "@/lib/notes/normalize";
import { layoutPoem, POEM_KEYS } from "@/lib/notes/poem";
import { cleanSvg } from "@/lib/notes/svg";
import { cn } from "@/ui/cn";

/**
 * The legacy note renderer (`noteHtml` + `poemHtml`) as React. It has no
 * hooks, so it renders on the server for prepared notes and in the browser
 * for notes saved to the account. Text is never injected as HTML; the only
 * raw markup is figure SVG, which goes through the allowlist sanitiser.
 */

/** Legacy `fi`: plain text with `**bold**`. */
export function Rich({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<b key={i++}>{m[1]}</b>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

const CALLOUT_LABELS = { def: "Definition", key: "Key point", tip: "Exam tip", warn: "Watch out" } as const;
type CalloutKind = keyof typeof CALLOUT_LABELS;
const calloutKind = (k: string): CalloutKind => (k in CALLOUT_LABELS ? (k as CalloutKind) : "key");

const CALLOUT_STYLE: Record<CalloutKind, string> = {
  def: "border-accent bg-accent-soft",
  key: "border-done bg-done-soft",
  tip: "border-accent bg-surface-2",
  warn: "border-work bg-work-soft",
};

function Callout({ kind, title, children }: { kind: CalloutKind; title: string; children: ReactNode }) {
  return (
    <div data-callout={kind} className={cn("my-3 rounded-r-xl border-l-4 px-4 py-3", CALLOUT_STYLE[kind])}>
      <b className="block text-sm">{title}</b>
      <div className="mt-1 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 mb-2 font-heading text-lg font-semibold tracking-tight">{children}</h2>;
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 font-semibold">{children}</h3>;
}

function Figure({ fig }: { fig: NoteFigure }) {
  const svg = cleanSvg(fig.svg);
  if (!svg) return null;
  return (
    <figure className="note-fig my-4 rounded-xl border border-line bg-surface p-3">
      {/* Safe: cleanSvg rebuilds the SVG from an allowlist and escapes every value. */}
      {/* Diagrams were drawn for a white page, so they stay on white in dark mode too. */}
      <div
        className="mx-auto max-w-xl rounded-lg bg-white p-2 text-zinc-900 [&_svg]:h-auto [&_svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="mt-2 text-center text-sm text-muted">{fig.cap}</figcaption>
    </figure>
  );
}

function Poem({ poem }: { poem: NonNullable<NoteDoc["poem"]> }) {
  const stanzas = layoutPoem(poem);
  return (
    <section aria-label="Poem" className="my-4">
      <Heading>{poem.pd ? "The poem, annotated" : "Annotation guide: lay it beside your anthology"}</Heading>
      <p className="text-sm text-muted">
        {poem.title} · {poem.poet}
        {poem.year ? ` · ${poem.year}` : ""}
        {poem.how ? (
          <>
            {" — "}
            <Rich text={poem.how} />
          </>
        ) : null}
      </p>
      <ul className="my-3 flex flex-wrap gap-1.5 text-xs font-semibold" aria-label="Colour key">
        {Object.entries(POEM_KEYS).map(([k, label]) => (
          <li key={k} className={cn("poem-k rounded-md px-2 py-0.5", `k-${k}`)}>
            {label}
          </li>
        ))}
      </ul>
      {stanzas.map((s, si) => (
        <div key={si} className="grid gap-3 border-t border-line py-4 md:grid-cols-2">
          {s.lines ? (
            <div className="font-serif text-[0.95rem] leading-7">
              {s.label ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</span> : null}
              {s.lines.map((l, li) => (
                <span key={li} className="flex gap-3">
                  <span className="w-6 shrink-0 text-right text-xs leading-7 text-muted">{l.no ?? ""}</span>
                  <span>
                    {l.segments.length
                      ? l.segments.map((seg, gi) =>
                          "num" in seg ? (
                            <mark key={gi} className={cn("poem-k rounded px-0.5", `k-${seg.k}`)}>
                              {seg.text}
                              <sup className="ml-0.5 font-sans text-[0.65rem] font-bold">{seg.num}</sup>
                            </mark>
                          ) : (
                            <Fragment key={gi}>{seg.text}</Fragment>
                          ),
                        )
                      : " "}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 p-3">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</span>
              <div>
                <Rich text={s.gist} />
              </div>
            </div>
          )}
          <ol className="space-y-2 text-sm">
            {s.notes.map((x) => (
              <li key={x.num} className={cn("poem-note rounded-lg border-l-4 py-1 pl-3", `k-${x.k}`)}>
                <b className="mr-1">{x.num}</b>
                {x.w ? <span className="font-semibold">{poem.pd ? `“${x.w}”` : x.w}:</span> : null} <Rich text={x.n} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

/** Renders a normalised note exactly in the legacy order. */
export function NoteBody({ note: n }: { note: NoteDoc }) {
  const examQs = n.exam.filter((x): x is Exclude<typeof x, string> => typeof x === "object" && x !== null);
  const examTips = n.exam.filter((x): x is string => typeof x === "string");
  return (
    <div className="note-body leading-relaxed [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc">
      {n.summary ? (
        <div className="my-4 rounded-xl border border-line bg-accent-soft px-4 py-3">
          <b>What the spec asks.</b> <Rich text={n.summary} />
        </div>
      ) : null}
      {n.poem ? <Poem poem={n.poem} /> : null}

      {n.core.map((c, i) => (
        <section key={i}>
          <Heading>{c.h}</Heading>
          {c.p ? (
            <p className="my-2">
              <Rich text={c.p} />
            </p>
          ) : null}
          {c.bullets.length ? (
            <ul className="my-2 space-y-1">
              {c.bullets.map((b, j) => (
                <li key={j}>
                  <Rich text={b} />
                </li>
              ))}
            </ul>
          ) : null}
          {c.table ? (
            <div className="my-3 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    {c.table.head.map((h, j) => (
                      <th key={j} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold">
                        <Rich text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.table.rows.map((r, j) => (
                    <tr key={j} className="border-b border-line last:border-0">
                      {r.map((x, k) => (
                        <td key={k} className="px-3 py-2 align-top">
                          <Rich text={x} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {c.callouts.map((k, j) => {
            const kind = calloutKind(k.k);
            return (
              <Callout key={j} kind={kind} title={k.t || CALLOUT_LABELS[kind]}>
                <p>
                  <Rich text={k.p} />
                </p>
              </Callout>
            );
          })}
          {c.fig.map((d, j) => (
            <Figure key={j} fig={d} />
          ))}
        </section>
      ))}

      {n.svg.map((d, j) => (
        <Figure key={j} fig={d} />
      ))}

      {n.quotes.length ? (
        <section>
          <Heading>Quote bank with grade 9 analysis</Heading>
          <p className="text-sm text-muted">Short key phrases only. Find each one in your copy of the text and learn the analysis, not just the words.</p>
          {n.quotes.map((q, i) => (
            <div key={i} className="my-3 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b>
                  <Rich text={q.q} />
                </b>
                {q.ref ? <span className="text-xs text-muted">{q.ref}</span> : null}
              </div>
              <p className="mt-1">
                <Rich text={q.a} />
              </p>
              {q.t ? (
                <p className="mt-1 text-sm">
                  <b>Techniques:</b> <Rich text={q.t} />
                </p>
              ) : null}
              {q.c ? (
                <p className="mt-1 text-sm">
                  <b>Context (AO3):</b> <Rich text={q.c} />
                </p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {n.essays.map((e, i) => (
        <section key={i}>
          <Heading>{e.t}</Heading>
          <details className="group rounded-xl border border-line bg-surface p-4" open={i === 0}>
            <summary className="cursor-pointer font-semibold">
              <Rich text={e.q} />
            </summary>
            {e.thesis ? (
              <Callout kind="key" title="Thesis">
                <p>
                  <Rich text={e.thesis} />
                </p>
              </Callout>
            ) : null}
            {e.plan.length ? (
              <>
                <p className="mt-3 font-semibold">Plan</p>
                <ol className="space-y-1">
                  {e.plan.map((x, j) => (
                    <li key={j}>
                      <Rich text={x} />
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            <div className="mt-3 space-y-3">
              {e.text.split(/\n\n+/).map((x, j) => (
                <p key={j}>
                  <Rich text={x} />
                </p>
              ))}
            </div>
            {e.why.length ? (
              <Callout kind="tip" title="Why this earns grade 9">
                <ul>
                  {e.why.map((x, j) => (
                    <li key={j}>
                      <Rich text={x} />
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : null}
          </details>
        </section>
      ))}

      {n.analogy ? (
        <div className="my-5 rounded-xl border border-dashed border-line-strong p-4">
          <b>Think of it like this: {n.analogy.t}</b>
          <p className="mt-1">
            <Rich text={n.analogy.p} />
          </p>
        </div>
      ) : null}

      {n.worked.map((w, i) => (
        <section key={i}>
          <SubHeading>Worked example</SubHeading>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p>
              <b>
                <Rich text={w.q} />
              </b>
            </p>
            <ol className="mt-2 space-y-1">
              {w.steps.map((x, j) => (
                <li key={j}>
                  <Rich text={x} />
                </li>
              ))}
            </ol>
            {w.ans ? (
              <p className="mt-2 font-semibold text-done">
                <Rich text={w.ans} />
              </p>
            ) : null}
          </div>
        </section>
      ))}

      {n.terms.length ? (
        <section>
          <SubHeading>Key terms (use these exact words)</SubHeading>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,max-content)_1fr]">
            {n.terms.map((t, i) => (
              <Fragment key={i}>
                <dt className="font-semibold">{t.t}</dt>
                <dd className="text-muted sm:text-fg">
                  <Rich text={t.d} />
                </dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ) : null}

      {n.mistakes.length ? (
        <section>
          <SubHeading>Commonly wrong answers</SubHeading>
          {n.mistakes.map((m, i) => (
            <div key={i} className="my-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border-l-4 border-danger bg-danger-soft px-3 py-2">
                <span className="block text-xs font-semibold uppercase tracking-wide">Students write</span>
                <Rich text={m.w} />
              </div>
              <div className="rounded-xl border-l-4 border-done bg-done-soft px-3 py-2">
                <span className="block text-xs font-semibold uppercase tracking-wide">The mark scheme wants</span>
                <Rich text={m.r} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {examQs.length ? (
        <section>
          <Heading>Commonly asked exam questions</Heading>
          <p className="text-sm text-muted">Tap a question to see the mark-scheme answer. Try it first.</p>
          {examQs.map((q, i) => (
            <details key={i} className="my-2 rounded-xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer">
                <Rich text={q.q} />{" "}
                <small className="text-muted">
                  [{q.marks} mark{q.marks === 1 ? "" : "s"}]
                </small>
              </summary>
              <div className="mt-2">
                <ul>
                  {q.model.map((x, j) => (
                    <li key={j}>
                      <Rich text={x} />
                    </li>
                  ))}
                </ul>
                {q.tip ? (
                  <p className="mt-2 text-sm text-muted">
                    <Rich text={q.tip} />
                  </p>
                ) : null}
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {examTips.length ? (
        <section>
          <SubHeading>How the marks are earned</SubHeading>
          <ul>
            {examTips.map((x, i) => (
              <li key={i}>
                <Rich text={x} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
