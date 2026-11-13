/** Typed access to the content extracted from the legacy tracker. */
import { CATALOGUE, type Spec } from "./catalogue";
import { PAPERS } from "./papers";
import { LEGACY_PROMPTS } from "./prompts";
import { SPEC } from "./spec";
import type { LegacyPrompt, PracticePaper, SpecPoint, Subject, SubjectId, Topic } from "./types";

export * from "./types";
export * from "./catalogue";
export { PAPERS, LEGACY_PROMPTS, SPEC };

export interface PointRef {
  readonly subject: Spec;
  readonly paperName: string;
  readonly topic: Topic;
  readonly point: SpecPoint;
  readonly index: number;
}

export interface TopicRef {
  readonly subject: Spec;
  readonly paperName: string;
  readonly topic: Topic;
}

const subjectsById = new Map<string, Spec>(CATALOGUE.map((s) => [s.id, s]));
const topicsById = new Map<string, TopicRef>();
const pointsById = new Map<string, PointRef>();

for (const subject of CATALOGUE) {
  for (const paper of subject.papers) {
    for (const topic of paper.topics) {
      topicsById.set(topic.id, { subject, paperName: paper.name, topic });
      topic.points.forEach((point, index) => {
        pointsById.set(point.id, { subject, paperName: paper.name, topic, point, index });
      });
    }
  }
}

/** Every spec id in the catalogue (legacy ids first). */
export const SUBJECT_IDS: readonly SubjectId[] = CATALOGUE.map((s) => s.id);

export function isSubjectId(v: unknown): v is SubjectId {
  return typeof v === "string" && subjectsById.has(v);
}

export function getSubject(id: string): Spec | undefined {
  return subjectsById.get(id);
}

export function getTopic(id: string): TopicRef | undefined {
  return topicsById.get(id);
}

export function getPoint(id: string): PointRef | undefined {
  return pointsById.get(id);
}

/** Every spec point of a subject, in spec order (legacy `allPts`). */
export function allPoints(subject: Subject): SpecPoint[] {
  return subject.papers.flatMap((p) => p.topics.flatMap((t) => [...t.points]));
}

/** Legacy `LBL[id]`: "Topic › Point". Empty string for unknown ids. */
export function pointLabel(id: string): string {
  const ref = pointsById.get(id);
  return ref ? `${ref.topic.name} › ${ref.point.text}` : "";
}

export function papersFor(id: SubjectId): readonly PracticePaper[] {
  return PAPERS[id] ?? [];
}

/**
 * Builds a prompt exactly as the legacy template literal would: the literal
 * parts interleaved with `values`, one per legacy expression, in order.
 */
export function fillPrompt(prompt: LegacyPrompt, values: readonly (string | number)[]): string {
  if (values.length !== prompt.exprs.length) {
    throw new Error(`Prompt ${prompt.id} needs ${prompt.exprs.length} values, got ${values.length}`);
  }
  let out = prompt.quasis[0] ?? "";
  values.forEach((v, i) => {
    out += String(v) + (prompt.quasis[i + 1] ?? "");
  });
  return out;
}
