import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CATALOGUE, getSubject } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { SpecView } from "@/features/spec/spec-view";
import { SubjectSummary } from "@/features/tracker/subject-summary";

export function generateStaticParams(): { subject: string }[] {
  return CATALOGUE.map((s) => ({ subject: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/spec/[subject]">): Promise<Metadata> {
  const s = getSubject((await params).subject);
  return { title: s ? `${s.name} spec` : "Spec" };
}

/** The spec view (legacy view `spec`). Public; status controls ask signed-out visitors to sign in. */
export default async function SpecPage({ params }: PageProps<"/spec/[subject]">) {
  const subject = getSubject((await params).subject);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="spec">
      <SubjectSummary sid={subject.id} />
      <SpecView sid={subject.id} />
    </TrackerShell>
  );
}
