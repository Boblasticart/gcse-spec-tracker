import { allPoints, SPEC } from "@/content";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-4xl font-bold tracking-tight">GCSE Spec Tracker</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-400">
        Every spec point for your GCSEs, in one place. The new version is being built.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Subjects">
        {SPEC.map((s) => (
          <li key={s.id} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <h2 className="font-heading text-lg font-semibold">{s.name}</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {s.board} {s.code} · {allPoints(s).length} spec points
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
