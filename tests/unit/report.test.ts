import { describe, expect, it } from "vitest";

import { buildReport, reportFileName } from "@/lib/tracker/report";

describe("progress report data", () => {
  const docs = {
    "progress/phy": { s: { "phy.0.0": 2, "phy.0.1": 1 }, c: { "phy.0.1": "4.1 Energy › Kinetic “energy”" }, m: {}, w: {}, v: 2 },
    "progress/bio": { s: { "bio.0.0": 1 }, c: {}, m: {}, w: {}, v: 2 },
    "a/q1": { pid: "phy.0.0", aw: 2, mx: 3, ts: "2026-11-10T10:00:00Z" },
    "a/q2": { pid: "bio.0.0", aw: 1, mx: 1, ts: "2026-11-11T10:00:00Z" },
    "a/q3": { pid: "nope", aw: 0, mx: 2, ts: "2026-11-09T10:00:00Z" },
    "qr/phy.0": { aw: 4, mx: 4, ts: "2026-11-11T09:00:00Z", items: [{ ans: "x" }] },
    "stats/time": { days: { "2026-11-11": 600, "2026-11-01": 1200 } },
  };
  const r = buildReport({ email: "me@example.test", today: "2026-11-11", docs });

  it("has the student, the date and every subject", () => {
    expect(r.email).toBe("me@example.test");
    expect(r.date).toBe("11 Nov 2026");
    expect(r.subjects.map((s) => s.name)).toContain("Physics");
    expect(r.subjects).toHaveLength(8);
  });

  it("counts mastery and lists needs-work points in plain characters", () => {
    const phy = r.subjects.find((s) => s.sid === "phy")!;
    expect(phy.counts[2]).toBe(1);
    expect(phy.counts[1]).toBe(1);
    expect(phy.needsWork).toEqual(['4.1 Energy > Kinetic "energy"']);
    expect(r.overall.counts[2]).toBe(1);
    expect(r.overall.counts[1]).toBe(2);
  });

  it("recent marks are newest first with subject and point", () => {
    expect(r.recentMarks.map((m) => [m.day, m.subject, m.aw, m.mx])).toEqual([
      ["11 Nov", "Biology", 1, 1],
      ["10 Nov", "Physics", 2, 3],
      ["9 Nov", "", 0, 2],
    ]);
    expect(r.recentMarks[1]!.label).toBe("4.1 Energy > Energy stores and transfers in a system");
    expect(r.recentMarks[2]!.label).toBe("Question");
  });

  it("study totals", () => {
    expect([r.answered, r.marksPct, r.streak]).toEqual([4, 70, 3]);
    expect([r.studyToday, r.studyWeek, r.studyTotal]).toEqual(["10 min", "10 min", "30 min"]);
    expect(reportFileName("2026-11-11")).toBe("gcse-progress-2026-11-11.pdf");
  });
});
