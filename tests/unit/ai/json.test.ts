import { describe, expect, it } from "vitest";

import { AiOutputError, fixStrayBackslashes, parseModelJson } from "@/server/ai/json";

describe("parsing model replies", () => {
  it("reads plain JSON", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('  [1,2]  ')).toEqual([1, 2]);
  });

  it("reads JSON inside a code fence, with or without a language", () => {
    expect(parseModelJson('Here you go:\n```json\n{"a":2}\n```\nThanks')).toEqual({ a: 2 });
    expect(parseModelJson("```\n{\"a\":3}\n```")).toEqual({ a: 3 });
  });

  it("reads JSON surrounded by chatter", () => {
    expect(parseModelJson('Sure! {"questions":[{"q":"x"}]} Hope that helps.')).toEqual({ questions: [{ q: "x" }] });
  });

  it("rejects replies with no usable JSON", () => {
    expect(() => parseModelJson("I can't help with that.")).toThrow(AiOutputError);
    expect(() => parseModelJson('{"a": 1,,}')).toThrow(AiOutputError);
    expect(() => parseModelJson("```json\n{broken\n```")).toThrow(AiOutputError);
  });

  it("keeps LaTeX written with single backslashes instead of rejecting the reply", () => {
    const raw = String.raw`{"a":"$\sqrt{2}$, $\frac{1}{2}$ \times 3, 90^\circ, \overline{x}, \begin{cases}"}`;
    expect(parseModelJson(raw)).toEqual({ a: String.raw`$\sqrt{2}$, $\frac{1}{2}$ \times 3, 90^\circ, \overline{x}, \begin{cases}` });
  });

  it("leaves real escapes alone", () => {
    const ok = String.raw`{"a":"x\ny\tz \"q\" \\frac \u00e9 \neither \ne.g."}`;
    expect(fixStrayBackslashes(ok)).toBe(ok);
    expect(parseModelJson(ok)).toEqual({ a: "x\ny\tz \"q\" \\frac \u00e9 \neither \ne.g." });
  });
});

