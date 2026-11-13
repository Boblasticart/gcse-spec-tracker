/** Shapes of the content extracted from the legacy tracker (`index.html`). */

/** The eight specs the legacy tracker shipped with; each stays the default for its course. */
export type LegacySubjectId = "phy" | "bio" | "chem" | "maths" | "cs" | "geo" | "eng" | "bus";

/**
 * A spec id. Legacy specs keep their short ids ("phy"); catalogue specs use
 * lower-case ids without dots, e.g. "phy_ocra". Progress is saved per spec id.
 */
export type SubjectId = string;

/** A school subject a student can take; each has one or more specs (board, code, tier). */
export type CourseId =
  | "physics"
  | "biology"
  | "chemistry"
  | "maths"
  | "cs"
  | "geography"
  | "englit"
  | "business"
  | "englang"
  | "combsci"
  | "history"
  | "rs"
  | "french"
  | "spanish"
  | "pe";

/**
 * A spec as stored in `content/specs/{id}.json`. Point ids are given by
 * position: `${id}.${topicIndex}.${pointIndex}`, topics numbered across papers.
 */
export interface RawSpec {
  readonly id: string;
  readonly course: CourseId;
  readonly name: string;
  readonly board: string;
  readonly code: string;
  readonly tier?: "Foundation" | "Higher";
  /** Official specification document the points were read from. */
  readonly source?: string;
  readonly papers: readonly { readonly name: string; readonly topics: readonly { readonly name: string; readonly points: readonly string[] }[] }[];
}

/** One spec point. `id` is `${topicId}.${index}`, exactly as the legacy tracker numbers it. */
export interface SpecPoint {
  readonly id: string;
  readonly text: string;
}

/** A topic. `id` is `${subjectId}.${n}`, numbered across all of a subject's papers. */
export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly points: readonly SpecPoint[];
}

export interface SpecPaper {
  readonly name: string;
  readonly topics: readonly Topic[];
}

export interface Subject {
  readonly id: SubjectId;
  readonly name: string;
  readonly board: string;
  readonly code: string;
  readonly papers: readonly SpecPaper[];
  /** The course this spec belongs to (catalogue specs; legacy specs get theirs from the catalogue). */
  readonly course?: CourseId;
  readonly tier?: "Foundation" | "Higher";
}

/** A practice paper PDF in `papers/`. */
export interface PracticePaper {
  /** Legacy key, also used as the "done" key in `gcse-papers-v1`. */
  readonly key: string;
  readonly title: string;
  readonly group: string;
  readonly pages: number;
  readonly marks: number;
  /** Path relative to the site root, e.g. `papers/Physics_4.1_Energy.pdf`. */
  readonly url: string;
}

export type PromptId =
  | "reviewWeaknesses"
  | "writeNote"
  | "writeQuiz"
  | "markQuiz"
  | "markAnswer"
  | "todaysSeven";

/**
 * A legacy AI prompt, kept verbatim as a template: the literal parts
 * (`quasis`) interleaved with the values of `exprs`.
 */
export interface LegacyPrompt {
  readonly id: PromptId;
  /** Function in index.html that builds and sends it. */
  readonly legacyFunction: string;
  readonly line: number;
  readonly functionLines: readonly [number, number];
  readonly quasis: readonly string[];
  /** Legacy JavaScript source of each interpolated value. */
  readonly exprs: readonly string[];
  /** The legacy call that sends it, e.g. `sm.json(prompt,{modelTier:'complex',cache:false})`. */
  readonly call: string;
}

export interface LegacyActionUse {
  readonly fn: string;
  readonly line: number;
}

/** A `data-act` click action in the legacy tracker. */
export interface LegacyAction {
  readonly name: string;
  readonly handlerLine: number;
  /** The legacy handler source, verbatim. */
  readonly handler: string;
  readonly uses: readonly LegacyActionUse[];
}

export interface LegacyView {
  readonly name: string;
  readonly renderFn: string;
  readonly lines: readonly number[];
}

export interface LegacyFunctionInfo {
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
}
