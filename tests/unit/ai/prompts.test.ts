import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { fillPrompt, getPoint, getSubject, getTopic, LEGACY_PROMPTS, pointLabel, type LegacyPrompt } from "@/content";
import { asProgress } from "@/lib/docs";
import { BUILDERS, pickTodayPoints, type TaskContext } from "@/server/ai/tasks";

/**
 * These tests prove the prompts are unchanged: each one is compared with the
 * legacy template literal evaluated by the legacy code itself (taken from
 * index.html) on the same data.
 */
const htmlLines = readFileSync(join(__dirname, "..", "..", "..", "index.html"), "utf8").split("\n");

function legacySource(p: LegacyPrompt, from: string, through: string): string {
  const [start, end] = p.functionLines;
  const body = htmlLines.slice(start - 1, end).join("\n");
  const a = body.indexOf(from);
  const b = body.indexOf("\n", body.indexOf(through, a));
  if (a < 0 || b < 0) throw new Error(`Could not find ${from} in ${p.legacyFunction}`);
  return body.slice(a, b);
}

/** Runs legacy statements, then fills the legacy template with the legacy expressions. */
function legacyPrompt(p: LegacyPrompt, scope: Record<string, unknown>, statements = ""): { text: string; ctx: Record<string, unknown> } {
  const ctx = createContext({ ...scope });
  if (statements) runInContext(statements.replace(/\bconst /g, "var "), ctx);
  const values = p.exprs.map((e) => runInContext(e, ctx) as string | number);
  return { text: fillPrompt(p, values), ctx: ctx as Record<string, unknown> };
}

const ctxWith = (progress: unknown = {}, today = "2026-11-08"): TaskContext => ({
  today,
  progress: async () => asProgress(progress),
});

const phy = getSubject("phy")!;
const question = { marks: 3, q: "Explain why a metal spoon feels cold.", scheme: ["Metal is a good conductor", "Energy transfers from hand", "Quickly"], notes: "Allow 'heat' for energy." };

describe("prompts match the legacy tracker exactly", () => {
  it("todaysSeven (with the legacy point choice)", async () => {
    const p = { s: { "phy.0.0": 1, "phy.0.1": 2, "phy.1.0": 1, "phy.2.3": 2 }, c: { "phy.0.0": "My own label" }, m: { "phy.1.0": { b: 1, n: 1, c: 0, d: "2026-12-01" }, "phy.0.1": { b: 2, n: 2, c: 2, d: "2026-11-01" } }, w: {}, v: 2 };
    const t = "2026-11-08";
    const LBL = Object.fromEntries(Object.keys(p.s).map((id) => [id, pointLabel(id)]));
    const { text, ctx } = legacyPrompt(
      LEGACY_PROMPTS.todaysSeven,
      { s: phy, S: { phy: p.s }, M: { phy: p.m }, C: { phy: p.c }, LBL, t },
      legacySource(LEGACY_PROMPTS.todaysSeven, "const ids=", "const list="),
    );
    expect(pickTodayPoints(asProgress(p), t)).toEqual(ctx.pts);
    const built = await BUILDERS.todaysSeven({ sid: "phy", today: t }, ctxWith(p, t));
    expect(built.prompt).toBe(text);
    expect(built.prompt).toContain("1. My own label");
  });

  it("markAnswer", async () => {
    const ans = "It conducts energy away from my hand.";
    const { text } = legacyPrompt(LEGACY_PROMPTS.markAnswer, { q: question, ans });
    expect((await BUILDERS.markAnswer({ question, answer: ans }, ctxWith())).prompt).toBe(text);
    const { text: noNotes } = legacyPrompt(LEGACY_PROMPTS.markAnswer, { q: { ...question, notes: "" }, ans });
    expect((await BUILDERS.markAnswer({ question: { ...question, notes: "" }, answer: ans }, ctxWith())).prompt).toBe(noNotes);
  });

  it("reviewWeaknesses", async () => {
    const items = [
      { label: "4.1 Energy › Power", question, ans: "It is cold", hit: [1], aw: 1, mx: 3 },
      { label: "4.2 Electricity › V = IR", question: { ...question, marks: 2, scheme: ["a", "b"] }, ans: "", hit: [], aw: 0, mx: 2 },
    ];
    const Q = { x1: { label: items[0]!.label, ...items[0]!.question }, x2: { label: items[1]!.label, ...items[1]!.question } };
    const A = { x1: { ans: items[0]!.ans, hit: items[0]!.hit, aw: 1, mx: 3 }, x2: { ans: "", hit: [], aw: 0, mx: 2 } };
    const { text } = legacyPrompt(
      LEGACY_PROMPTS.reviewWeaknesses,
      { s: phy, need: ["x1", "x2"], Q, A },
      legacySource(LEGACY_PROMPTS.reviewWeaknesses, "const blocks=", "const blocks="),
    );
    expect((await BUILDERS.reviewWeaknesses({ sid: "phy", items }, ctxWith())).prompt).toBe(text);
  });

  it("writeNote", async () => {
    const pid = "bio.0.3";
    const ref = getPoint(pid)!;
    const tp = { paper: ref.paperName, topic: { name: ref.topic.name, pts: ref.topic.points } };
    const { text } = legacyPrompt(
      LEGACY_PROMPTS.writeNote,
      { s: ref.subject, tp, pt: { text: ref.point.text }, pid },
      legacySource(LEGACY_PROMPTS.writeNote, "const others=", "const others="),
    );
    expect((await BUILDERS.writeNote({ pid }, ctxWith())).prompt).toBe(text);
  });

  it("writeQuiz", async () => {
    const tid = "chem.2";
    const ref = getTopic(tid)!;
    const tp = { topic: { name: ref.topic.name, pts: ref.topic.points } };
    const { text } = legacyPrompt(
      LEGACY_PROMPTS.writeQuiz,
      { s: ref.subject, tp },
      legacySource(LEGACY_PROMPTS.writeQuiz, "const list=", "const list="),
    );
    expect((await BUILDERS.writeQuiz({ tid }, ctxWith())).prompt).toBe(text);
  });

  it("markQuiz", async () => {
    const tid = "chem.2";
    const qs = [question, { marks: 2, q: "State Avogadro's constant.", scheme: ["6.02", "× 10²³"], notes: "" }];
    const dr = ["  conducts  ", ""];
    const { text } = legacyPrompt(
      LEGACY_PROMPTS.markQuiz,
      { s: getSubject("chem"), quiz: { qs }, dr },
      legacySource(LEGACY_PROMPTS.markQuiz, "const blocks=", "const blocks="),
    );
    expect((await BUILDERS.markQuiz({ tid, questions: qs, answers: dr }, ctxWith())).prompt).toBe(text);
  });
});

describe("today's 7 point choice", () => {
  it("puts weak points first, then mastered ones, and repeats to fill 7", () => {
    const p = asProgress({ s: { a: 2, b: 1 }, m: {} });
    expect(pickTodayPoints(p, "2026-11-08")).toEqual(["b", "a", "b", "a", "b", "a", "b"]);
  });

  it("brings back mastered topics when nothing is weak", () => {
    const p = asProgress({ s: { a: 2, c: 2 }, m: { a: { b: 3, n: 3, c: 3, d: "2026-12-01" } } });
    expect(pickTodayPoints(p, "2026-11-08").slice(0, 2)).toEqual(["c", "a"]);
  });

  it("returns nothing when nothing is covered", () => {
    expect(pickTodayPoints(asProgress({}), "2026-11-08")).toEqual([]);
  });
});
