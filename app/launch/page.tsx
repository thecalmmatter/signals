import Link from "next/link";
import { Ticker } from "@/components/ticker";
import { LandingParticleCanvas } from "@/components/landing-particle-canvas";
import { WaitlistForm } from "@/components/waitlist-form";
import { STOCKS } from "@/lib/stocks";

export const metadata = {
  title: "Signals on Product Hunt — swing setups for NSE large-caps",
  description:
    "A nightly scan surfaces high-conviction swing setups on Indian large-caps. Every signal is one clean card — entry, target, stop. Free during the public dry run.",
};

// TODO once the Product Hunt listing is live: replace this with the real
// embed Product Hunt gives you (Dashboard → your launch → "Get embed
// badge"), something like:
// <a href="https://www.producthunt.com/posts/SLUG?utm_source=badge-featured&utm_medium=badge">
//   <img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=XXXXX&theme=dark" alt="Signals - ... | Product Hunt" style={{ width: 250, height: 54 }} />
// </a>
function ProductHuntBadgePlaceholder() {
  return (
    <a
      href="https://www.producthunt.com"
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-[54px] w-[250px] items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 text-xs text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
    >
      Product Hunt badge goes here
    </a>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 fill-current ${className ?? ""}`} aria-hidden="true">
      <path d="M8 1l5 5H9v9H7V6H3l5-5z" />
    </svg>
  );
}

const WHY = [
  {
    tag: "01",
    title: "Built for my own trading first",
    body: "I run a swing-trading setup on Indian large-caps myself. Signals started as the tool I wanted for it — one clean card instead of ten conflicting indicators to reconcile every evening.",
  },
  {
    tag: "02",
    title: "Nothing auto-publishes blind",
    body: "A nightly scan flags candidates. Only setups matching a known, pre-mapped scan go live automatically — anything unmapped queues for review instead of being guessed at.",
  },
  {
    tag: "03",
    title: "Early, and said plainly",
    body: "This is a solo-built, early-stage product. There's no backtested win rate to show yet — every call is logged the moment it's made, wins and losses both, and that history builds in the open from here.",
  },
];

const FAQ = [
  {
    q: "Is this investment advice?",
    a: "No. Signals publishes a technical setup format (entry, target, stop) — it isn't personalized financial advice, and I'm not a registered investment advisor. Trade your own risk.",
  },
  {
    q: "What's the track record?",
    a: "Early — genuinely early. Every signal posted publicly is logged the moment it's made and shown at /dashboard/track-record as it plays out, unfiltered. No cherry-picking, no deleting the ones that didn't work.",
  },
  {
    q: "What's free vs. paid?",
    a: "Everything is free during the public dry run — full signal feed, no card required. Paid tiers are planned but not turned on yet.",
  },
  {
    q: "Who's behind this?",
    a: "One person, so far — built and run solo. Feedback on this thread genuinely shapes what gets built next.",
  },
];

export default function LaunchPage() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M2 12l3.5-3.5 2.5 2.5L13 5l2 2v6H2z" />
              </svg>
            </span>
            <span className="flex items-baseline gap-2">
              Signals
              <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] font-normal uppercase tracking-widest text-zinc-400 ring-1 ring-inset ring-zinc-700/50">
                Free · Beta
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-50 sm:block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-full bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="neural-grid-bg pointer-events-none absolute inset-0" />
          <LandingParticleCanvas />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950" />

          <div className="relative mx-auto w-full max-w-6xl px-6 pt-16 pb-14 text-center md:pt-20 md:pb-20">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full glass-panel px-3.5 py-1.5 text-xs font-mono font-medium tracking-wide text-orange-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
              </span>
              LIVE ON PRODUCT HUNT TODAY
            </p>

            <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-normal leading-tight tracking-tight text-zinc-50 md:text-6xl md:leading-[1.05]">
              Know the signal.
              <br />
              <span className="font-serif italic editorial-gradient-text">Skip the noise.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-400 md:text-lg">
              A nightly scan surfaces high-conviction swing setups on Indian
              large-caps. Every setup lands as one clean card — entry, target,
              stop. Built solo, out of my own trading.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                Try it free
                <ArrowIcon />
              </Link>
              <a
                href="#why"
                className="inline-flex h-11 items-center rounded-full glass-panel px-6 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50"
              >
                Why I built this
              </a>
            </div>

            <div className="mt-10 flex justify-center">
              <ProductHuntBadgePlaceholder />
            </div>
          </div>
        </section>

        {/* LIVE TICKER PREVIEW */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 md:pb-24">
          <Ticker fallback={STOCKS} max={4} />
          <p className="mt-4 text-center text-sm text-zinc-500">
            Sample preview above — sign in for the live feed. Free, no card required.
          </p>
        </section>

        {/* WHY */}
        <section id="why" className="scroll-mt-24 border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <p className="font-mono text-xs uppercase tracking-widest text-orange-400">
              For the Product Hunt crowd
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
              Why this{" "}
              <span className="font-serif italic text-zinc-300">exists.</span>
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {WHY.map((item) => (
                <div key={item.title} className="glass-panel rounded-2xl p-6 transition-colors hover:border-white/20">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-800/80 font-mono text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700/60">
                    {item.tag}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-zinc-50">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-zinc-800/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">
              Before you ask in the comments
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
              Likely{" "}
              <span className="font-serif italic text-emerald-300">questions.</span>
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {FAQ.map((item) => (
                <div key={item.q} className="glass-panel-glow rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-zinc-50">{item.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSING CTA + fallback waitlist */}
        <section className="border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center md:py-24">
            <div className="glass-panel mx-auto max-w-2xl rounded-3xl px-8 py-12 sm:px-12 sm:py-16">
              <h2 className="mx-auto max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
                Thanks for stopping by from{" "}
                <span className="font-serif italic text-emerald-300">Product Hunt.</span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                Sign up free and see the live feed, or drop your email if you&rsquo;d
                rather just get notified as this grows.
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-zinc-100 px-8 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
              >
                Sign up free
                <ArrowIcon />
              </Link>
              <p className="mt-4 font-mono text-xs text-zinc-500">
                No credit card required · Free during the public dry run
              </p>

              <div className="mx-auto mt-10 max-w-md border-t border-white/[0.08] pt-8">
                <p className="mb-3 text-xs text-zinc-500">Not ready yet? Just get notified.</p>
                <WaitlistForm source="producthunt" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-zinc-500 sm:flex-row">
          <p>Signals — a solo-built, early-stage product. Not financial advice.</p>
          <div className="flex items-center gap-5">
            <a href="#why" className="transition-colors hover:text-zinc-300">
              Why
            </a>
            <Link href="/" className="transition-colors hover:text-zinc-300">
              Main site
            </Link>
            <Link href="/signup" className="transition-colors hover:text-zinc-300">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
