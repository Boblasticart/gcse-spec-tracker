import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getSubject } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Improvement" };

/** Placeholder until the full view is rebuilt (see PLAN.md). */
export default async function Page({ params }: PageProps<"/improve/[subject]">) {
  const { subject: sid } = await params;
  await requirePageUser(`/improve/${sid}`);
  const subject = getSubject(sid);
  if (!subject) notFound();
  return (
    <TrackerShell subject={subject} view="improve">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Improvement: {subject.name}</h1>
      <p className="mt-2 text-muted">This view is being rebuilt and will be back soon.</p>
    </TrackerShell>
  );
}
