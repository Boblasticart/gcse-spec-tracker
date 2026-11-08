import { describe, expect, it } from "vitest";

import { AiOutputError, parseModelJson } from "@/server/ai/json";

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
});
