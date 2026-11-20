/** Raised when the model's reply can't be turned into what we need. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiOutputError";
  }
}

/** LaTeX commands whose first letter is also a JSON escape (\\f, \\b, \\n, \\r, \\t), so "\\frac" written with one backslash would silently become a form feed + "rac". */
const LATEX_ON_ESCAPE = new Set([
  "frac", "dfrac", "tfrac", "times", "text", "textbf", "textit", "theta", "tan", "tanh", "tau", "triangle", "tilde", "therefore",
  "begin", "beta", "bar", "binom", "boxed", "bmatrix", "big", "Big", "bigg", "bullet", "because", "backslash",
  "neq", "nabla", "not", "notin", "newline", "nearrow", "neg", "ngeq", "nleq",
  "rightarrow", "right", "rho", "rangle", "rceil", "rfloor", "Rightarrow",
  "forall", "flat",
]);

/**
 * Doubles backslashes that a model meant literally (LaTeX such as \\sqrt or \\frac written with one backslash), which
 * otherwise make the reply invalid JSON or silently turn into control characters. Correct escapes are left alone.
 */
export function fixStrayBackslashes(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const next = text[i + 1] ?? "";
    if (next === "\\" || next === '"' || next === "/") {
      out += c + next;
      i++;
      continue;
    }
    if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
      out += c;
      continue;
    }
    if ("bfnrt".includes(next) && next !== "") {
      const word = /^[A-Za-z]+/.exec(text.slice(i + 1))?.[0] ?? "";
      out += LATEX_ON_ESCAPE.has(word) ? "\\\\" : c;
      continue;
    }
    // Anything else after a backslash is not a JSON escape: keep the backslash as text.
    out += "\\\\";
  }
  return out;
}

/**
 * Escapes raw line breaks, tabs and other control characters that a model left inside JSON strings (JSON forbids them,
 * so one stray line break makes the whole reply unreadable). Text outside strings is left alone.
 */
export function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString && c === "\\") {
      out += c + (text[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === '"') inString = !inString;
    const code = text.charCodeAt(i);
    if (inString && code < 0x20) {
      out += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += c;
  }
  return out;
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
      try {
        return { ok: true, value: JSON.parse(escapeControlCharsInStrings(s)) };
      } catch {
        return { ok: false };
      }
    }
  };
  const trimmed = fixStrayBackslashes(text.trim());
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
  const tail = trimmed.slice(-40).replace(/\s+/g, " ");
  throw new AiOutputError(`The AI did not return JSON. (${trimmed.length} characters, ending "${tail}")`);
}

/** Plain object or an empty one. */
export function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
