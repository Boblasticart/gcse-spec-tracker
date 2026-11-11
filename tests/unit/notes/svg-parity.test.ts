import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { LEGACY_FUNCTIONS, SAFE_PAINT, SVG_ATTRS, SVG_TAGS } from "@/content/legacy-map";
import { cleanSvg, NOTE_SAFE_PAINT, NOTE_SVG_ATTRS, NOTE_SVG_TAGS } from "@/lib/notes/svg";

/**
 * Proves the dependency-free sanitiser matches the legacy `cleanSvg`
 * (evaluated from index.html with jsdom's DOMParser) on every figure in
 * data/notes, and that it fails closed on hostile input.
 */
const root = join(__dirname, "..", "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8").split("\n");

function legacyLine(prefix: string): string {
  const line = html.find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`index.html: no line starting ${prefix}`);
  return line;
}

function legacyFunction(name: string): string {
  const f = LEGACY_FUNCTIONS.find((x) => x.name === name);
  if (!f) throw new Error(`legacy function ${name} not found`);
  return html.slice(f.startLine - 1, f.endLine).join("\n");
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
const win = dom.window as unknown as { eval: (src: string) => void; __legacyCleanSvg: (src: string) => string };
win.eval(
  [
    legacyLine("const esc="),
    legacyLine("const SVG_TAGS="),
    legacyLine("const SVG_ATTR="),
    legacyLine("const SAFE_PAINT="),
    legacyFunction("cleanSvg"),
    "window.__legacyCleanSvg = cleanSvg;",
  ].join("\n"),
);
const legacyClean = (src: string): string => win.__legacyCleanSvg(src);

/** Every figure in the prepared notes (core[].fig[] and svg[]). */
function allNoteSvgs(): { where: string; svg: string }[] {
  const dir = join(root, "data", "notes");
  const out: { where: string; svg: string }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const note = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      core?: { fig?: { svg?: unknown }[] }[];
      svg?: { svg?: unknown }[];
    };
    (note.core ?? []).forEach((c, i) => (c.fig ?? []).forEach((f, j) => out.push({ where: `${file} core[${i}].fig[${j}]`, svg: String(f.svg ?? "") })));
    (note.svg ?? []).forEach((f, j) => out.push({ where: `${file} svg[${j}]`, svg: String(f.svg ?? "") }));
  }
  return out;
}

