import { describe, expect, it } from "vitest";

import { lex, lineOf, matchBracket, type TemplateToken } from "../../scripts/legacy/lexer";

describe("lexer", () => {
  it("reads strings with escapes and quotes inside", () => {
    const tokens = lex(`a='it\\'s';b="say \\"hi\\""`);
    expect(tokens.filter((t) => t.kind === "string").map((t) => t.text)).toEqual([`'it\\'s'`, `"say \\"hi\\""`]);
  });

  it("splits template literals into parts and nested expressions", () => {
    const [tpl] = lex("`a${x}b${`in${y}`}c`") as TemplateToken[];
    expect(tpl?.kind).toBe("template");
    expect(tpl?.rawQuasis).toEqual(["a", "b", "c"]);
    expect(tpl?.exprs.map((e) => e.text)).toEqual(["x", "`in${y}`"]);
  });

  it("keeps object braces inside template expressions balanced", () => {
    const [tpl] = lex("`${f({a:1})}!`") as TemplateToken[];
    expect(tpl?.exprs.map((e) => e.text)).toEqual(["f({a:1})"]);
    expect(tpl?.rawQuasis).toEqual(["", "!"]);
  });

  it("tells regex literals from division", () => {
    const kinds = lex("x=a/b/c;y=s.replace(/[/\"]/g,'')").map((t) => t.kind);
    expect(kinds.filter((k) => k === "regex")).toHaveLength(1);
    expect(lex("return /ab+/.test(s)")[1]?.kind).toBe("regex");
  });

  it("skips comments", () => {
    const tokens = lex("a // c '\n/* ` */ b");
    expect(tokens.filter((t) => t.kind === "ident").map((t) => t.text)).toEqual(["a", "b"]);
  });

  it("matches brackets and reports lines", () => {
    const tokens = lex("f(a,[1,(2)],{b:3})");
    const open = tokens.findIndex((t) => t.text === "(");
    expect(tokens[matchBracket(tokens, open)]?.end).toBe(18);
    expect(lineOf("a\nb\nc", 4)).toBe(3);
  });

  it("throws on unterminated input", () => {
    expect(() => lex("'abc")).toThrow(/Unterminated string/);
    expect(() => lex("`abc${x`")).toThrow();
  });
});
