import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { LEGACY_FUNCTIONS, REVIEW_INTERVALS as LEGACY_INT } from "@/content/legacy-map";
import { pointLabel } from "@/content";
import { addDays } from "@/lib/dates";
import {
  answerDoc,
  applyQuizResult,
  decideReview,
  newQuestionId,
  quizLostPoints,
  recordResult,
  REVIEW_INTERVALS,
  reviewGroups,
  reviewNeeds,
  reviewSuggestion,
  seedPool,
  todayStats,
  type QuizDoc,
  type QuizResultDoc,
  type SavedAnswer,
} from "@/lib/tracker/study";

const html = readFileSync(join(__dirname, "..", "..", "index.html"), "utf8").split("\n");
const legacyFn = (name: string): string => {
  const f = LEGACY_FUNCTIONS.find((x) => x.name === name);
  if (!f) throw new Error(name);
  return html.slice(f.startLine - 1, f.endLine).join("\n");
};

/** Runs the legacy recordResult from index.html on the same data. */
function legacyRecord(progress: { s: Record<string, number>; c: Record<string, string>; m: Record<string, unknown> }, q: object, aw: number, mx: number, today: string) {
  const sid = (q as { sid: string }).sid;
  const S = { [sid]: structuredClone(progress.s) };
  const C = { [sid]: structuredClone(progress.c) };
  const M = { [sid]: structuredClone(progress.m) };
  const pid = (q as { pid?: string }).pid ?? "";
  const ctx = createContext({ S, C, M, LBL: { [pid]: pointLabel(pid) }, INT: [...LEGACY_INT], today: () => today, addDays, queue: () => {}, q, aw, mx });
  runInContext(`${legacyFn("recordResult")}\nrecordResult(q, aw, mx);`, ctx);
  return { s: S[sid], c: C[sid], m: M[sid] };
}

