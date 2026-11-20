import { describe, expect, it } from "vitest";

import { AiOutputError } from "@/server/ai/json";

import { ModelUnavailable, RateLimited, checkFinished, classifyHttpError, geminiFlashModels, geminiStreamText, openaiStreamText, parseSse } from "../../scripts/notes/providers";

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

  it("does not blame the model when a reply fails the provider's JSON check", () => {
    expect(classifyHttpError(400, '{"error":{"message":"Failed to generate JSON. Please adjust your prompt.","failed_generation":"{\\"exam\\":[{\\"model\\":[]}]}"}}')).toBeNull();
    expect(classifyHttpError(400, '{"error":{"message":"`max_tokens` must be less than or equal to `4096`"}}')).toBeInstanceOf(ModelUnavailable);
    expect(classifyHttpError(400, '{"error":{"message":"The model `x` has been decommissioned"}}')).toBeInstanceOf(ModelUnavailable);
  });

  it("reads streamed replies", () => {
    const gemini = parseSse('data: {"candidates":[{"content":{"parts":[{"text":"think","thought":true},{"text":"{\\"a\\":"}]}}]}\r\n\r\ndata: {"candidates":[{"content":{"parts":[{"text":"1}"}]},"finishReason":"STOP"}]}\n\n');
    expect(geminiStreamText(gemini)).toEqual({ text: '{"a":1}', finish: "STOP" });
    const openai = parseSse(': OPENROUTER PROCESSING\n\ndata: {"choices":[{"delta":{"content":"{\\"a\\""}}]}\n\ndata: {"choices":[{"delta":{"content":":1}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    expect(openaiStreamText(openai)).toEqual({ text: '{"a":1}', finish: "stop" });
    expect(openaiStreamText(parseSse('{"choices":[{"message":{"content":"plain"},"finish_reason":"stop"}]}'))).toEqual({ text: "plain", finish: "stop" });
    expect(parseSse("not json")).toEqual([]);
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

  it("says why a reply stopped early when it can't be read", () => {
    expect(checkFinished('{"a":1}', "STOP", "STOP")).toBe('{"a":1}');
    expect(checkFinished('{"a":1}', "MAX_TOKENS", "STOP")).toBe('{"a":1}');
    expect(() => checkFinished('{"a":"half', "MAX_TOKENS", "STOP")).toThrow(/stopped early \(MAX_TOKENS\) after 10 characters/);
    expect(() => checkFinished('{"a":"half', "length", "stop")).toThrow(AiOutputError);
  });
});
