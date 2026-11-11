/**
 * Note-image sanitiser: a dependency-free port of the legacy `cleanSvg`.
 *
 * The legacy tracker parsed each figure with `DOMParser` and rebuilt it from
 * an allowlist of tags (`SVG_TAGS`), attributes (`SVG_ATTR`) and paint values
 * (`SAFE_PAINT`). This module does the same with its own small XML reader, so
 * it runs identically on the server and in the browser.
 *
 * It is safe by construction: the output is built only from allowlisted tag
 * and attribute names, with every attribute value and every piece of text
 * escaped. Anything the reader does not fully understand (a DOCTYPE, a
 * prefixed element, an unknown entity, malformed markup) produces `""`, so it
 * fails closed. For well-formed input the output is byte-for-byte the legacy
 * output (see tests/unit/notes/svg-parity.test.ts).
 */

/** Legacy `SVG_TAGS` (checked against index.html by tests/unit/notes/svg.test.ts). */
export const NOTE_SVG_TAGS: ReadonlySet<string> = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan",
  "defs", "marker", "title", "linearGradient", "radialGradient", "stop",
]);

/** Legacy `SVG_ATTR`. */
export const NOTE_SVG_ATTRS: ReadonlySet<string> = new Set([
  "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "transform",
  "font-size", "font-weight", "text-anchor", "dominant-baseline", "marker-end", "marker-start", "id", "refX",
  "refY", "markerWidth", "markerHeight", "orient", "opacity", "fill-opacity", "stroke-opacity", "offset",
  "stop-color", "stop-opacity", "font-style", "letter-spacing",
]);

