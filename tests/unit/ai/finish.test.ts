import { describe, expect, it } from "vitest";

import { asProgress } from "@/lib/docs";
import { AiOutputError } from "@/server/ai/json";
import { BUILDERS, type TaskContext } from "@/server/ai/tasks";

const ctx = (s: Record<string, number> = { "phy.0.0": 1 }): TaskContext => ({
  today: "2026-11-08",
  progress: async () => asProgress({ s }),
});
const q = { marks: 3, q: "Q", scheme: ["a", "b", "c"], notes: "" };
const sevenQs = (n: number) => ({ questions: Array.from({ length: n }, (_, i) => ({ n: i + 1, q: `Q${i}`, scheme: ["x", "y"], notes: 5 })) });

describe("legacy result rules", () => {
  it("todaysSeven: needs at least 5 usable questions, marks = scheme length", async () => {
    const b = await BUILDERS.todaysSeven({ sid: "phy" }, ctx());
    const out = b.finish(sevenQs(9));
    expect(out.questions).toHaveLength(7);
    expect(out.questions[0]).toMatchObject({ sid: "phy", pid: "phy.0.0", marks: 2, scheme: ["x", "y"], notes: "5", src: "daily", date: "2026-11-08" });
    expect(() => b.finish(sevenQs(4))).toThrow(AiOutputError);
    expect(() => b.finish({ questions: [{ q: "no scheme" }, ...sevenQs(4).questions] })).toThrow(AiOutputError);
    expect(() => b.finish("nonsense")).toThrow(AiOutputError);
  });

  it("todaysSeven: refuses when nothing is covered, and unknown subjects", async () => {
    await expect(BUILDERS.todaysSeven({ sid: "phy" }, ctx({}))).rejects.toMatchObject({ body: { code: "NOTHING_COVERED" } });
    await expect(BUILDERS.todaysSeven({ sid: "latin" }, ctx())).rejects.toMatchObject({ body: { code: "UNKNOWN_SUBJECT" } });
  });

  it("markAnswer: clamps and rounds the mark", async () => {
    const b = await BUILDERS.markAnswer({ question: q, answer: "x" }, ctx());
    expect(b.finish({ awarded: 9, hit: ["1", 2], explanation: "e", tip: "t" })).toEqual({ aw: 3, hit: [1, 2], expl: "e", tip: "t" });
    expect(b.finish({ awarded: -2 }).aw).toBe(0);
    expect(b.finish({ awarded: "1.6" }).aw).toBe(2);
    expect(b.finish({})).toEqual({ aw: 0, hit: [], expl: "", tip: "" });
  });

  it("reviewWeaknesses: lines items up by number and coerces lists", async () => {
    const item = { label: "L", question: q, ans: "a", hit: [], aw: 0, mx: 3 };
    const b = await BUILDERS.reviewWeaknesses({ sid: "phy", items: [item, item] }, ctx());
    const out = b.finish({ items: [{ n: 2, mistakes: "one", missing: ["m"], terms: null, tip: 7 }, { n: 9 }] });
    expect(out.items).toEqual([null, { mistakes: ["one"], missing: ["m"], terms: [], tip: "7" }]);
  });

  it("writeNote: normalises and needs at least one section", async () => {
    const b = await BUILDERS.writeNote({ pid: "phy.0.0" }, ctx());
    const out = b.finish({ summary: "s", core: [{ h: "H", bullets: [1, 2], table: { head: ["a"], rows: [] } }], analogy: { p: "like" } });
    expect(out.note.core[0]).toEqual({ h: "H", p: "", bullets: ["1", "2"], table: null, callouts: [], fig: [] });
    expect(out.note.analogy).toEqual({ t: "Analogy", p: "like" });
    expect(out.note.src).toBe("ai");
    expect(() => b.finish({ summary: "empty" })).toThrow(AiOutputError);
    await expect(BUILDERS.writeNote({ pid: "phy.99.0" }, ctx())).rejects.toMatchObject({ body: { code: "UNKNOWN_POINT" } });
  });

  it("writeQuiz: needs 6 questions, keeps at most 12, maps pt to the point id", async () => {
    const b = await BUILDERS.writeQuiz({ tid: "phy.1" }, ctx());
    const qs = Array.from({ length: 14 }, (_, i) => ({ pt: (i % 3) + 1, q: `Q${i}`, scheme: ["a", "b", "c"] }));
    const out = b.finish({ questions: qs });
    expect(out.qs).toHaveLength(12);
    expect(out.qs[1]).toEqual({ pid: "phy.1.1", marks: 3, q: "Q1", scheme: ["a", "b", "c"], notes: "" });
    expect(out.qs[0]?.pid).toBe("phy.1.0");
    expect(b.finish({ questions: qs.map((x) => ({ ...x, pt: 99 })) }).qs[0]?.pid).toBe("phy.1.0");
    expect(() => b.finish({ questions: qs.slice(0, 5) })).toThrow(AiOutputError);
  });

  it("markQuiz: totals, percentage and the 80% pass mark", async () => {
    const questions = [q, { ...q, marks: 2, scheme: ["a", "b"] }];
    const b = await BUILDERS.markQuiz({ tid: "phy.1", questions, answers: [" one ", ""] }, ctx());
    const out = b.finish({ items: [{ n: 1, awarded: 3, hit: [1, 2, 3] }, { n: 2, awarded: 1, explanation: "more" }] });
    expect(out).toMatchObject({ aw: 4, mx: 5, pct: 80, pass: true });
    expect(out.items[0]).toEqual({ aw: 3, hit: [1, 2, 3], expl: "", ans: "one" });
    expect(b.finish({ items: [] })).toMatchObject({ aw: 0, pct: 0, pass: false });
    await expect(BUILDERS.markQuiz({ tid: "phy.1", questions, answers: ["", " "] }, ctx())).rejects.toMatchObject({ body: { code: "NO_ANSWERS" } });
  });
});
