import { describe, expect, it } from "vitest";

import { isGated } from "@/lib/gated";
import { safeNext } from "@/server/auth/current";

describe("gating", () => {
  it("gates the app pages only", () => {
    expect(isGated("/dashboard")).toBe(true);
    expect(isGated("/today/phy")).toBe(true);
    expect(isGated("/dashboards")).toBe(false);
    expect(isGated("/")).toBe(false);
    expect(isGated("/spec/phy")).toBe(false);
  });

  it("only follows ?next= links that stay on this site", () => {
    expect(safeNext("/today")).toBe("/today");
    expect(safeNext(["/quiz", "/x"])).toBe("/quiz");
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext("/auth/sign-in")).toBe("/dashboard");
  });
});
