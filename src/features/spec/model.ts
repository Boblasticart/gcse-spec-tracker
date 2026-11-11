import { countStatuses, statusOf } from "@/client/tracker/progress";
import type { SpecFilter } from "@/client/tracker/ui-state";
import type { SpecPoint, Subject, Topic } from "@/content";
import { pct } from "@/lib/dates";

export interface SpecTopicRow {
  topic: Topic;
  /** [not done, needs work, done] over all the topic's points. */
  counts: [number, number, number];
  /** The points that pass the filter. */
  points: SpecPoint[];
  open: boolean;
}

export interface SpecPaperRow {
  name: string;
  pctDone: number;
  topics: SpecTopicRow[];
}

/**
 * Legacy `renderSpec` without the HTML: which papers, topics and points are
 * shown for a filter, and which topics are open (every topic is open while a
 * filter other than All is on).
 */
export function specRows(subject: Subject, progress: unknown, filter: SpecFilter, open: ReadonlySet<string>): { papers: SpecPaperRow[]; shown: number } {
  let shown = 0;
  const papers: SpecPaperRow[] = [];
  for (const paper of subject.papers) {
    const pc = countStatuses(
      progress,
      paper.topics.flatMap((t) => t.points.map((p) => p.id)),
    );
    const topics: SpecTopicRow[] = [];
    for (const topic of paper.topics) {
      const points = topic.points.filter((x) => filter === "all" || String(statusOf(progress, x.id)) === filter);
      if (!points.length) continue;
      shown += points.length;
      topics.push({
        topic,
        counts: countStatuses(
          progress,
          topic.points.map((p) => p.id),
        ),
        points,
        open: filter !== "all" || open.has(topic.id),
      });
    }
    if (topics.length) papers.push({ name: paper.name, pctDone: pct(pc[2], pc[0] + pc[1] + pc[2]), topics });
  }
  return { papers, shown };
}
