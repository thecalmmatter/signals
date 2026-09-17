import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Signals — Build the portfolio, not just the trade",
  description:
    "A nightly scan surfaces high-conviction swing setups across large, mid and small caps, NSE and BSE. Entry, target, stop — logged in the open, so the portfolio and the edge compound together.",
};

// Speculation Rules API — lets Chromium browsers speculatively prefetch/
// prerender a same-origin page ahead of an actual click, so a "hard"
// navigation (one the browser handles directly, not Next's client router)
// feels instant. See README "Performance" section for the full reasoning,
// scoping, and honest caveats — the short version:
//   - This only helps navigations that are NOT intercepted by Next.js's
//     own client-side router (soft nav): the first click before the page's
//     JS has hydrated, plain non-<Link> anchors, and true hard navigations.
//     For most in-app <Link> clicks after hydration, Next's own automatic
//     viewport prefetching already covers this — the two are complementary,
//     not a multiplier.
//   - Chromium-only (Chrome/Edge/Opera); other browsers silently ignore an
//     unrecognized <script type>, so this is a safe no-op there.
//   - Marketing/public pages get full "prerender" at "moderate" eagerness
//     (hover ~200ms) — cheap to render, non-personalized, high payoff for
//     the sign-up funnel.
//   - Everything under /dashboard (personalized, DB + live-quote backed)
//     is deliberately excluded from prerender and only gets lighter
//     "prefetch" at "conservative" eagerness (click-triggered only), so
//     casual hovering over dashboard nav links doesn't speculatively fire
//     extra DB/Fyers calls for pages that might never actually be opened.
//   - /api/* and /dashboard/admin/* are excluded from both — never treat
//     an API route as a speculative navigation target, and admin actions
//     get no speculative treatment at all (low traffic, correctness over
//     perceived speed there).
const SPECULATION_RULES = {
  prerender: [
    {
      where: {
        and: [{ href_matches: "/*" }, { not: { href_matches: ["/api/*", "/dashboard/*"] } }],
      },
      eagerness: "moderate",
    },
  ],
  prefetch: [
    {
      where: {
        and: [
          { href_matches: "/dashboard/*" },
          { not: { href_matches: ["/api/*", "/dashboard/admin/*"] } },
        ],
      },
      eagerness: "conservative",
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <head>
        <script
          type="speculationrules"
          // JSON payload, not executable JS — dangerouslySetInnerHTML avoids
          // React escaping the quotes in a way that breaks the JSON.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SPECULATION_RULES) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
