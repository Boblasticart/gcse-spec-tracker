import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import type { ReactNode } from "react";

import { Providers } from "@/client/providers";
import { THEME_SCRIPT } from "@/client/theme/script";
import { getCurrentUserSafe } from "@/server/auth/current";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await getCurrentUserSafe();
  return (
    // The theme script adds `dark` and `data-theme` before React hydrates.
    <html lang="en-GB" className={`${heading.variable} ${body.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lift"
        >
          Skip to content
        </a>
        <Providers initialUser={user}>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
