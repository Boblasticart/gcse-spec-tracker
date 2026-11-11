import type { Metadata } from "next";
import { BackupPanel } from "@/features/backup/backup-panel";
import { ProgressDashboard } from "@/features/dashboard/progress-dashboard";
import { requirePageUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requirePageUser("/dashboard");
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-heading text-3xl font-bold">Your dashboard</h1>
      <p className="mt-1 text-muted">
        Signed in as <span data-testid="dashboard-email">{user.email}</span>.
      </p>
      <ProgressDashboard />
      <div className="mt-10">
        <BackupPanel />
      </div>
    </main>
  );
}
