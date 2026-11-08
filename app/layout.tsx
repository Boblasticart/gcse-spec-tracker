import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import type { ReactNode } from "react";

import { SessionProvider } from "@/client/session";
import { getCurrentUser } from "@/server/auth/current";
import type { PublicUser } from "@/server/auth/session";
import { SiteHeader } from "@/ui/site-header";

import "./globals.css";

const heading = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GCSE Spec Tracker", template: "%s · GCSE Spec Tracker" },
  description: "Track every GCSE spec point, practise exam questions and see your progress.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

async function initialUser(): Promise<PublicUser | null> {
  try {
    return await getCurrentUser();
  } catch (err) {
    // Public pages still work if the database is briefly unreachable.
    console.error("Could not read the session", err);
    return null;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await initialUser();
  return (
    <html lang="en-GB" className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <SessionProvider initialUser={user}>
          <SiteHeader />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
