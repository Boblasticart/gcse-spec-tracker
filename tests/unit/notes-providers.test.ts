import { describe, expect, it } from "vitest";

import { ModelUnavailable, RateLimited, classifyHttpError, geminiFlashModels } from "../../scripts/notes/providers";

describe("note writer: provider replies", () => {
  it("moves on to another model when a model can't be used", () => {
    expect(classifyHttpError(403, '{"error":{"message":"x:free is only available on agentic harnesses"}}')).toBeInstanceOf(ModelUnavailable);
    expect(classifyHttpError(429, '{"error":{"message":"Request too large for model `qwen` ... tokens per minute"}}')).toBeInstanceOf(ModelUnavailable);
    expect(classifyHttpError(404, "not found")).toBeInstanceOf(ModelUnavailable);
  });

  it("treats limits and busy servers as waits, and spots daily limits", () => {
    const minute = classifyHttpError(429, '{"error":{"message":"Rate limit reached ... tokens per minute (TPM)"}}', 5000);
    expect(minute).toBeInstanceOf(RateLimited);
    expect((minute as RateLimited).daily).toBe(false);
    expect((minute as RateLimited).retryAfterMs).toBe(5000);
    const day = classifyHttpError(429, '{"error":{"message":"You exceeded your current quota","details":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}}');
    expect((day as RateLimited).daily).toBe(true);
    expect(classifyHttpError(503, "high demand")).toBeInstanceOf(RateLimited);
  });

  it("counts ordinary bad requests against the note", () => {
    expect(classifyHttpError(400, '{"error":{"message":"Failed to validate JSON"}}')).toBeNull();
  });

  it("lists text Flash models, newest first", () => {
    const ids = geminiFlashModels([
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
    ]);
    expect(ids).toEqual(["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-2.5-flash"]);
  });
});
