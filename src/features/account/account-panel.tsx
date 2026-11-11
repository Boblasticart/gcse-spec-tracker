"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { api } from "@/client/api";
import { useSession } from "@/client/session";
import { Button, buttonClass } from "@/ui/button";
import { cardClass } from "@/ui/card";
import { useToast } from "@/ui/toast";

/** Download everything, or delete the account for good (password checked again). */
export function AccountPanel() {
  const { setUser } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pwId = useId();

  const remove = async (): Promise<void> => {
    setBusy(true);
    setErr("");
    const res = await api("/api/account/delete", { body: { password } });
    setBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    // Signing out also clears this device's offline copy.
    setUser(null);
    toast("Your account and everything in it has been deleted.", "success");
    router.replace("/");
    router.refresh();
  };

  return (
    <section aria-labelledby="account-title" className={cardClass(false, "p-5")}>
      <h2 id="account-title" className="font-heading text-lg font-semibold">
        Your account
      </h2>
      <p className="mt-1 text-sm text-muted">Download a copy of everything saved to your account, or delete it for good.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/api/account/export" download className={buttonClass("secondary")}>
          Download all my data
        </a>
        {!open ? (
          <Button variant="ghost" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="mt-4 rounded-xl border border-danger bg-danger-soft p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <p className="text-sm font-semibold">This deletes your account, your progress, answers, quizzes and notes. It can&apos;t be undone.</p>
          <label htmlFor={pwId} className="mt-3 block text-sm font-medium">
            Type your password to confirm
          </label>
          <input
            id={pwId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full max-w-sm rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" busy={busy} disabled={!password} className="bg-danger text-bg hover:bg-danger">
              Delete everything
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            {err ? (
              <span role="alert" className="text-sm text-danger">
                {err}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}
