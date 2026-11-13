import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATALOGUE,
  COURSES,
  SPEC_ID_RE,
  buildSpec,
  chosenSpecId,
  chosenSpecs,
  getPoint,
  getSubject,
  specLabel,
  specsForCourse,
  withBoard,
  type RawSpec,
  type Spec,
} from "@/content";
import { EXTRA_SPECS as EXTRA_SPECS_FOR_TEST } from "@/content/extra-specs";

const LEGACY = ["phy", "bio", "chem", "maths", "cs", "geo", "eng", "bus"];

describe("spec catalogue", () => {
  it("keeps the legacy specs, ids and order as each course's default", () => {
    expect(chosenSpecs(undefined).map((s) => s.id)).toEqual(LEGACY);
    expect(getPoint("phy.0.1")?.point.text).toBe("Kinetic, gravitational and elastic potential energy calculations");
    expect(getSubject("phy")?.course).toBe("physics");
    expect(specLabel(getSubject("maths")!)).toBe("Edexcel 1MA1 Higher");
  });

  it("numbers catalogue spec points by position, topics across papers", () => {
    const s = buildSpec({
      id: "x_test",
      course: "history",
      name: "History",
      board: "AQA",
      code: "8145",
      papers: [
        { name: "Paper 1", topics: [{ name: "A", points: ["a0", "a1"] }] },
        { name: "Paper 2", topics: [{ name: "B", points: ["b0"] }] },
      ],
    });
    expect(s.papers[1]?.topics[0]?.id).toBe("x_test.1");
    expect(s.papers[1]?.topics[0]?.points[0]?.id).toBe("x_test.1.0");
  });

  it("uses the student's choice, falls back to the default, and allows 'not taking'", () => {
    const extra: Spec = buildSpec({ id: "phy_other", course: "physics", name: "Physics", board: "OCR", code: "J249", papers: [] });
    const cat = [...CATALOGUE, extra];
    expect(chosenSpecId(withBoard(undefined, "physics", "phy_other"), "physics", cat)).toBe("phy_other");
    expect(chosenSpecId({ boards: { physics: "gone" } }, "physics", cat)).toBe("phy");
    expect(chosenSpecId({ boards: { physics: "bio" } }, "physics", cat)).toBe("phy");
    const ids = chosenSpecs({ boards: { physics: "", french: "nope" } }, cat).map((s) => s.id);
    expect(ids).not.toContain("phy");
    expect(ids).toHaveLength(LEGACY.length - 1);
    expect(withBoard({ boards: { maths: "maths" }, extra: 1 }, "physics", "phy_other")).toEqual({ boards: { maths: "maths", physics: "phy_other" }, extra: 1, v: 1 });
  });

  it("holds 60+ specs with unique ids", () => {
    const many: RawSpec[] = Array.from({ length: 64 }, (_, i) => ({
      id: `spec_${i}`,
      course: COURSES[i % COURSES.length]!.id,
      name: "Subject",
      board: "Board",
      code: `C${i}`,
      papers: [{ name: "Paper 1", topics: Array.from({ length: 20 }, (_, t) => ({ name: `T${t}`, points: Array.from({ length: 6 }, (_, p) => `P${p}`) })) }],
    }));
    const built = many.map(buildSpec);
    const ids = built.flatMap((s) => s.papers.flatMap((p) => p.topics.flatMap((t) => t.points.map((pt) => pt.id))));
    expect(ids).toHaveLength(64 * 120);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COURSES) expect(specsForCourse(c.id, built).length).toBeGreaterThan(3);
  });

  it("has valid spec files, all listed in extra-specs.ts", () => {
    const dir = join(__dirname, "..", "..", "content", "specs");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(EXTRA_SPECS_FOR_TEST.map((s) => `${s.id}.json`).sort()).toEqual(files.sort());
    const courses = new Set(COURSES.map((c) => c.id));
    const seen = new Set<string>();
    for (const f of files) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as RawSpec;
      expect(raw.id, f).toMatch(SPEC_ID_RE);
      expect(seen.has(raw.id), f).toBe(false);
      seen.add(raw.id);
      expect(courses.has(raw.course), f).toBe(true);
      expect(raw.source, f).toMatch(/^https:\/\//);
      for (const p of raw.papers) for (const t of p.topics) expect(t.points.length, `${f} ${t.name}`).toBeGreaterThan(0);
    }
  });

  it("never reuses a legacy id for a catalogue spec", () => {
    const ids = CATALOGUE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of CATALOGUE) if (!LEGACY.includes(s.id)) expect(s.id).toMatch(SPEC_ID_RE);
  });
});
