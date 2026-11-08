/**
 * A small JavaScript lexer, just good enough to read the legacy tracker's
 * inline script in `index.html` without executing it.
 *
 * It understands strings, template literals (including nested `${}`
 * expressions), regular expression literals, comments, identifiers, numbers
 * and punctuation. It has no dependencies so the extraction script can run on
 * plain Node with type stripping.
 */

export type TokenKind =
  | "ident"
  | "number"
  | "string"
  | "template"
  | "regex"
  | "punct"
  | "comment";

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface BaseToken extends Span {
  readonly kind: Exclude<TokenKind, "template">;
  /** Exact source text of the token. */
  readonly text: string;
}

export interface TemplateExpression extends Span {
  /** Source text of the expression between `${` and `}`. */
  readonly text: string;
}

export interface TemplateToken extends Span {
  readonly kind: "template";
  readonly text: string;
  /** Raw text of each literal part, `exprs.length + 1` entries. */
  readonly rawQuasis: readonly string[];
  readonly exprs: readonly TemplateExpression[];
}

export type Token = BaseToken | TemplateToken;

const REGEX_AFTER_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "instanceof",
  "yield",
  "await",
]);

// Longest first so `===` wins over `==` and `=`.
const PUNCTUATORS = [
  ">>>=",
  "...",
  "===",
  "!==",
  "**=",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "**",
  "<<",
  ">>",
];

const isIdentStart = (c: string): boolean => /[A-Za-z_$À-￿]/.test(c);
const isIdentPart = (c: string): boolean => /[A-Za-z0-9_$À-￿]/.test(c);
const isDigit = (c: string): boolean => c >= "0" && c <= "9";

export class LexError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} at offset ${position}`);
    this.name = "LexError";
    this.position = position;
  }
}

interface LexResult {
  readonly tokens: Token[];
  /** Offset just after the last character consumed. */
  readonly end: number;
}

function regexAllowed(prev: Token | undefined): boolean {
  if (!prev) return true;
  if (prev.kind === "punct") return ![")", "]", "}"].includes(prev.text);
  if (prev.kind === "ident") return REGEX_AFTER_KEYWORDS.has(prev.text);
  return false;
}

function readString(src: string, start: number): number {
  const quote = src[start];
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) return i + 1;
    if (c === "\n") throw new LexError("Unterminated string", start);
    i++;
  }
  throw new LexError("Unterminated string", start);
}

function readRegex(src: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") throw new LexError("Unterminated regex", start);
    if (inClass) {
      if (c === "]") inClass = false;
    } else if (c === "[") {
      inClass = true;
    } else if (c === "/") {
      i++;
      while (i < src.length && isIdentPart(src[i] ?? "")) i++;
      return i;
    }
    i++;
  }
  throw new LexError("Unterminated regex", start);
}

function readTemplate(src: string, start: number): TemplateToken {
  const rawQuasis: string[] = [];
  const exprs: TemplateExpression[] = [];
  let i = start + 1;
  let quasiStart = i;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      rawQuasis.push(src.slice(quasiStart, i));
      return {
        kind: "template",
        start,
        end: i + 1,
        text: src.slice(start, i + 1),
        rawQuasis,
        exprs,
      };
    }
    if (c === "$" && src[i + 1] === "{") {
      rawQuasis.push(src.slice(quasiStart, i));
      const exprStart = i + 2;
      const inner = lexFrom(src, exprStart, true);
      exprs.push({ start: exprStart, end: inner.end, text: src.slice(exprStart, inner.end) });
      i = inner.end + 1; // skip the closing `}`
      quasiStart = i;
      continue;
    }
    i++;
  }
  throw new LexError("Unterminated template literal", start);
}

function lexFrom(src: string, from: number, stopAtClosingBrace: boolean): LexResult {
  const tokens: Token[] = [];
  let depth = 0;
  let prev: Token | undefined;
  let i = from;
  const push = (t: Token): void => {
    tokens.push(t);
    if (t.kind !== "comment") prev = t;
  };

  while (i < src.length) {
    const c = src[i] ?? "";
    const next = src[i + 1] ?? "";

    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      push({ kind: "comment", start: i, end: stop, text: src.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end === -1) throw new LexError("Unterminated comment", i);
      push({ kind: "comment", start: i, end: end + 2, text: src.slice(i, end + 2) });
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = readString(src, i);
      push({ kind: "string", start: i, end, text: src.slice(i, end) });
      i = end;
      continue;
    }
    if (c === "`") {
      const t = readTemplate(src, i);
      push(t);
      i = t.end;
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      const end = readRegex(src, i);
      push({ kind: "regex", start: i, end, text: src.slice(i, end) });
      i = end;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(next))) {
      let j = i + 1;
      while (j < src.length && /[0-9A-Za-z_.]/.test(src[j] ?? "")) j++;
      push({ kind: "number", start: i, end: j, text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < src.length && isIdentPart(src[j] ?? "")) j++;
      push({ kind: "ident", start: i, end: j, text: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      if (depth === 0 && stopAtClosingBrace) return { tokens, end: i };
      depth--;
    }
    const multi = PUNCTUATORS.find((p) => src.startsWith(p, i));
    const text = multi ?? c;
    push({ kind: "punct", start: i, end: i + text.length, text });
    i += text.length;
  }
  if (stopAtClosingBrace) throw new LexError("Unterminated template expression", from);
  return { tokens, end: i };
}

/** Tokenise a whole script. Throws {@link LexError} on malformed input. */
export function lex(src: string): Token[] {
  return lexFrom(src, 0, false).tokens;
}

/** Index of the punctuation token that closes the bracket opened at `openIndex`. */
export function matchBracket(tokens: readonly Token[], openIndex: number): number {
  const open = tokens[openIndex];
  const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
  const close = open && open.kind === "punct" ? pairs[open.text] : undefined;
  if (!open || !close) throw new Error(`Token ${openIndex} is not an opening bracket`);
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t || t.kind !== "punct") continue;
    if (t.text === open.text) depth++;
    else if (t.text === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unmatched ${open.text} at offset ${open.start}`);
}

/** 1-based line number of a character offset. */
export function lineOf(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}
