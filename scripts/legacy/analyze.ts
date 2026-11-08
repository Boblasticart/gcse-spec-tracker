/**
 * Reads the legacy tracker (`index.html`) and pulls out everything the
 * rebuild needs to stay faithful to it: the spec, the practice papers, the
 * AI prompts, every `data-act` action, every view and the note sanitiser
 * constants. Nothing is executed except plain data literals, which are
 * evaluated in an empty VM context.
 */
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

import { lex, lineOf, matchBracket, type TemplateToken, type Token } from "./lexer.ts";

export interface RawSubject {
  id: string;
  name: string;
  board: string;
  code: string;
  papers: { n: string; t: [string, string[]][] }[];
}

export interface RawPaper {
  k: string;
  t: string;
  g: string;
  pg: number;
  mk: number;
}

export interface LegacyFunction {
  name: string;
  startLine: number;
  endLine: number;
  start: number;
  end: number;
}

export interface LegacyPromptInfo {
  /** Function in index.html that builds and sends the prompt. */
  fn: string;
  line: number;
  /** Cooked literal parts of the template; `exprs.length + 1` entries. */
  quasis: string[];
  /** JavaScript source of each `${}` expression, in order. */
  exprs: string[];
  /** The `sm.json(...)` call that sends it, verbatim. */
  call: string;
  functionLines: [number, number];
}

export interface LegacyActionUse {
  fn: string;
  line: number;
}

export interface LegacyAction {
  name: string;
  handlerLine: number;
  handler: string;
  uses: LegacyActionUse[];
}

export interface LegacyView {
  name: string;
  renderFn: string;
  lines: number[];
}

export interface LegacyAnalysis {
  sourceSha256: string;
  subjects: RawSubject[];
  papers: Record<string, RawPaper[]>;
  paperUrls: Record<string, string>;
  functions: LegacyFunction[];
  prompts: LegacyPromptInfo[];
  actions: LegacyAction[];
  views: LegacyView[];
  sanitiser: {
    svgTags: string[];
    svgAttrs: string[];
    safePaint: string;
  };
  poemMarkKeys: Record<string, string>;
  reviewIntervals: number[];
}

/** Views and the legacy function that renders each one. */
export const VIEW_RENDERERS: Readonly<Record<string, string>> = {
  spec: "renderSpec",
  improve: "renderImprove",
  today: "renderToday",
  papers: "renderPapers",
  note: "renderNote",
  quiz: "renderQuiz",
};

interface Script {
  /** Offset of the script body inside the whole HTML file. */
  offset: number;
  body: string;
}

function inlineScript(html: string): Script {
  const open = "<script>";
  const start = html.indexOf(open);
  if (start === -1) throw new Error("index.html has no inline <script> block");
  const bodyStart = start + open.length;
  const end = html.indexOf("</script>", bodyStart);
  if (end === -1) throw new Error("Inline <script> block is not closed");
  return { offset: bodyStart, body: html.slice(bodyStart, end) };
}

function evalLiteral(source: string): unknown {
  // Data literals only; an empty context means no globals are reachable.
  return runInNewContext(`(${source})`, Object.create(null), { timeout: 1000 });
}

function cook(raw: string): string {
  const cooked: unknown = runInNewContext("`" + raw + "`", Object.create(null), { timeout: 1000 });
  if (typeof cooked !== "string") throw new Error("Template part did not evaluate to a string");
  return cooked;
}

class TokenView {
  readonly tokens: Token[];
  readonly src: string;

  constructor(src: string) {
    this.src = src;
    this.tokens = lex(src).filter((t) => t.kind !== "comment");
  }

  at(i: number): Token | undefined {
    return this.tokens[i];
  }

  is(i: number, text: string): boolean {
    const t = this.tokens[i];
    return t !== undefined && t.kind !== "template" && t.text === text;
  }

  /** Index of the first token after `const NAME =`. */
  afterDeclaration(name: string): number {
    for (let i = 0; i + 2 < this.tokens.length; i++) {
      if (
        (this.is(i, "const") || this.is(i, "let")) &&
        this.is(i + 1, name) &&
        this.is(i + 2, "=")
      ) {
        return i + 3;
      }
    }
    throw new Error(`Declaration of ${name} not found`);
  }

  /** Evaluates the first bracketed literal found at or after token `from`. */
  literalFrom(from: number): unknown {
    let i = from;
    while (i < this.tokens.length && !["[", "{"].some((b) => this.is(i, b))) i++;
    const close = matchBracket(this.tokens, i);
    const open = this.tokens[i];
    const end = this.tokens[close];
    if (!open || !end) throw new Error("Literal bounds not found");
    return evalLiteral(this.src.slice(open.start, end.end));
  }
}

