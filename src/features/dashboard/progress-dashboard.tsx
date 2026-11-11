"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { useDoc, useDocs } from "@/client/sync/react";
import { useCollection } from "@/client/tracker/questions";
import { SPEC } from "@/content";
import { londonToday, pct } from "@/lib/dates";
import { formatMinutes, STATS_TIME_PATH, studyMetrics, subjectMetrics } from "@/lib/tracker/metrics";
import { cardClass } from "@/ui/card";
import { Counter, Ring, StackedBar } from "@/ui/charts";

const percent = (n: number): string => `${Math.round(n)}%`;
const minutes = (s: number): string => formatMinutes(s);

function Tile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="font-heading text-3xl font-bold">{children}</div>
      <div className="text-sm text-muted">{label}</div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

/** The live progress dashboard: it updates (and animates) as soon as anything is saved. */
export function ProgressDashboard() {
  const docs = useDocs((s) => s.docs);
  const phase = useDocs((s) => s.phase);
  const answers = useCollection<Record<string, unknown>>("a");
  const quizResults = useCollection<Record<string, unknown>>("qr");
  const time = useDoc(STATS_TIME_PATH);
  const today = londonToday();

  const subjects = useMemo(() => SPEC.map((s) => subjectMetrics(s, docs[`progress/${s.id}`]?.data)), [docs]);
  const study = useMemo(() => studyMetrics(Object.values(answers), Object.values(quizResults), time, today), [answers, quizResults, time, today]);
  const totals = subjects.reduce<[number, number, number]>((t, s) => [t[0] + s.counts[0], t[1] + s.counts[1], t[2] + s.counts[2]], [0, 0, 0]);
  const allPts = totals[0] + totals[1] + totals[2];

  if (phase === "loading" || phase === "idle") return <p className="mt-8 text-muted">Loading your progress...</p>;

  return (
    <section aria-label="Your progress" className="mt-8">
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <Ring value={pct(totals[2], allPts)} size={112} stroke={12} label={`${pct(totals[2], allPts)}% of all spec points done`} tone="accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl font-semibold">All subjects</h2>
          <p className="text-sm text-muted" data-testid="overall-counts">
            {totals[2]} done · {totals[1]} need work · {totals[0]} not done
          </p>
          <div className="mt-3">
            <StackedBar counts={totals} label={`${totals[2]} done, ${totals[1]} need work, ${totals[0]} not done`} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="questions answered">
          <Counter value={study.answered} testId="stat-answered" />
        </Tile>
        <Tile label="of marks gained" hint={study.marksAvailable ? `${study.marksAwarded}/${study.marksAvailable} marks` : "Answer a question to start"}>
          {study.marksPct === null ? <span data-testid="stat-marks">-</span> : <Counter value={study.marksPct} format={percent} testId="stat-marks" />}
        </Tile>
        <Tile label={study.streak === 1 ? "day streak" : "days streak"}>
          <Counter value={study.streak} testId="stat-streak" />
        </Tile>
        <Tile label="studied today" hint={`${formatMinutes(study.secondsWeek)} this week`}>
          <span data-testid="stat-time" data-seconds={study.secondsToday}>
            <Counter value={study.secondsToday} format={minutes} />
          </span>
        </Tile>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Your subjects">
        {subjects.map((s) => (
          <li key={s.sid} data-subject={s.sid}>
            <Link href={`/spec/${s.sid}` as Route} className={cardClass(true, "flex items-center gap-4 p-4")}>
              <Ring value={s.mastery} size={72} stroke={8} label={`${s.name}: ${s.mastery}% done`} />
              <span className="min-w-0 flex-1">
                <span className="block font-heading font-semibold">{s.name}</span>
                <span className="block text-sm text-muted" data-testid="subject-counts">
                  <Counter value={s.counts[2]} /> done · <Counter value={s.counts[1]} /> need work · {s.total} points
                </span>
                <span className="mt-2 block">
                  <StackedBar counts={s.counts} label={`${s.name}: ${s.counts[2]} done, ${s.counts[1]} need work, ${s.counts[0]} not done`} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
