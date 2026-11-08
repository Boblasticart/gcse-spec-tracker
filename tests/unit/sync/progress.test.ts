import { describe, expect, it } from "vitest";

import { countStatuses, statusOf, withStatus } from "@/client/tracker/progress";

describe("legacy setStatus", () => {
  it("saves the status and the point's label", () => {
    const p = withStatus(undefined, "phy.0.0", 2);
    expect(p.s["phy.0.0"]).toBe(2);
    expect(p.c["phy.0.0"]).toBe("4.1 Energy › Energy stores and transfers in a system");
    expect(p.v).toBe(2);
  });

  it("Not done removes the point from s and c but keeps review state", () => {
    const before = { s: { "phy.0.0": 1 }, c: { "phy.0.0": "x" }, m: { "phy.0.0": { b: 1, n: 1, c: 0 } }, w: {}, v: 2 };
    const p = withStatus(before, "phy.0.0", 0);
    expect(p.s).toEqual({});
    expect(p.c).toEqual({});
    expect(p.m["phy.0.0"]).toEqual({ b: 1, n: 1, c: 0 });
    expect(before.s["phy.0.0"]).toBe(1);
  });

  it("reads and counts statuses", () => {
    const p = { s: { a: 2, b: 1, c: 7 } };
    expect(statusOf(p, "a")).toBe(2);
    expect(statusOf(p, "c")).toBe(0);
    expect(statusOf(undefined, "a")).toBe(0);
    expect(countStatuses(p, ["a", "b", "c", "d"])).toEqual([2, 1, 1]);
  });
});
