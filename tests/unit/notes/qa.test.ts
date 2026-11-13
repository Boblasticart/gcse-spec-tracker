import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_COURSE, type LegacySubjectId } from "@/content";
import { qaFigure, qaNote } from "@/lib/notes/qa";

const DIR = join(__dirname, "..", "..", "..", "data", "notes");
const read = (f: string): Record<string, unknown> => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, unknown>;
const good = read("phy.0.1.json");

describe("note QA gate", () => {
  it("passes every existing diagram-subject note", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("eng."));
    expect(files.length).toBeGreaterThan(400);
    for (const f of files) {
      const pid = f.slice(0, -5);
      const course = LEGACY_COURSE[pid.split(".")[0] as LegacySubjectId];
      const r = qaNote(read(f), { pid, course });
      expect(r.errors, f).toEqual([]);
    }
  });

  it("fails thin notes, with reasons", () => {
    const r = qaNote({ summary: "Short.", core: [], terms: [], mistakes: [], exam: [] }, { pid: "x_a.0.0", course: "physics" });
    expect(r.ok).toBe(false);
    expect(r.errors.join("\n")).toMatch(/summary is 6 characters/);
    expect(r.errors.join("\n")).toMatch(/0 diagrams \(expected at least 3\)/);
  });

  it("asks for fewer diagrams in text subjects", () => {
    const r = qaNote({ ...good, svg: [] }, { pid: "phy.0.1", course: "history" });
    expect(r.errors).toEqual([]);
    expect(qaNote({ ...good, svg: [] }, { pid: "phy.0.1", course: "physics" }).ok).toBe(false);
  });

  it("checks the pid, HTML in text, and size", () => {
    expect(qaNote(good, { pid: "phy.0.2", course: "physics" }).errors).toContain("pid is phy.0.1, expected phy.0.2");
    expect(qaNote({ ...good, summary: `${String(good.summary)} <script>x</script>` }, { pid: "phy.0.1", course: "physics" }).errors).toContain("text contains HTML tags");
    expect(qaNote({ ...good, summary: "x".repeat(130_000) }, { pid: "phy.0.1", course: "physics" }).errors.join()).toMatch(/max 120000/);
  });

  it("checks figures with the app's sanitiser and catches labels outside the picture", () => {
    expect(qaFigure({ cap: "c", svg: '<svg viewBox="0 0 100 50"><text x="10" y="20">ok</text></svg>' }, "f").errors).toEqual([]);
    expect(qaFigure({ cap: "c", svg: '<svg viewBox="0 0 100 50"><text x="130" y="20">off</text></svg>' }, "f").errors.join()).toMatch(/outside the picture/);
    expect(qaFigure({ cap: "c", svg: '<svg viewBox="0 0 100 50"><foreignObject/></svg>' }, "f").errors.join()).toMatch(/drop <foreignObject>/);
    expect(qaFigure({ cap: "", svg: "<div/>" }, "f").errors).toEqual(["f: figure has no caption", "f: figure is not a usable SVG"]);
  });
});
