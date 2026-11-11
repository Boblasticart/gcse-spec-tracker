import { describe, expect, it } from "vitest";

import { getSubject } from "@/content";
import { improveModel, pointName, reviewMeta } from "@/features/improve/model";
import { specRows } from "@/features/spec/model";
import { shortDay } from "@/lib/dates";
import { asPapersDone, togglePaperDone } from "@/lib/papers-done";

const phy = getSubject("phy")!;

describe("spec rows (legacy renderSpec)", () => {
  it("shows every topic closed unless opened, with counts and % per paper", () => {
    const progress = { s: { "phy.0.0": 2, "phy.0.1": 1 } };
    const { papers, shown } = specRows(phy, progress, "all", new Set(["phy.1"]));
    expect(shown).toBe(phy.papers.flatMap((p) => p.topics.flatMap((t) => t.points)).length);
    const energy = papers[0]!.topics[0]!;
    expect(energy.counts[2]).toBe(1);
    expect(energy.counts[1]).toBe(1);
    expect(energy.open).toBe(false);
    expect(papers[0]!.topics[1]!.open).toBe(true);
    expect(papers[0]!.pctDone).toBeGreaterThan(0);
  });

  it("a filter hides empty topics and papers and opens the rest", () => {
    const { papers, shown } = specRows(phy, { s: { "phy.0.0": 1 } }, "1", new Set());
    expect(shown).toBe(1);
    expect(papers).toHaveLength(1);
    expect(papers[0]!.topics).toHaveLength(1);
    expect(papers[0]!.topics[0]!.open).toBe(true);
    expect(papers[0]!.topics[0]!.points.map((p) => p.id)).toEqual(["phy.0.0"]);
    expect(specRows(phy, {}, "2", new Set()).shown).toBe(0);
  });
});

describe("improvement model (legacy renderImprove)", () => {
  const progress = {
    s: { "phy.0.0": 1, "phy.0.1": 1, "phy.0.2": 2 },
    c: { "phy.0.1": "My label" },
    m: { "phy.0.0": { b: 1, n: 4, c: 3, d: "2026-11-20", p: 1 }, "phy.0.1": { b: 0, n: 2, c: 0, d: "2026-11-12" } },
  };
  const questions = {
    s1: { sid: "phy", src: "seed", q: "seed one" },
    s2: { sid: "phy", src: "seed", q: "seed in today" },
    s3: { sid: "bio", src: "seed", q: "other subject" },
    d1: { sid: "phy", src: "daily", q: "missed" },
    d2: { sid: "phy", src: "daily", q: "right" },
    d3: { sid: "phy", src: "daily", q: "never tried" },
  };
  const answers = { d1: { aw: 1, mx: 3, ok: false }, d2: { aw: 3, mx: 3, ok: true } };

  it("sorts needs-work by next review, finds ready points and totals answers", () => {
    const m = improveModel({ sid: "phy", progress, questions, answers, todayQids: ["s2"] });
    expect(m.needsWork).toEqual(["phy.0.1", "phy.0.0"]);
    expect(m.mastered).toEqual(["phy.0.2"]);
    expect(m.ready).toEqual(["phy.0.0"]);
    expect([m.correct, m.attempted]).toEqual([3, 6]);
    expect(m.waiting).toEqual(["d1", "s1"]);
    expect(m.empty).toBe(false);
  });

  it("is empty with nothing covered", () => {
    expect(improveModel({ sid: "phy", progress: {}, questions: {}, answers: {}, todayQids: [] }).empty).toBe(true);
  });

  it("labels and review lines", () => {
    expect(pointName(progress, "phy.0.1")).toBe("My label");
    expect(pointName(progress, "phy.0.0")).toBe("4.1 Energy › Energy stores and transfers in a system");
    expect(pointName(progress, "zzz")).toBe("zzz");
    expect(reviewMeta({ b: 1, n: 4, c: 3, d: "2026-11-20" })).toBe("3/4 correct · streak 1 · next check 20 Nov");
    expect(reviewMeta(undefined)).toBe("Not tested yet");
    expect(shortDay(undefined)).toBe("");
  });
});

describe("practice papers done (legacy pdone)", () => {
  it("toggles a paper with today's date and ignores junk", () => {
    const a = togglePaperDone(undefined, "Physics_4.1_Energy", "2026-11-11");
    expect(a).toEqual({ "Physics_4.1_Energy": "2026-11-11" });
    expect(togglePaperDone(a, "Physics_4.1_Energy", "2026-11-12")).toEqual({});
    expect(asPapersDone({ a: "2026-01-01", b: 3, c: "" })).toEqual({ a: "2026-01-01" });
    expect(asPapersDone([1])).toEqual({});
  });
});
