import { describe, expect, it } from "vitest";

import { getSubject } from "@/content";
import { addStudySeconds, asStudyTime, formatMinutes, studyMetrics, subjectMetrics } from "@/lib/tracker/metrics";

const phy = getSubject("phy")!;

describe("dashboard metrics", () => {
  it("per-subject counts and mastery", () => {
    const m = subjectMetrics(phy, { s: { "phy.0.0": 2, "phy.0.1": 1, "not.a.point": 2 } });
    expect(m.counts[2]).toBe(1);
    expect(m.counts[1]).toBe(1);
    expect(m.counts[0]).toBe(m.total - 2);
    expect(m.mastery).toBe(Math.round((100 * 1) / m.total));
    expect(subjectMetrics(phy, undefined).mastery).toBe(0);
  });

  it("questions answered, marks and quiz answers", () => {
    const s = studyMetrics(
      [
        { aw: 2, mx: 3, ts: "2026-11-11T09:00:00Z" },
        { aw: 1, mx: 1, ts: "2026-11-10T09:00:00Z" },
      ],
      [{ aw: 4, mx: 6, ts: "2026-11-09T09:00:00Z", items: [{ ans: "x" }, { ans: " " }, { ans: "y" }] }],
      undefined,
      "2026-11-11",
    );
    expect(s.answered).toBe(4);
    expect([s.marksAwarded, s.marksAvailable, s.marksPct]).toEqual([7, 10, 70]);
    expect(s.streak).toBe(3);
    expect(studyMetrics([], [], undefined, "2026-11-11").marksPct).toBeNull();
  });

  it("streak counts back from yesterday when today hasn't started, and needs a minute of study", () => {
    const time = { days: { "2026-11-10": 600, "2026-11-09": 59, "2026-11-08": 120 } };
    expect(studyMetrics([], [], time, "2026-11-11").streak).toBe(1);
    expect(studyMetrics([], [], { days: { ...time.days, "2026-11-09": 60 } }, "2026-11-11").streak).toBe(3);
    expect(studyMetrics([], [], time, "2026-11-13").streak).toBe(0);
  });

  it("study time today, this week and in total (London days)", () => {
    const time = { days: { "2026-11-11": 90, "2026-11-05": 60, "2026-11-04": 30, junk: 5, "2026-11-01": -4 } };
    const s = studyMetrics([], [], time, "2026-11-11");
    expect([s.secondsToday, s.secondsWeek, s.secondsTotal]).toEqual([90, 150, 180]);
    // 23:30 UTC in British Summer Time is the next day in London.
    expect(studyMetrics([{ aw: 1, mx: 1, ts: "2026-07-01T23:30:00Z" }], [], undefined, "2026-07-02").streak).toBe(1);
  });

  it("adds time safely", () => {
    expect(addStudySeconds(undefined, "2026-11-11", 30.9)).toEqual({ days: { "2026-11-11": 30 }, v: 1 });
    expect(addStudySeconds({ days: { "2026-11-11": 21590 } }, "2026-11-11", 100).days["2026-11-11"]).toBe(21600);
    expect(addStudySeconds({ days: { "2026-11-11": 10 } }, "2026-11-11", -5).days["2026-11-11"]).toBe(10);
    expect(asStudyTime({ days: [] })).toEqual({ days: {}, v: 1 });
    expect([formatMinutes(59), formatMinutes(150), formatMinutes(3600), formatMinutes(3900)]).toEqual(["0 min", "2 min", "1 h", "1 h 5 min"]);
  });
});
