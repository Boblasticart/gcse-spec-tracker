import type { Metadata } from "next";
import Link from "next/link";

import { allPoints, SPEC } from "@/content";
import { BackupPanel } from "@/features/backup/backup-panel";
import { cardClass } from "@/ui/card";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser("/dashboard");
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Your dashboard</h1>
      <p className="mt-1 text-muted">
        Signed in as <span data-testid="dashboard-email">{user.email}</span>. Your progress charts arrive here soon.
      </p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your subjects">
        {SPEC.map((s) => (
          <li key={s.id}>
            <Link href={`/spec/${s.id}`} className={cardClass(true, "block p-4")}>
              <h2 className="font-heading font-semibold">{s.name}</h2>
              <p className="text-sm text-muted">{allPoints(s).length} spec points</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-10">
        <BackupPanel />
      </div>
    </main>
  );
}
