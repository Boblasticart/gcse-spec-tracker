import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTopic } from "@/content";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { requirePageUser } from "@/server/auth/current";
import { buttonClass } from "@/ui/button";
import Link from "next/link";
import type { Route } from "next";

export const metadata: Metadata = { title: "Topic quiz" };

/** Placeholder until topic quizzes are rebuilt (PLAN.md milestone M7). */
export default async function QuizPage({ params }: PageProps<"/quiz/[topic]">) {
  const { topic: tid } = await params;
  await requirePageUser(`/quiz/${tid}`);
  const ref = getTopic(tid);
  if (!ref) notFound();
  return (
    <TrackerShell subject={ref.subject} view="spec" reader>
      <h1 className="font-heading text-3xl font-bold tracking-tight">Quiz: {ref.topic.name}</h1>
      <p className="mt-2 text-muted">Topic quizzes are being rebuilt and will be back soon.</p>
      <Link href={`/spec/${ref.subject.id}` as Route} className={buttonClass("secondary", "mt-4")}>
        ← Back to spec
      </Link>
    </TrackerShell>
  );
}