/** Legacy `SAFE_PAINT`. */
export const NOTE_SAFE_PAINT = /^(none|currentColor|#[0-9a-fA-F]{3,8}|url\(#[A-Za-z0-9_-]+\))$/;

const MARKER_REF = /^url\(#[A-Za-z0-9_-]+\)$/;
const UNSAFE_VALUE = /javascript|data:|<|>/i;
const VIEWBOX = /^[0-9. -]+$/;
const DEFAULT_VIEWBOX = "0 0 400 240";

/** Legacy `esc`. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

// ---------------------------------------------------------------------------
// A minimal, strict XML reader (just enough of XML 1.0 + namespaces for SVG).
// ---------------------------------------------------------------------------

export interface XmlElement {
  readonly kind: "element";
  readonly name: string;
  /** Attributes in source order, values already decoded and normalised. */
  readonly attrs: readonly (readonly [string, string])[];
  readonly children: readonly XmlNode[];
}

export interface XmlText {
  readonly kind: "text";
  readonly value: string;
}

export type XmlNode = XmlElement | XmlText;

class Malformed extends Error {}

const NAME = /[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?/y;
const WS = /[ \t\n\r]+/y;
/** Characters XML 1.0 forbids anywhere in a document. */
const BAD_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const PREDEFINED: Readonly<Record<string, string>> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function isXmlChar(cp: number): boolean {
  return cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

class Reader {
  private pos = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  /** Parses a whole document and returns its root element. Throws `Malformed`. */
  document(): XmlElement {
    if (this.src.startsWith("﻿")) this.pos = 1;
    if (this.src.startsWith("<?xml", this.pos) && /[ \t\n\r?]/.test(this.src[this.pos + 5] ?? "")) this.skipPi(true);
    this.misc();
    if (this.src[this.pos] !== "<" || !NAME_START.test(this.src[this.pos + 1] ?? "")) throw new Malformed("no root element");
    const root = this.element(new Set(["xml", "xmlns"]));
    this.misc();
    if (this.pos !== this.src.length) throw new Malformed("content after the root element");
    return root;
  }

  private fail(why: string): never {
    throw new Malformed(why);
  }

  private ws(): boolean {
    WS.lastIndex = this.pos;
    if (WS.exec(this.src)) {
      this.pos = WS.lastIndex;
      return true;
    }
    return false;
  }

  private name(): string {
    NAME.lastIndex = this.pos;
    const m = NAME.exec(this.src);
    if (!m) this.fail("expected a name");
    this.pos = NAME.lastIndex;
    return m[0];
  }

  private expect(s: string): void {
    if (!this.src.startsWith(s, this.pos)) this.fail(`expected ${s}`);
    this.pos += s.length;
  }

  /** Whitespace, comments and processing instructions outside the root. A DOCTYPE fails closed. */
  private misc(): void {
    for (;;) {
      this.ws();
      if (this.src.startsWith("<!--", this.pos)) this.skipComment();
      else if (this.src.startsWith("<?", this.pos)) this.skipPi(false);
      else if (this.src.startsWith("<!", this.pos)) this.fail("DOCTYPE and declarations are not supported");
      else return;
    }
  }

  private skipComment(): void {
    const end = this.src.indexOf("--", this.pos + 4);
    if (end < 0 || this.src[end + 2] !== ">") this.fail("bad comment");
    this.pos = end + 3;
  }

  private skipPi(isDecl: boolean): void {
    this.expect("<?");
    const target = this.name();
    if (!isDecl && target.toLowerCase() === "xml") this.fail("misplaced XML declaration");
    if (target.includes(":")) this.fail("bad processing instruction");
    const end = this.src.indexOf("?>", this.pos);
    if (end < 0) this.fail("unclosed processing instruction");
    if (end > this.pos && !/[ \t\n\r]/.test(this.src[this.pos] ?? "")) this.fail("bad processing instruction");
    this.pos = end + 2;
  }

  /** Decodes one `&...;` reference at the current position. */
  private reference(): string {
    const end = this.src.indexOf(";", this.pos);
    if (end < 0 || end - this.pos > 12) this.fail("bad reference");
    const body = this.src.slice(this.pos + 1, end);
    this.pos = end + 1;
    const named = PREDEFINED[body];
    if (named !== undefined) return named;
    const m = /^#(?:x([0-9a-fA-F]+)|([0-9]+))$/.exec(body);
    if (!m) this.fail("unknown entity");
    const cp = m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2] ?? "", 10);
    if (!isXmlChar(cp)) this.fail("bad character reference");
    return String.fromCodePoint(cp);
  }

  private attrValue(): string {
    const q = this.src[this.pos];
    if (q !== '"' && q !== "'") this.fail("expected a quoted value");
    this.pos++;
    let out = "";
    for (;;) {
      const c = this.src[this.pos];
      if (c === undefined) this.fail("unclosed attribute value");
      if (c === q) {
        this.pos++;
        return out;
      }
      if (c === "<") this.fail("< in attribute value");
      if (c === "&") out += this.reference();
      else {
        // Attribute-value normalisation: literal whitespace becomes a space.
        out += c === "\t" || c === "\n" || c === "\r" ? " " : c;
        this.pos++;
      }
    }
  }

  private element(inScope: ReadonlySet<string>): XmlElement {
    this.expect("<");
    const name = this.name();
    if (name.includes(":")) this.fail("prefixed elements are not supported");
    const attrs: [string, string][] = [];
    const seen = new Set<string>();
    let selfClosing = false;
    for (;;) {
      const spaced = this.ws();
      if (this.src.startsWith("/>", this.pos)) {
        this.pos += 2;
        selfClosing = true;
        break;
      }
      if (this.src[this.pos] === ">") {
        this.pos++;
        break;
      }
      if (!spaced) this.fail("expected whitespace between attributes");
      const an = this.name();
      this.ws();
      this.expect("=");
      this.ws();
      const av = this.attrValue();
      if (seen.has(an)) this.fail("duplicate attribute");
      seen.add(an);
      attrs.push([an, av]);
    }

    // Namespace prefixes declared here are in scope for this element and its children.
    let scope = inScope;
    for (const [an, av] of attrs) {
      if (an.startsWith("xmlns:")) {
        const prefix = an.slice(6);
        if (!av || prefix === "xmlns") this.fail("bad namespace declaration");
        if (scope === inScope) scope = new Set(inScope);
        (scope as Set<string>).add(prefix);
      }
    }
    for (const [an] of attrs) {
      const i = an.indexOf(":");
      if (i >= 0 && !scope.has(an.slice(0, i))) this.fail("unbound prefix");
    }

    const children: XmlNode[] = [];
    if (!selfClosing) {
      let text = "";
      const flush = (): void => {
        if (text) children.push({ kind: "text", value: text });
        text = "";
      };
      for (;;) {
        const c = this.src[this.pos];
        if (c === undefined) this.fail(`unclosed <${name}>`);
        if (c === "<") {
          if (this.src.startsWith("</", this.pos)) {
            this.pos += 2;
            if (this.name() !== name) this.fail("mismatched end tag");
            this.ws();
            this.expect(">");
            flush();
            break;
          }
          if (this.src.startsWith("<!--", this.pos)) {
            // The legacy walker ignores comments; text either side stays separate but is output back to back.
            this.skipComment();
          } else if (this.src.startsWith("<![CDATA[", this.pos)) {
            const end = this.src.indexOf("]]>", this.pos + 9);
            if (end < 0) this.fail("unclosed CDATA");
            // CDATA sections are not text nodes, so the legacy walker drops them.
            flush();
            this.pos = end + 3;
          } else if (this.src.startsWith("<?", this.pos)) {
            this.skipPi(false);
          } else if (this.src.startsWith("<!", this.pos)) {
            this.fail("declaration inside an element");
          } else {
            flush();
            children.push(this.element(scope));
          }
        } else if (c === "&") {
          text += this.reference();
        } else {
          if (c === "]" && this.src.startsWith("]]>", this.pos)) this.fail("]]> in text");
          text += c;
          this.pos++;
        }
      }
    }
    return { kind: "element", name, attrs, children };
  }
}

const NAME_START = /[A-Za-z_]/;

/**
 * Parses an SVG/XML string into a tree, or returns null if it is not
 * well-formed (or uses XML features this reader deliberately refuses).
 */
export function parseXml(src: string): XmlElement | null {
  const text = String(src).replace(/\r\n?/g, "\n");
  if (BAD_CHARS.test(text)) return null;
  try {
    return new Reader(text).document();
  } catch (e) {
    if (e instanceof Malformed) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// The legacy cleaning walk, unchanged in behaviour.
// ---------------------------------------------------------------------------

function walk(node: XmlElement): string {
  let out = "";
  for (const c of node.children) {
    if (c.kind === "text") {
      out += escapeHtml(c.value);
      continue;
    }
    const tag = c.name;
    if (!NOTE_SVG_TAGS.has(tag)) continue;
    let at = "";
    for (const [k, v] of c.attrs) {
      if (!NOTE_SVG_ATTRS.has(k)) continue;
      if ((k === "fill" || k === "stroke" || k === "stop-color") && !NOTE_SAFE_PAINT.test(v)) continue;
      if ((k === "marker-end" || k === "marker-start") && !MARKER_REF.test(v)) continue;
      if (UNSAFE_VALUE.test(v)) continue;
      at += ` ${k}="${escapeHtml(v)}"`;
    }
    if ((tag === "text" || tag === "tspan") && !/ fill=/.test(at)) at += ' fill="#1b2540"';
    out += `<${tag}${at}>${walk(c)}</${tag}>`;
  }
  return out;
}

/**
 * Legacy `cleanSvg`: returns a safe `<svg>` string for a note figure, or `""`
 * when the source is not a usable SVG.
 */
export function cleanSvg(src: unknown): string {
  const root = parseXml(String(src ?? ""));
  if (!root || root.name !== "svg") return "";
  const vb = root.attrs.find(([k]) => k === "viewBox")?.[1] || DEFAULT_VIEWBOX;
  if (!VIEWBOX.test(vb)) return "";
  return `<svg viewBox="${escapeHtml(vb)}" role="img" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${walk(root)}</svg>`;
}
