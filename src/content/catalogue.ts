/**
 * The spec catalogue: every course (school subject) and every spec (board,
 * code, tier) a student can choose for it. The legacy tracker's eight specs
 * keep their ids and stay each course's default, so existing accounts see
 * exactly what they saw before. Other specs live in `content/specs/*.json`
 * (listed in the generated `extra-specs.ts`).
 */
import { EXTRA_SPECS } from "./extra-specs";
import { FIXTURE_SPECS } from "./fixture-specs";
import { SPEC } from "./spec";
import type { CourseId, LegacySubjectId, RawSpec, Subject } from "./types";

export interface Course {
  readonly id: CourseId;
  readonly name: string;
}

/** Tab order: the legacy subjects first (as before), then the others by popularity. */
export const COURSES: readonly Course[] = [
  { id: "physics", name: "Physics" },
  { id: "biology", name: "Biology" },
  { id: "chemistry", name: "Chemistry" },
  { id: "maths", name: "Maths" },
  { id: "cs", name: "Computer Science" },
  { id: "geography", name: "Geography" },
  { id: "englit", name: "English Literature" },
  { id: "business", name: "Business" },
  { id: "englang", name: "English Language" },
  { id: "combsci", name: "Combined Science" },
  { id: "history", name: "History" },
  { id: "rs", name: "Religious Studies" },
  { id: "french", name: "French" },
  { id: "spanish", name: "Spanish" },
  { id: "pe", name: "PE" },
];

export const LEGACY_COURSE: Readonly<Record<LegacySubjectId, CourseId>> = {
  phy: "physics",
  bio: "biology",
  chem: "chemistry",
  maths: "maths",
  cs: "cs",
  geo: "geography",
  eng: "englit",
  bus: "business",
};

export type Spec = Subject & { readonly course: CourseId };

export const SPEC_ID_RE = /^[a-z][a-z0-9_]{1,40}$/;

/** Turns a stored spec into the shape the app uses, numbering topics across papers like the legacy tracker. */
export function buildSpec(raw: RawSpec): Spec {
  let t = 0;
  return {
    id: raw.id,
    name: raw.name,
    board: raw.board,
    code: raw.code,
    course: raw.course,
    ...(raw.tier ? { tier: raw.tier } : {}),
    papers: raw.papers.map((paper) => ({
      name: paper.name,
      topics: paper.topics.map((topic) => {
        const id = `${raw.id}.${t++}`;
        return { id, name: topic.name, points: topic.points.map((text, i) => ({ id: `${id}.${i}`, text })) };
      }),
    })),
  };
}

const LEGACY_SPECS: readonly Spec[] = SPEC.map((s) => ({ ...s, course: LEGACY_COURSE[s.id as LegacySubjectId] }));

/** Test-only specs, built in only when NEXT_PUBLIC_SPEC_FIXTURES=1 (CI), never on Vercel. */
const fixtures: readonly RawSpec[] = process.env.NEXT_PUBLIC_SPEC_FIXTURES === "1" ? FIXTURE_SPECS : [];

export const CATALOGUE: readonly Spec[] = [...LEGACY_SPECS, ...[...EXTRA_SPECS, ...fixtures].map(buildSpec)];

const LEGACY_DEFAULT = new Map<CourseId, string>(LEGACY_SPECS.map((s) => [s.course, s.id]));

export function specsForCourse(course: CourseId, catalogue: readonly Spec[] = CATALOGUE): Spec[] {
  return catalogue.filter((s) => s.course === course);
}

/** "AQA 8463", "Edexcel 1MA1 Higher" (legacy codes already include the tier). */
export function specLabel(s: Pick<Subject, "board" | "code" | "tier">): string {
  return [s.board, s.code, s.tier && !s.code.includes(s.tier) ? s.tier : ""].filter(Boolean).join(" ");
}

// ---- The student's choices: doc `settings/boards` ----

export const BOARDS_PATH = "settings/boards";

/** Not taking this course. */
export const NOT_TAKING = "";

/** `settings/boards`: chosen spec id per course ("" = not taking). Missing courses use the default. */
export interface BoardsDoc {
  boards: Partial<Record<CourseId, string>>;
  v: 1;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function asBoards(data: unknown): BoardsDoc {
  const b = isRecord(data) && isRecord(data.boards) ? data.boards : {};
  const boards: BoardsDoc["boards"] = {};
  for (const c of COURSES) if (typeof b[c.id] === "string") boards[c.id] = b[c.id] as string;
  return { boards, v: 1 };
}

/** The spec id shown for a course: the student's choice if it still exists, else the legacy default (or none). */
export function chosenSpecId(data: unknown, course: CourseId, catalogue: readonly Spec[] = CATALOGUE): string {
  const pick = asBoards(data).boards[course];
  if (pick === NOT_TAKING) return NOT_TAKING;
  if (pick && catalogue.some((s) => s.id === pick && s.course === course)) return pick;
  return LEGACY_DEFAULT.get(course) ?? NOT_TAKING;
}

/** The specs a student studies, in tab order. With no `settings/boards` doc: the eight legacy specs. */
export function chosenSpecs(data: unknown, catalogue: readonly Spec[] = CATALOGUE): Spec[] {
  const byId = new Map(catalogue.map((s) => [s.id, s]));
  return COURSES.flatMap((c) => {
    const s = byId.get(chosenSpecId(data, c.id, catalogue));
    return s ? [s] : [];
  });
}

/** A copy of the doc with one course's choice changed (unknown fields kept). */
export function withBoard(data: unknown, course: CourseId, specId: string): BoardsDoc & Record<string, unknown> {
  const base = isRecord(data) ? data : {};
  const prev = isRecord(base.boards) ? base.boards : {};
  return { ...base, boards: { ...prev, [course]: specId }, v: 1 };
}
