import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEGACY_ACTIONS, LEGACY_VIEWS } from "@/content/legacy-map";
import { LEGACY_PROMPTS } from "@/content";

const parity = readFileSync(join(__dirname, "..", "..", "docs", "PARITY.md"), "utf8");

describe("docs/PARITY.md", () => {
  it("lists every legacy action", () => {
    for (const a of LEGACY_ACTIONS) expect(parity, a.name).toContain("`" + a.name + "`");
  });
  it("lists every legacy view", () => {
    for (const v of LEGACY_VIEWS) expect(parity, v.name).toContain("view `" + v.name + "`");
  });
  it("lists every legacy prompt", () => {
    for (const p of Object.values(LEGACY_PROMPTS)) expect(parity, p.id).toContain("`" + p.id + "`");
  });
});
