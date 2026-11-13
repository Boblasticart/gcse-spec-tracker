import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { checkFigures, figuresOf } from "../../scripts/notes/render-check";

/** J2: the render check that every generated note's figures must pass. */
const fig = (body: string): { id: string; svg: string } => ({ id: "t", svg: `<svg viewBox="0 0 400 200">${body}</svg>` });

test("render check passes clean figures and catches overlapping or cut-off labels", async ({ page }) => {
  expect(await checkFigures(page, [fig('<text x="20" y="40">pipette</text><text x="20" y="80">forceps</text>')])).toEqual([]);

  const overlap = await checkFigures(page, [fig('<text x="20" y="40">mounted needle</text><text x="40" y="42">nucleus</text>')]);
  expect(overlap.map((p) => p.problem)).toEqual(["overlap"]);

  const cut = await checkFigures(page, [fig('<text x="380" y="40">a long label at the edge</text>')]);
  expect(cut.map((p) => p.problem)).toEqual(["cut-off"]);

  expect((await checkFigures(page, [{ id: "bad", svg: "<div/>" }]))[0]?.problem).toBe("empty");
});

test("render check passes existing notes with clean figures", async ({ page }) => {
  for (const pid of ["phy.0.0", "phy.0.1", "phy.1.1", "chem.0.0", "maths.0.0", "geo.0.0"]) {
    const note: unknown = JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "notes", `${pid}.json`), "utf8"));
    const figures = figuresOf(pid, note);
    expect(figures.length, pid).toBeGreaterThan(0);
    expect(await checkFigures(page, figures), pid).toEqual([]);
  }
});
