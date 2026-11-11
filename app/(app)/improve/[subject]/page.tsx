import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSubject } from "@/content";
import { ImproveView } from "@/features/improve/improve-view";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { SubjectSummary } from "@/features/tracker/subject-summary";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Improvement" };

/** The Improvement view (legacy view `improve`). Signed-in only. */
export default async function Page({ params }: PageProps<"/improve/[subject]">) {
  const { subject: sid } = await params;
  await requirePageUser(`/improve/${sid}`);
  const subject = getSubject(sid);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="improve">
      <SubjectSummary sid={subject.id} />
      <ImproveView sid={subject.id} />
    </TrackerShell>
  );
}
