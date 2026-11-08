"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";

import { api } from "@/client/api";
import { useSession, type SessionUser } from "@/client/session";
import { Button } from "@/ui/button";
import { FormAlert } from "@/ui/field";
import { OTP_LENGTH, OtpInput } from "@/ui/otp-input";

import { OTP_DEAD_CODES, recallEmail } from "./messages";

const RESEND_SECONDS = 60;
const noSubscribe = (): (() => void) => () => {};

export interface VerifyFormProps {
  next: string;
  /** Set when the server already knows the paused sign-in has timed out. */
  initialError?: { code: string; message: string } | null;
}

/** The "enter the 6-digit code" screen, with a resend countdown. */
export function VerifyForm({ next, initialError = null }: VerifyFormProps) {
  const router = useRouter();
  const { setUser } = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  // sessionStorage only exists in the browser; the server renders "you".
  const email = useSyncExternalStore(noSubscribe, recallEmail, () => null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sessionGone = error?.code === "SESSION_EXPIRED" || error?.code === "SIGN_IN_REQUIRED";
  const codeDead = !!error && OTP_DEAD_CODES.has(error.code);

  const submit = async (value: string): Promise<void> => {
    if (value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setNotice(null);
    const res = await api<{ user: SessionUser }>("/api/auth/verify-otp", { body: { code: value } });
    if (res.ok) {
      setUser(res.user);
      router.replace(next as Route);
      router.refresh();
      return;
    }
    setError({ code: res.code, message: res.message });
    setCode("");
    // A dead code can be replaced straight away (the server still enforces its own cooldown).
    if (OTP_DEAD_CODES.has(res.code)) setWait(0);
    setBusy(false);
  };

  const resend = async (): Promise<void> => {
    setResending(true);
    setNotice(null);
    const res = await api<{ retryAfter: number }>("/api/auth/resend-otp", { method: "POST" });
    setResending(false);
    if (res.ok) {
      setError(null);
      setCode("");
      setNotice("We've sent you a new code.");
      setWait(res.retryAfter);
      return;
    }
    setError({ code: res.code, message: res.message });
    if (res.retryAfter) setWait(res.retryAfter);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void submit(code);
  };

  if (sessionGone) {
    return (
      <div className="space-y-5">
        <FormAlert>{error?.message}</FormAlert>
        <Link
          href={`/auth/sign-in?next=${encodeURIComponent(next)}` as Route}
          className="block text-center font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Sign in again
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <p className="text-stone-600 dark:text-stone-400" id="otp-help">
        We&apos;ve emailed a 6-digit code to {email ? <strong className="text-stone-900 dark:text-stone-100">{email}</strong> : "you"}.
        It works for 10 minutes. Check your spam folder if you can&apos;t see it.
      </p>
      {error && <FormAlert>{error.message}</FormAlert>}
      {notice && !error && <FormAlert tone="info">{notice}</FormAlert>}
      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error && !codeDead) setError(null);
        }}
        onComplete={(v) => void submit(v)}
        disabled={busy || codeDead}
        invalid={error?.code === "INVALID_CODE"}
        autoFocus
        describedBy="otp-help"
      />
      <Button type="submit" busy={busy} disabled={code.length !== OTP_LENGTH || codeDead} className="w-full">
        Continue
      </Button>
      <div className="flex items-center justify-between text-sm">
        <Button
          variant={codeDead ? "primary" : "ghost"}
          onClick={resend}
          busy={resending}
          disabled={wait > 0}
          className={codeDead ? "" : "px-2"}
        >
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </Button>
        <Link href="/auth/sign-in" className="text-stone-600 hover:underline dark:text-stone-400">
          Use a different email
        </Link>
      </div>
    </form>
  );
}
