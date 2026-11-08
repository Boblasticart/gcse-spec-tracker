import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { generate } from "../../scripts/extract-legacy";
import { analyzeLegacy, type LegacyAnalysis } from "../../scripts/legacy/analyze";

const root = join(__dirname, "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8");

const EXPECTED_ACTIONS = [
  "tab", "view", "filter", "exp", "all", "top", "st", "dec", "note", "wnote", "back", "gen", "more7",
  "more", "submit", "retry", "master", "review", "quiz", "newquiz", "submitquiz", "retake", "pdone",
  "perm", "cancel",
];

describe("legacy extraction", () => {
  let a: LegacyAnalysis;
  beforeAll(() => {
    a = analyzeLegacy(html);
  });

  it("finds all eight subjects with their spec points", () => {
    expect(a.subjects.map((s) => s.id)).toEqual(["phy", "bio", "chem", "maths", "cs", "geo", "eng", "bus"]);
    const total = a.subjects.reduce((n, s) => n + s.papers.reduce((m, p) => m + p.t.reduce((k, t) => k + t[1].length, 0), 0), 0);
    expect(total).toBeGreaterThan(500);
  });

  it("traces every data-act action to a handler and a renderer", () => {
    expect(a.actions.map((x) => x.name).sort()).toEqual([...EXPECTED_ACTIONS].sort());
    for (const action of a.actions) {
      expect(action.handler.startsWith("if(a==='" + action.name + "')")).toBe(true);
      expect(action.uses.length).toBeGreaterThan(0);
    }
  });

  it("finds every view", () => {
    expect(a.views.map((v) => v.name).sort()).toEqual(["improve", "note", "papers", "quiz", "spec", "today"]);
  });

  it("finds the six AI prompts, each sent with sm.json", () => {
    expect(a.prompts.map((p) => p.fn).sort()).toEqual(
      ["genNote", "genQuiz", "genReview", "genToday", "markAnswer", "submitQuiz"].sort(),
    );
    for (const p of a.prompts) {
      expect(p.quasis).toHaveLength(p.exprs.length + 1);
      expect(p.call).toMatch(/^sm\.json\(prompt,/);
    }
  });

  it("keeps the note sanitiser constants", () => {
    expect(a.sanitiser.svgTags).toContain("svg");
    expect(a.sanitiser.svgTags).not.toContain("script");
    expect(a.sanitiser.svgAttrs).not.toContain("onload");
    expect(a.sanitiser.safePaint.startsWith("/^(none|currentColor")).toBe(true);
  });

  it("committed src/content files match a fresh extraction", () => {
    for (const [name, content] of Object.entries(generate(html))) {
      expect(readFileSync(join(root, "src", "content", name), "utf8"), name).toBe(content);
    }
  });
});
