import { describe, expect, it } from "vitest";

import { geminiModel } from "@/server/ai/gemini";
import { ModelError } from "@/server/ai/model";

const reply = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
const req = { task: "markAnswer" as const, prompt: "p", input: {} };

async function kindOf(status: number, body: unknown): Promise<string> {
  try {
    await geminiModel({ apiKey: "k", fetchImpl: reply(status, body) })(req);
    return "ok";
  } catch (e) {
    return e instanceof ModelError ? e.kind : "other";
  }
}

describe("Gemini client", () => {
  it("sends the key in the x-goog-api-key header (works for AIza and AQ. keys)", async () => {
    let headers: Headers | undefined;
    const f = (async (_u: unknown, init?: RequestInit) => {
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    }) as typeof fetch;
    expect(await geminiModel({ apiKey: "AQ.test", fetchImpl: f })(req)).toBe("{}");
    expect(headers?.get("x-goog-api-key")).toBe("AQ.test");
    expect(headers?.get("authorization")).toBeNull();
  });

  it("tells a rejected key apart from other failures", async () => {
    expect(await kindOf(400, { error: { message: "API key not valid. Please pass a valid API key." } })).toBe("key_rejected");
    expect(await kindOf(401, { error: { message: "ACCESS_TOKEN_TYPE_UNSUPPORTED" } })).toBe("key_rejected");
    expect(await kindOf(403, { error: { message: "Permission denied" } })).toBe("key_rejected");
    expect(await kindOf(429, {})).toBe("rate_limited");
    expect(await kindOf(500, { error: { message: "boom" } })).toBe("failed");
    expect(await kindOf(400, { error: { message: "Invalid JSON payload" } })).toBe("failed");
  });

  it("asks for short thinking, and retries without it if the model doesn't support the setting", async () => {
    const bodies: { generationConfig: { thinkingConfig?: unknown } }[] = [];
    const f = (async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { generationConfig: { thinkingConfig?: unknown } };
      bodies.push(b);
      if (b.generationConfig.thinkingConfig) return new Response(JSON.stringify({ error: { message: "Thinking is not supported by this model." } }), { status: 400 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
    }) as typeof fetch;
    expect(await geminiModel({ apiKey: "k", fetchImpl: f })(req)).toBe("{}");
    expect(bodies[0]?.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 });
    expect(bodies[1]?.generationConfig.thinkingConfig).toBeUndefined();
  });
});
