import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTopic } from "@/content";
import { QuizView } from "@/features/quiz/quiz-view";
import { TrackerShell } from "@/features/shell/tracker-shell";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Topic quiz" };

/** Topic quiz (legacy view `quiz`). Signed-in only. */
export default async function QuizPage({ params }: PageProps<"/quiz/[topic]">) {
  const { topic: tid } = await params;
  await requirePageUser(`/quiz/${tid}`);
  const ref = getTopic(tid);
  if (!ref) notFound();
  return (
    <TrackerShell subject={ref.subject} view="spec" reader>
      <QuizView tid={tid} />
    </TrackerShell>
  );
}
