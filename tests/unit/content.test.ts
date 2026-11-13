import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_PROMPTS, PAPERS, SPEC, allPoints, fillPrompt, getPoint, getTopic, isSubjectId, pointLabel } from "@/content";

describe("content", () => {
  it("numbers topics across papers like the legacy tracker", () => {
    const phy = SPEC.find((s) => s.id === "phy");
    expect(phy?.papers[1]?.topics[0]?.id).toBe("phy.4");
    expect(phy?.papers[1]?.topics[0]?.name).toBe("4.5 Forces");
    expect(getTopic("phy.4")?.paperName).toBe("Paper 2");
  });

  it("builds legacy labels", () => {
    expect(pointLabel("phy.0.0")).toBe("4.1 Energy › Energy stores and transfers in a system");
    expect(pointLabel("nope.1.2")).toBe("");
    expect(getPoint("maths.0.6")?.point.text).toBe("Indices and roots");
  });

  it("has unique ids", () => {
    const ids = SPEC.flatMap((s) => allPoints(s).map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(isSubjectId("chem")).toBe(true);
    expect(isSubjectId("french")).toBe(false);
  });

  it("points every practice paper at a real PDF", () => {
    const all = Object.values(PAPERS).flatMap((v) => v ?? []);
    expect(all).toHaveLength(56);
    for (const p of all) expect(existsSync(join(__dirname, "..", "..", p.url)), p.url).toBe(true);
  });

  it("fills prompts in legacy order", () => {
    const p = LEGACY_PROMPTS.todaysSeven;
    const text = fillPrompt(p, ["AQA", "Physics", "AQA", "1. Energy"]);
    expect(text.startsWith("You write AQA GCSE Physics exam-style questions")).toBe(true);
    expect(text).toContain("Spec points:\n1. Energy\n");
    expect(() => fillPrompt(p, ["x"])).toThrow(/needs 4 values/);
  });
});
