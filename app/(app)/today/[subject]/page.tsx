import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSubject } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { TodayView } from "@/features/today/today-view";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Today's 7" };

/** Today's 7 (legacy view `today`): exam-style questions marked by AI, 7 more, and the weakness review. */
export default async function Page({ params }: PageProps<"/today/[subject]">) {
  const { subject: sid } = await params;
  await requirePageUser(`/today/${sid}`);
  const subject = getSubject(sid);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="today">
      <TodayView sid={subject.id} />
    </TrackerShell>
  );
}
