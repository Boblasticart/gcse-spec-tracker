import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { allPoints, getSubject, SPEC } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { PointStatusControl } from "@/features/spec/point-status";
import { cardClass } from "@/ui/card";

export function generateStaticParams(): { subject: string }[] {
  return SPEC.map((s) => ({ subject: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/spec/[subject]">): Promise<Metadata> {
  const s = getSubject((await params).subject);
  return { title: s ? `${s.name} spec` : "Spec" };
}

/** Public spec browser. Status controls ask signed-out visitors to sign in. (Full spec view in M6.) */
export default async function SpecPage({ params }: PageProps<"/spec/[subject]">) {
  const subject = getSubject((await params).subject);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="spec">
      <p className="text-sm font-medium text-accent-text">
        {subject.board} {subject.code}
      </p>
      <h1 className="font-heading text-3xl font-bold tracking-tight">{subject.name}</h1>
      <p className="mt-1 text-muted">{allPoints(subject).length} spec points</p>
      {subject.papers.map((paper) => (
        <section key={paper.name} className="mt-8" aria-label={paper.name}>
          <h2 className="font-heading text-xl font-semibold">{paper.name}</h2>
          <div className="mt-3 space-y-2">
            {paper.topics.map((topic) => (
              <details key={topic.id} className={cardClass(false, "group")}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 font-medium hover:bg-subtle">
                  <span>{topic.name}</span>
                  <span className="text-sm text-muted">{topic.points.length} points</span>
                </summary>
                <ul className="divide-y divide-line border-t border-line px-4 text-sm">
                  {topic.points.map((p) => (
                    <li key={p.id} data-point={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                      <span>{p.text}</span>
                      <PointStatusControl sid={subject.id} pid={p.id} label={p.text} />
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      ))}
    </TrackerShell>
  );
}
