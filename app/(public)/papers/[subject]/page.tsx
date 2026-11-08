import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSubject, papersFor, SPEC } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { cardClass } from "@/ui/card";

export function generateStaticParams(): { subject: string }[] {
  return SPEC.map((s) => ({ subject: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/papers/[subject]">): Promise<Metadata> {
  const s = getSubject((await params).subject);
  return { title: s ? `${s.name} practice papers` : "Practice papers" };
}

/** Practice paper PDFs for a subject. (Mark as done arrives in M6.) */
export default async function PapersPage({ params }: PageProps<"/papers/[subject]">) {
  const subject = getSubject((await params).subject);
  if (!subject) notFound();
  const papers = papersFor(subject.id);
  return (
    <TrackerShell subject={subject} view="papers">
      <h1 className="font-heading text-3xl font-bold tracking-tight">{subject.name} practice papers</h1>
      {papers.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {papers.map((p) => (
            <li key={p.key}>
              <a href={`/${p.url}`} target="_blank" rel="noopener" className={cardClass(true, "block p-4")}>
                <span className="text-xs font-medium text-muted">{p.group}</span>
                <span className="block font-semibold">{p.title}</span>
                <span className="text-sm text-muted">
                  {p.pages} pages · {p.marks} marks
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-muted">No practice papers for this subject yet.</p>
      )}
    </TrackerShell>
  );
}