function findFunctions(view: TokenView, lineAt: (o: number) => number): LegacyFunction[] {
  const out: LegacyFunction[] = [];
  const { tokens } = view;
  for (let i = 0; i < tokens.length; i++) {
    if (!view.is(i, "function")) continue;
    const nameTok = tokens[i + 1];
    if (!nameTok || nameTok.kind !== "ident" || !view.is(i + 2, "(")) continue;
    const closeParams = matchBracket(tokens, i + 2);
    if (!view.is(closeParams + 1, "{")) continue;
    const closeBody = matchBracket(tokens, closeParams + 1);
    const first = view.is(i - 1, "async") ? tokens[i - 1] : tokens[i];
    const last = tokens[closeBody];
    if (!first || !last) continue;
    out.push({
      name: nameTok.text,
      start: first.start,
      end: last.end,
      startLine: lineAt(first.start),
      endLine: lineAt(last.end - 1),
    });
  }
  return out;
}

function enclosing(functions: readonly LegacyFunction[], offset: number): LegacyFunction | undefined {
  let best: LegacyFunction | undefined;
  for (const f of functions) {
    if (f.start <= offset && offset < f.end && (!best || f.start > best.start)) best = f;
  }
  return best;
}

function findPrompts(
  view: TokenView,
  functions: readonly LegacyFunction[],
  lineAt: (o: number) => number,
): LegacyPromptInfo[] {
  const out: LegacyPromptInfo[] = [];
  const { tokens, src } = view;
  for (let i = 0; i + 3 < tokens.length; i++) {
    const tpl = tokens[i + 3];
    if (!view.is(i, "const") || !view.is(i + 1, "prompt") || !view.is(i + 2, "=")) continue;
    if (!tpl || tpl.kind !== "template") continue;
    const fn = enclosing(functions, tpl.start);
    if (!fn) throw new Error(`Prompt at offset ${tpl.start} is outside any function`);
    const callAt = src.indexOf("sm.json(prompt", tpl.end);
    const callEnd = callAt === -1 ? -1 : src.indexOf(")", src.indexOf("}", callAt)) + 1;
    if (callAt === -1 || callAt > fn.end || callEnd <= 0) {
      throw new Error(`Prompt in ${fn.name} is not sent with sm.json`);
    }
    out.push({
      fn: fn.name,
      line: lineAt(tpl.start),
      quasis: (tpl as TemplateToken).rawQuasis.map(cook),
      exprs: (tpl as TemplateToken).exprs.map((e) => e.text),
      call: src.slice(callAt, callEnd),
      functionLines: [fn.startLine, fn.endLine],
    });
  }
  return out;
}

function clickListenerRange(view: TokenView): [number, number] {
  const { tokens } = view;
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (view.is(i, "addEventListener") && view.is(i + 1, "(") && view.is(i + 2, "'click'")) {
      return [i + 1, matchBracket(tokens, i + 1)];
    }
  }
  throw new Error("Click listener not found");
}

/** End token index (inclusive) of the statement starting at token `i`. */
function statementEnd(view: TokenView, i: number): number {
  if (view.is(i, "{")) return matchBracket(view.tokens, i);
  let depth = 0;
  for (let j = i; j < view.tokens.length; j++) {
    if (["(", "[", "{"].some((b) => view.is(j, b))) depth++;
    else if ([")", "]", "}"].some((b) => view.is(j, b))) {
      if (depth === 0) return j - 1;
      depth--;
    } else if (depth === 0 && view.is(j, ";")) return j;
    else if (depth === 0 && view.is(j, "else")) return j - 1;
  }
  return view.tokens.length - 1;
}

function findActions(
  view: TokenView,
  html: string,
  script: Script,
  functions: readonly LegacyFunction[],
  lineAt: (o: number) => number,
): LegacyAction[] {
  const { tokens, src } = view;
  const [from, to] = clickListenerRange(view);
  const handlers = new Map<string, { line: number; handler: string }>();
  for (let i = from; i < to; i++) {
    const nameTok = tokens[i + 2];
    if (!view.is(i - 1, "(") || !view.is(i, "a") || !view.is(i + 1, "===")) continue;
    if (!nameTok || nameTok.kind !== "string" || !view.is(i + 3, ")")) continue;
    const name = String(evalLiteral(nameTok.text));
    const ifTok = tokens[i - 2];
    const endTok = tokens[statementEnd(view, i + 4)];
    if (!ifTok || !endTok) continue;
    handlers.set(name, { line: lineAt(ifTok.start), handler: src.slice(ifTok.start, endTok.end) });
  }

  const uses = new Map<string, LegacyActionUse[]>();
  const re = /data-act="([a-z0-9]+)"/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const name = m[1] ?? "";
    const inScript = m.index >= script.offset && m.index < script.offset + script.body.length;
    const fn = inScript ? enclosing(functions, m.index - script.offset) : undefined;
    const list = uses.get(name) ?? [];
    list.push({ fn: fn ? fn.name : inScript ? "(top level)" : "(static HTML)", line: lineOf(html, m.index) });
    uses.set(name, list);
  }

  const names = [...new Set([...handlers.keys(), ...uses.keys()])];
  return names.map((name) => {
    const h = handlers.get(name);
    if (!h) throw new Error(`Action "${name}" is used but has no click handler`);
    return { name, handlerLine: h.line, handler: h.handler, uses: uses.get(name) ?? [] };
  });
}

