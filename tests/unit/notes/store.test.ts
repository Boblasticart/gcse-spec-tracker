import { describe, expect, it } from "vitest";

import { isLegacySpecId, noteShardPath } from "@/lib/notes/store";

describe("note storage", () => {
  it("keeps legacy notes where they are", () => {
    expect(isLegacySpecId("phy")).toBe(true);
    expect(noteShardPath("phy.0.1")).toBeNull();
  });

  it("puts catalogue notes in one static file per topic", () => {
    expect(noteShardPath("phy_ocra.12.3")).toBe("/content/notes/phy_ocra/12.json");
  });

  it("refuses odd ids", () => {
    expect(noteShardPath("../x.0.0")).toBeNull();
    expect(noteShardPath("toString.0.0")).toBeNull();
    expect(noteShardPath("phy_ocra.1")).toBeNull();
  });
});
