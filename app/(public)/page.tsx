import Link from "next/link";

import { allPoints, SPEC } from "@/content";
import { ButtonLink } from "@/ui/button";
import { Gate } from "@/ui/gate";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-heading text-4xl font-bold tracking-tight">GCSE Spec Tracker</h1>
      <p className="mt-2 max-w-2xl text-stone-600 dark:text-stone-400">
        Every spec point for your GCSEs in one place, with revision notes, practice papers and exam-style questions.
      </p>
      <div className="mt-6">
        <Gate reason="to start tracking">
          <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
        </Gate>
      </div>
      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Subjects">
        {SPEC.map((s) => (
          <li key={s.id}>
            <Link
              href={`/spec/${s.id}`}
              className="block rounded-xl border border-stone-200 p-4 transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-stone-800"
            >
              <h2 className="font-heading text-lg font-semibold">{s.name}</h2>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {s.board} {s.code} · {allPoints(s).length} spec points
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
