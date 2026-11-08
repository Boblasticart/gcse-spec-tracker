"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { ToastProvider } from "@/ui/toast";

import { SessionProvider, type SessionUser } from "./session";
import { SignInPromptProvider } from "./sign-in-prompt";
import { DocsProvider } from "./sync/react";

/** Every client-side provider, in one place. Motion follows the OS "reduce motion" setting. */
export function Providers({ initialUser, children }: { initialUser: SessionUser | null; children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <SessionProvider initialUser={initialUser}>
        <DocsProvider>
          <ToastProvider>
            <SignInPromptProvider>{children}</SignInPromptProvider>
          </ToastProvider>
        </DocsProvider>
      </SessionProvider>
    </MotionConfig>
  );
}
