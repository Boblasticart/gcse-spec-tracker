/** Raised when the model's reply can't be turned into what we need. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

/**
 * Parses a model reply that should be JSON but may be wrapped in a ```json
 * fence or surrounded by chatter (same fallbacks as the old marking worker).
 */
export function parseModelJson(text: string): unknown {
  const tryParse = (s: string): { ok: true; value: unknown } | { ok: false } => {
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch {
      return { ok: false };
    }
  };
  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct.ok) return direct.value;
  const fenced = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced?.[1]) {
    const inner = tryParse(fenced[1].trim());
    if (inner.ok) return inner.value;
  }
  const a = trimmed.indexOf("{");
  const b = trimmed.lastIndexOf("}");
  if (a >= 0 && b > a) {
    const sliced = tryParse(trimmed.slice(a, b + 1));
    if (sliced.ok) return sliced.value;
  }
  throw new AiOutputError("The AI did not return JSON.");
}

/** Plain object or an empty one. */
export function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