describe("note SVG sanitiser", () => {
  it("uses exactly the legacy allowlists", () => {
    expect([...NOTE_SVG_TAGS]).toEqual([...SVG_TAGS]);
    expect([...NOTE_SVG_ATTRS]).toEqual([...SVG_ATTRS]);
    expect(NOTE_SAFE_PAINT.source).toBe(SAFE_PAINT.source);
  });

  it("matches the legacy cleanSvg on every figure in data/notes", () => {
    const figures = allNoteSvgs();
    expect(figures.length).toBeGreaterThan(1000);
    const mismatches: string[] = [];
    for (const f of figures) {
      const ours = cleanSvg(f.svg);
      const theirs = legacyClean(f.svg);
      if (ours !== theirs) mismatches.push(`${f.where}\n  ours:   ${ours.slice(0, 300)}\n  legacy: ${theirs.slice(0, 300)}`);
    }
    expect(mismatches.slice(0, 5).join("\n")).toBe("");
    expect(mismatches).toHaveLength(0);
  });

  const exactCases: [string, string][] = [
    ["plain", '<svg viewBox="0 0 10 10"><rect x="1" y="2" width="3" height="4" fill="#fff"/></svg>'],
    ["no viewBox", '<svg><circle cx="5" cy="5" r="2"/></svg>'],
    ["text gets a default fill", '<svg viewBox="0 0 10 10"><text x="1" y="2">A &amp; B &lt; C</text><tspan fill="#000">x</tspan></svg>'],
    ["entities and char refs", '<svg viewBox="0 0 10 10"><text>&#65;&#x42;&quot;&apos;&gt;</text></svg>'],
    ["attribute whitespace", '<svg viewBox="0 0 10 10"><path d="M0 0\n\tL1 1"/></svg>'],
    ["CRLF", '<svg viewBox="0 0 10 10">\r\n<text>a\r\nb</text>\r\n</svg>'],
    ["xml declaration and comments", '<?xml version="1.0"?>\n<!-- hi --><svg viewBox="0 0 1 1"><!-- c --><g>a<!-- x -->b</g></svg>\n<!-- end -->'],
    ["CDATA is dropped", '<svg viewBox="0 0 1 1"><text>x<![CDATA[<b>]]>y</text></svg>'],
    ["unsafe paint dropped", '<svg viewBox="0 0 1 1"><rect fill="red" stroke="url(http://x)"/><stop stop-color="#abc"/></svg>'],
    ["markers", '<svg viewBox="0 0 1 1"><line marker-end="url(#a)" marker-start="url(x)"/></svg>'],
    ["unknown tags and attrs dropped", '<svg viewBox="0 0 1 1"><foo><rect/></foo><rect onload="x()" style="a" class="b" width="1"/></svg>'],
    ["namespaced attrs", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><g xlink:href="#a" xml:space="preserve"/></svg>'],
    ["javascript in a value", '<svg viewBox="0 0 1 1"><rect id="javascript:x" transform="data:1" width="&lt;b"/></svg>'],
    ["bad viewBox", '<svg viewBox="0 0 1 1;x"><rect/></svg>'],
    ["empty viewBox", '<svg viewBox=""><rect/></svg>'],
    ["not svg root", "<g><rect/></g>"],
    ["self-closing root", '<svg viewBox="0 0 1 1"/>'],
    ["single quotes", "<svg viewBox='0 0 1 1'><text x='1'>q</text></svg>"],
    ["end tag spaces", '<svg viewBox="0 0 1 1" ><g ></g ></svg >'],
    ["nested svg", '<svg viewBox="0 0 1 1"><svg viewBox="0 0 2 2"><rect/></svg></svg>'],
    ["gradient", '<svg viewBox="0 0 1 1"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g)"/></svg>'],
  ];

  it.each(exactCases)("matches legacy: %s", (_name, src) => {
    expect(cleanSvg(src)).toBe(legacyClean(src));
  });

  /** Hostile or unusual input: ours must match the legacy output or refuse it entirely. */
  const hostile: string[] = [
    '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    '<svg viewBox="0 0 1 1"><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>',
    '<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><rect/></a></svg>',
    '<!DOCTYPE svg [<!ENTITY x "<script>">]><svg viewBox="0 0 1 1"><text>&x;</text></svg>',
    '<svg viewBox="0 0 1 1"><text>&nbsp;</text></svg>',
    '<svg viewBox="0 0 1 1"><rect x="1" x="2"/></svg>',
    '<svg viewBox="0 0 1 1"><rect x="1"y="2"/></svg>',
    '<svg viewBox="0 0 1 1"><g></svg>',
    '<svg viewBox="0 0 1 1"><svg:rect/></svg>',
    '<svg viewBox="0 0 1 1"><rect foo:bar="1"/></svg>',
    '<svg viewBox="0 0 1 1"><text>a ]]> b</text></svg>',
    '<svg viewBox="0 0 1 1"><text>&#0;</text></svg>',
    '<svg viewBox="0 0 1 1"><text>\u0001</text></svg>',
    '<svg viewBox="0 0 1 1"><!-- a -- b --></svg>',
    '<svg viewBox="0 0 1 1"><rect fill="#fff"/></svg><svg/>',
    'text<svg viewBox="0 0 1 1"/>',
    '<svg viewBox="0 0 1 1"><rect width="1" fill="url(#a)&quot; onload=&quot;x"/></svg>',
    '<svg viewBox="0 0 1 1"><text fill="#000">&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>',
    "<SVG viewBox='0 0 1 1'></SVG>",
    "",
    "not xml at all",
    '<svg viewBox="0 0 1 1"><style>*{background:url(x)}</style></svg>',
    '<svg viewBox="0 0 1 1"><rect style="x" onclick="y" href="z" xlink:href="w"/></svg>',
  ];

  it.each(hostile.map((h) => [h]))("fails closed or matches legacy: %s", (src) => {
    const ours = cleanSvg(src);
    if (ours !== "") expect(ours).toBe(legacyClean(src));
  });

  it("only ever outputs allowlisted tags and attributes", () => {
    const outputs = [...exactCases.map(([, s]) => s), ...hostile, ...allNoteSvgs().slice(0, 400).map((f) => f.svg)].map(cleanSvg).filter(Boolean);
    const allowedRoot = new Set(["viewBox", "role", "xmlns", "stroke", "fill", "stroke-width", "stroke-linecap", "stroke-linejoin"]);
    const doc = new JSDOM(`<!doctype html><body>${outputs.join("")}</body>`).window.document;
    const roots = new Set(Array.from(doc.body.children));
    for (const el of Array.from(doc.body.querySelectorAll("*"))) {
      const tag = el.localName === "lineargradient" ? "linearGradient" : el.localName === "radialgradient" ? "radialGradient" : el.localName;
      expect(NOTE_SVG_TAGS.has(tag), tag).toBe(true);
      for (const a of Array.from(el.attributes)) {
        const ok = roots.has(el) ? allowedRoot.has(a.name) : NOTE_SVG_ATTRS.has(a.name);
        expect(ok, `${tag}@${a.name}`).toBe(true);
        expect(/javascript|data:/i.test(a.value), a.value).toBe(false);
      }
    }
  });
});
