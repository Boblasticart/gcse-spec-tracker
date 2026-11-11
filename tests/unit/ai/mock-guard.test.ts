import { afterEach, describe, expect, it } from "vitest";

import { mockAllowed } from "@/server/ai/mock";

const saved = { mock: process.env.AI_MOCK, vercel: process.env.VERCEL };
afterEach(() => {
  if (saved.mock === undefined) delete process.env.AI_MOCK;
  else process.env.AI_MOCK = saved.mock;
  if (saved.vercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = saved.vercel;
});

describe("test-only AI stand-in", () => {
  it("is only used with AI_MOCK=1 and never on Vercel", () => {
    delete process.env.VERCEL;
    process.env.AI_MOCK = "1";
    expect(mockAllowed()).toBe(true);
    process.env.VERCEL = "1";
    expect(mockAllowed()).toBe(false);
    delete process.env.VERCEL;
    process.env.AI_MOCK = "0";
    expect(mockAllowed()).toBe(false);
  });
});
