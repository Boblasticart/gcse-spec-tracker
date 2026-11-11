import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSubject, SPEC } from "@/content";
import { PapersView } from "@/features/papers/papers-view";
import { TrackerShell } from "@/features/shell/tracker-shell";

export function generateStaticParams(): { subject: string }[] {
  return SPEC.map((s) => ({ subject: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/papers/[subject]">): Promise<Metadata> {
  const s = getSubject((await params).subject);
  return { title: s ? `${s.name} practice papers` : "Practice papers" };
}

/** Practice papers (legacy view `papers`). Public; ticking one off needs an account. */
export default async function PapersPage({ params }: PageProps<"/papers/[subject]">) {
  const subject = getSubject((await params).subject);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="papers">
      <PapersView sid={subject.id} />
    </TrackerShell>
  );
}
