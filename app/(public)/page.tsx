import Link from "next/link";

import { allPoints, SPEC } from "@/content";
import { ButtonLink } from "@/ui/button";
import { cardClass } from "@/ui/card";
import { Gate } from "@/ui/gate";

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <p className="text-sm font-semibold text-accent-text">For AQA, Edexcel and OCR GCSEs</p>
      <h1 className="mt-2 max-w-2xl font-heading text-4xl font-bold tracking-tight sm:text-5xl">GCSE Spec Tracker</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Every spec point for your GCSEs in one place, with revision notes, practice papers and exam-style questions.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Gate reason="to start tracking">
          <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
        </Gate>
        <ButtonLink href="/spec/phy" variant="secondary">
          Browse the spec
        </ButtonLink>
      </div>
      <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Subjects">
        {SPEC.map((s) => (
          <li key={s.id}>
            <Link href={`/spec/${s.id}`} className={cardClass(true, "block p-4")}>
              <h2 className="font-heading text-lg font-semibold">{s.name}</h2>
              <p className="text-sm text-muted">
                {s.board} {s.code} · {allPoints(s).length} spec points
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