describe("study rules match the legacy tracker", () => {
  it("uses the legacy review intervals", () => {
    expect([...REVIEW_INTERVALS]).toEqual([...LEGACY_INT]);
  });

  const cases: [string, { s: Record<string, number>; c: Record<string, string>; m: Record<string, unknown> }, number, number][] = [
    ["first answer, right", { s: {}, c: {}, m: {} }, 2, 2],
    ["first answer, wrong", { s: {}, c: {}, m: {} }, 1, 3],
    ["third right in a row asks for a decision", { s: { "phy.0.0": 1 }, c: {}, m: { "phy.0.0": { b: 2, n: 2, c: 2 } } }, 3, 4],
    ["a wrong answer on a Done point drops it to Needs work", { s: { "phy.0.0": 2 }, c: {}, m: { "phy.0.0": { b: 4, n: 5, c: 5, p: 1 } } }, 0, 4],
    ["right on a Done point keeps it Done", { s: { "phy.0.0": 2 }, c: {}, m: { "phy.0.0": { b: 5, n: 5, c: 5 } } }, 4, 4],
  ];
  it.each(cases)("recordResult: %s", (_n, before, aw, mx) => {
    const q = { sid: "phy", pid: "phy.0.0", label: "x", marks: mx, q: "?" };
    const ours = recordResult({ ...before, w: {}, v: 2 }, q, aw, mx, "2026-11-11");
    const legacy = legacyRecord(before, q, aw, mx, "2026-11-11");
    expect({ s: ours.s, c: ours.c, m: ours.m }).toEqual(legacy);
  });

  it("answer docs count tries and pass at 70%", () => {
    const q = { sid: "phy", pid: "phy.0.0", marks: 3, q: "?" };
    const a = answerDoc(q, "ans", { aw: 2, hit: [1, 2], expl: "e", tip: "t" }, { tries: 2 }, "2026-11-11T00:00:00.000Z");
    expect(a).toEqual({ sid: "phy", pid: "phy.0.0", ans: "ans", aw: 2, mx: 3, ok: false, hit: [1, 2], expl: "e", tip: "t", ts: "2026-11-11T00:00:00.000Z", tries: 3 });
    expect(answerDoc({ ...q, marks: 10 }, "a", { aw: 7, hit: [], expl: "", tip: "" }, undefined, "t").ok).toBe(true);
  });

  it("question ids and the more7 seed pool", () => {
    expect(newQuestionId("2026-11-11", "phy", 3, false, 0)).toBe("d2026-11-11-phy-3");
    expect(newQuestionId("2026-11-11", "phy", 3, true, 36)).toBe("d2026-11-11-phy-m103");
    const qs = { a: { sid: "phy", src: "seed" }, b: { sid: "phy", src: "seed" }, c: { sid: "phy", src: "daily" }, d: { sid: "bio", src: "seed" }, e: { sid: "phy", src: "seed" } };
    expect(seedPool(qs, { b: {} }, "phy", ["e"])).toEqual(["a"]);
  });

  const ans = (aw: number, mx: number): SavedAnswer => ({ pid: "", ans: "x", aw, mx, ok: aw / mx >= 0.7, hit: [], expl: "", tip: "", ts: "", tries: 1 });
  const daily = { sid: "phy", date: "2026-11-11", qids: ["q1", "q2", "q3", "q4"] };
  const questions = { q1: { sid: "phy", pid: "p1", label: "P1" }, q2: { sid: "phy", pid: "p1", label: "P1" }, q3: { sid: "phy", pid: "p2", label: "P2" }, q4: { sid: "phy", pid: "p2", label: "P2" } };
  const answers = { q1: ans(2, 2), q2: ans(1, 3), q3: ans(0, 2) };

  it("today's stats, review groups and what still needs reviewing", () => {
    expect(todayStats(daily, answers)).toEqual({ n: 4, done: 3, aw: 3, mx: 7 });
    expect(todayStats(null, answers)).toBeNull();
    expect(reviewGroups(daily, questions, answers)).toEqual([
      { pid: "p1", sid: "phy", label: "P1", aw: 3, mx: 5, qs: ["q1", "q2"] },
      { pid: "p2", sid: "phy", label: "P2", aw: 0, mx: 2, qs: ["q3"] },
    ]);
    expect(reviewNeeds(daily, questions, answers, {})).toEqual(["q2", "q3"]);
    expect(reviewNeeds(daily, questions, answers, { q2: {} })).toEqual(["q3"]);
  });

  it("dec and the review suggestion", () => {
    expect(reviewSuggestion({ s: { a: 1 }, m: { a: { b: 3, n: 3, c: 3 } } }, "a")).toBe("Mastered");
    expect(reviewSuggestion({ s: { a: 1 } }, "a")).toBe("Needs more work");
    const done = decideReview({ s: { "phy.0.0": 1 }, m: { "phy.0.0": { b: 3, n: 3, c: 3, p: 1 } } }, "phy.0.0", 2, "2026-11-11");
    expect(done.s["phy.0.0"]).toBe(2);
    expect(done.m["phy.0.0"]?.p).toBe(0);
    const more = decideReview({ s: { "phy.0.0": 2 } }, "phy.0.0", 1, "2026-11-11");
    expect(more.s["phy.0.0"]).toBe(1);
    expect(more.m["phy.0.0"]).toEqual({ b: 0, n: 0, c: 0, p: 0, d: "2026-11-12" });
    expect(more.c["phy.0.0"]).toBe(pointLabel("phy.0.0"));
  });

  it("a quiz pass marks the topic Done; a fail keeps it Needs work for tomorrow", () => {
    const pass = applyQuizResult({ m: { a: { b: 1, n: 1, c: 1 } } }, ["a", "b"], true, "2026-11-11");
    expect(pass.s).toEqual({ a: 2, b: 2 });
    expect(pass.m.a).toEqual({ b: 3, n: 1, c: 1, p: 0, d: "2026-11-19" });
    expect(pass.m.b).toEqual({ b: 3, n: 0, c: 0, p: 0, d: "2026-11-19" });
    const fail = applyQuizResult({ s: { a: 2 }, m: { a: { b: 5, n: 1, c: 1 } } }, ["a"], false, "2026-11-11");
    expect(fail.s).toEqual({ a: 1 });
    expect(fail.m.a).toEqual({ b: 1, n: 1, c: 1, p: 0, d: "2026-11-12" });
  });

  it("lists the points to re-read after a quiz", () => {
    const quiz: QuizDoc = { sid: "phy", tid: "phy.0", ts: "t", qs: [1, 2, 3].map((m, i) => ({ pid: `p${i % 2}`, marks: m, q: "", scheme: [], notes: "" })) };
    const res: QuizResultDoc = { sid: "phy", tid: "phy.0", qts: "t", aw: 3, mx: 6, pct: 50, pass: false, ts: "", items: [{ aw: 1, hit: [], expl: "", ans: "" }, { aw: 0, hit: [], expl: "", ans: "" }, { aw: 2, hit: [], expl: "", ans: "" }] };
    expect(quizLostPoints(quiz, res)).toEqual(["p1", "p0"]);
  });
});
