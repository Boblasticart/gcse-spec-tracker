import "server-only";

import type { TaskId } from "@/lib/ai/tasks";

export interface ModelRequest {
  task: TaskId;
  prompt: string;
  /** The validated task input (only the test mock looks at it). */
  input: unknown;
}

/** Something that answers a prompt with text (Gemini, or a fake in tests). */
export type Model = (req: ModelRequest) => Promise<string>;

export class ModelError extends Error {
  readonly kind: "rate_limited" | "failed" | "unavailable";

  constructor(kind: ModelError["kind"], message: string) {
    super(message);
    this.name = "ModelError";
    this.kind = kind;
  }
}
