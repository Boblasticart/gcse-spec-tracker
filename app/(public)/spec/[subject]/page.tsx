import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { allPoints, getSubject, SPEC } from "@/content";
import { PointStatusControl } from "@/features/spec/point-status";
import { Button } from "@/ui/button";
import { Gate } from "@/ui/gate";

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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
        {subject.board} {subject.code}
      </p>
      <h1 className="font-heading text-3xl font-bold">{subject.name}</h1>
      <p className="mt-1 text-stone-600 dark:text-stone-400">{allPoints(subject).length} spec points</p>
      <div className="mt-4">
        <Gate reason="to track this subject">
          <Button>Track my progress</Button>
        </Gate>
      </div>
      {subject.papers.map((paper) => (
        <section key={paper.name} className="mt-8" aria-label={paper.name}>
          <h2 className="font-heading text-xl font-semibold">{paper.name}</h2>
          <div className="mt-3 space-y-2">
            {paper.topics.map((topic) => (
              <details key={topic.id} className="group rounded-xl border border-stone-200 dark:border-stone-800">
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 font-medium">
                  <span>{topic.name}</span>
                  <span className="text-sm text-stone-500">{topic.points.length} points</span>
                </summary>
                <ul className="space-y-1 border-t border-stone-200 px-4 py-3 text-sm dark:border-stone-800">
                  {topic.points.map((p) => (
                    <li key={p.id} data-point={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
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
    </main>
  );
}
