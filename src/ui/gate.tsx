"use client";

import type { ReactNode } from "react";

import { useSignInPrompt } from "@/client/sign-in-prompt";
import { useSession } from "@/client/session";

/**
 * Wraps interactive parts of public pages. Signed-in students use them as
 * normal; for everyone else, any click inside opens the sign-in sheet instead.
 */
export function Gate({ children, reason }: { children: ReactNode; reason?: string }) {
  const { user } = useSession();
  const prompt = useSignInPrompt();
  if (user) return <>{children}</>;
  return (
    <div
      data-gated=""
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        prompt(reason);
      }}
    >
      {children}
    </div>
  );
}
