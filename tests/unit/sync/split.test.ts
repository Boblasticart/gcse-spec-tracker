import { describe, expect, it } from "vitest";

import { splitExport } from "@/features/backup/split";
import type { ExportFile } from "@/lib/docs";

const file = (n: number): ExportFile => ({
  format: "gcse-spec-tracker-export",
  version: 1,
  exported: "2026-11-01T00:00:00.000Z",
  collections: { a: Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, { text: "x".repeat(100) }])) },
});

describe("splitting big exports", () => {
  it("keeps small files whole", () => {
    expect(splitExport(file(3))).toHaveLength(1);
  });

  it("splits into valid export files with every doc exactly once", () => {
    const parts = splitExport(file(50), 1000);
    expect(parts.length).toBeGreaterThan(5);
    const ids = parts.flatMap((p) => Object.keys(p.collections.a ?? {}));
    expect(new Set(ids).size).toBe(50);
    for (const p of parts) expect(p.format).toBe("gcse-spec-tracker-export");
  });
});