function findViews(src: string, functions: readonly LegacyFunction[], lineAt: (o: number) => number): LegacyView[] {
  const lines = new Map<string, Set<number>>();
  const add = (name: string, offset: number): void => {
    const set = lines.get(name) ?? new Set<number>();
    set.add(lineAt(offset));
    lines.set(name, set);
  };
  const cmp = /\bview\s*(?:===|!==|=)\s*'([a-z0-9]+)'/g;
  for (let m = cmp.exec(src); m; m = cmp.exec(src)) add(m[1] ?? "", m.index);
  const tabs = /\['(spec|improve|today|papers)',/g;
  for (let m = tabs.exec(src); m; m = tabs.exec(src)) add(m[1] ?? "", m.index);

  const known = new Set(functions.map((f) => f.name));
  return [...lines.entries()].map(([name, set]) => {
    const renderFn = VIEW_RENDERERS[name];
    if (!renderFn || !known.has(renderFn)) throw new Error(`View "${name}" has no known renderer`);
    return { name, renderFn, lines: [...set].sort((a, b) => a - b) };
  });
}

function asStringArray(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new Error(`${what} is not a string array`);
  return v as string[];
}

function asStringRecord(v: unknown, what: string): Record<string, string> {
  if (!v || typeof v !== "object" || !Object.values(v).every((x) => typeof x === "string")) {
    throw new Error(`${what} is not a string record`);
  }
  return { ...(v as Record<string, string>) };
}

function regexSource(view: TokenView, name: string): string {
  const t = view.at(view.afterDeclaration(name));
  if (!t || t.kind !== "regex") throw new Error(`${name} is not a regex literal`);
  return t.text;
}

function checkSubjects(v: unknown): RawSubject[] {
  if (!Array.isArray(v)) throw new Error("D is not an array");
  for (const s of v as RawSubject[]) {
    if (typeof s.id !== "string" || typeof s.name !== "string" || !Array.isArray(s.papers)) {
      throw new Error("Unexpected subject shape in D");
    }
    for (const p of s.papers) {
      for (const t of p.t) {
        if (typeof t[0] !== "string") throw new Error(`Bad topic in ${s.id}`);
        asStringArray(t[1], `points of ${s.id} / ${t[0]}`);
      }
    }
  }
  // Round-trip through JSON so nothing from the VM context leaks out.
  return JSON.parse(JSON.stringify(v)) as RawSubject[];
}

export function analyzeLegacy(html: string): LegacyAnalysis {
  const script = inlineScript(html);
  const view = new TokenView(script.body);
  const lineAt = (o: number): number => lineOf(html, script.offset + o);
  const functions = findFunctions(view, lineAt);

  const subjects = checkSubjects(view.literalFrom(view.afterDeclaration("D")));
  const papers = JSON.parse(JSON.stringify(view.literalFrom(view.afterDeclaration("PAPERS")))) as Record<
    string,
    RawPaper[]
  >;
  const paperUrls = asStringRecord(view.literalFrom(view.afterDeclaration("PURL")), "PURL");

  return {
    sourceSha256: createHash("sha256").update(html).digest("hex"),
    subjects,
    papers,
    paperUrls,
    functions: functions.map(({ name, startLine, endLine, start, end }) => ({ name, startLine, endLine, start, end })),
    prompts: findPrompts(view, functions, lineAt),
    actions: findActions(view, html, script, functions, lineAt),
    views: findViews(script.body, functions, lineAt),
    sanitiser: {
      svgTags: asStringArray(view.literalFrom(view.afterDeclaration("SVG_TAGS")), "SVG_TAGS"),
      svgAttrs: asStringArray(view.literalFrom(view.afterDeclaration("SVG_ATTR")), "SVG_ATTR"),
      safePaint: regexSource(view, "SAFE_PAINT"),
    },
    poemMarkKeys: asStringRecord(view.literalFrom(view.afterDeclaration("PMK")), "PMK"),
    reviewIntervals: JSON.parse(JSON.stringify(view.literalFrom(view.afterDeclaration("INT")))) as number[],
  };
}
