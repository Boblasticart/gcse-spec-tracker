import { describe, expect, it } from "vitest";

import { mergeProgress, resolveConflict } from "@/client/sync/merge";

const prog = (s: Record<string, number>, extra: Record<string, unknown> = {}) => ({ s, c: {}, m: {}, w: {}, v: 2, ...extra });

describe("progress merge", () => {
  it("keeps the server's other keys and replays only local changes", () => {
    const base = prog({ a: 1, b: 2 });
    const local = prog({ a: 2, b: 2 }); // this device changed a
    const server = prog({ a: 1, b: 2, c: 1 }); // another device added c
    expect(mergeProgress(base, local, server).s).toEqual({ a: 2, b: 2, c: 1 });
  });

  it("lets locally changed keys win over the server", () => {
    const merged = mergeProgress(prog({ a: 1 }), prog({ a: 2 }), prog({ a: 0 }));
    expect(merged.s.a).toBe(2);
  });

  it("keeps keys only the server changed", () => {
    const merged = mergeProgress(prog({ a: 1, b: 1 }), prog({ a: 1, b: 1 }), prog({ a: 2, b: 1 }));
    expect(merged.s).toEqual({ a: 2, b: 1 });
  });

  it("applies local deletions (Not done)", () => {
    const merged = mergeProgress(prog({ a: 2, b: 1 }), prog({ b: 1 }), prog({ a: 2, b: 2 }));
    expect(merged.s).toEqual({ b: 2 });
  });

  it("merges every map and compares review state deeply", () => {
    const base = { s: {}, c: {}, m: { p1: { b: 1, n: 1, c: 1 } }, w: {}, v: 2 };
    const local = { s: {}, c: { p2: "L" }, m: { p1: { b: 2, n: 2, c: 2 } }, w: { p2: 1 }, v: 2 };
    const server = { s: { p3: 2 }, c: {}, m: { p1: { b: 1, n: 1, c: 1 } }, w: { p3: 1 }, v: 2, extra: "kept" };
    const merged = mergeProgress(base, local, server);
    expect(merged.m.p1).toEqual({ b: 2, n: 2, c: 2 });
    expect(merged.c).toEqual({ p2: "L" });
    expect(merged.w).toEqual({ p2: 1, p3: 1 });
    expect(merged.s).toEqual({ p3: 2 });
    expect((merged as unknown as { extra: string }).extra).toBe("kept");
  });

  it("does not modify its inputs", () => {
    const server = prog({ a: 1 });
    mergeProgress(prog({}), prog({ b: 2 }), server);
    expect(server.s).toEqual({ a: 1 });
  });
});

describe("conflict resolution", () => {
  it("merges progress docs", () => {
    expect(resolveConflict("progress/phy", prog({}), prog({ x: 2 }), prog({ y: 1 }))).toMatchObject({ s: { x: 2, y: 1 } });
  });

  it("is last-writer-wins for everything else", () => {
    expect(resolveConflict("a/q1", { t: 1 }, { t: 3 }, { t: 2 })).toEqual({ t: 3 });
    expect(resolveConflict("progress/phy", prog({}), null, prog({ y: 1 }))).toBeNull();
  });
});
