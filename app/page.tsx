import Link from "next/link";
import { Ticker } from "@/components/ticker";
import { STOCKS } from "@/lib/stocks";

const PLANS = [
  {
    name: "Free",
    tagline: "Get a feel for the signal feed.",
    price: "₹0",
    period: "/forever",
    priceNote: null as string | null,
    features: [
      "Daily swing signals (view only)",
      "1 saved watchlist",
      "Community access",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    tagline: "For traders who act on the signal.",
    price: "₹•••",
    period: "/month",
    priceNote: "Pricing unlocks at launch",
    features: [
      "All daily signals + history",
      "Entry, target & stop alerts",
      "Email and push notifications",
      "Priority support",
    ],
    cta: "Get early access",
    featured: true,
  },
  {
    name: "Enterprise",
    tagline: "Teams and institutions.",
    price: "Custom",
    period: "",
    priceNote: null as string | null,
    features: [
      "Team seats & permissions",
      "API access",
      "SLA & onboarding",
    ],
    cta: "Talk to sales",
    featured: false,
  },
];

const STEPS = [
  {
    title: "We scan every night",
    body: "A nightly scan flags fresh swing setups across Indian large-caps. No noise, just setups that pass the rules.",
  },
  {
    title: "You get a clean card",
    body: "Symbol, price, entry, target, stop and days to exit. Everything you need on a single card.",
  },
  {
    title: "Set and forget",
    body: "Tap a card, decide, and exit when the day countdown hits zero. No charts to babysit.",
  },
];

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`h-4 w-4 fill-current ${className ?? ""}`}
      aria-hidden="true"
    >
      <path d="M8 1l5 5H9v9H7V6H3l5-5z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M2 12l3.5-3.5 2.5 2.5L13 5l2 2v6H2z" />
              </svg>
            </span>
            Signals
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
            <a href="#ticker" className="transition-colors hover:text-zinc-100">
              Live feed
            </a>
            <a href="#how" className="transition-colors hover:text-zinc-100">
              How it works
            </a>
            <a href="#pricing" className="transition-colors hover:text-zinc-100">
              Pricing
            </a>
          </nav>
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
        <section className="mx-auto w-full max-w-6xl px-6 pt-20 pb-14 text-center md:pt-28 md:pb-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Swing signals, published nightly
          </p>
          <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-zinc-50 md:text-6xl md:leading-[1.05]">
            Know when to enter.
            <br />
            Know when to exit.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-400 md:text-lg">
            Signals surfaces high-conviction swing setups on Indian large-caps —
            entry, target, stop and a countdown to exit. No indicators to
            interpret. Just signals.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Start free
              <ArrowIcon />
            </Link>
            <a
              href="#ticker"
              className="inline-flex h-11 items-center rounded-full border border-zinc-700/70 px-6 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50"
            >
              See live signals
            </a>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-20 md:pb-24">
          <Ticker fallback={STOCKS} max={4} />
          <div className="mt-6 flex flex-col items-center justify-center gap-3 text-center sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-500 px-6 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
            >
              Sign in to see the live feed
              <ArrowIcon />
            </Link>
            <p className="text-sm text-zinc-500">
              Free plan · no card required
            </p>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              How it works
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-zinc-800/70 bg-zinc-950/60 p-6"
                >
                  <p className="text-xs font-medium tracking-[0.2em] text-zinc-500">
                    STEP {String(i + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-zinc-50">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 border-t border-zinc-800/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
                Simple pricing
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                Start free. Upgrade when you want alerts and the full history.
                No lock-in.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-3 md:items-start">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    plan.featured
                      ? "relative rounded-2xl border border-emerald-500/40 bg-zinc-950 p-6 shadow-[0_0_40px_-12px_rgba(16,185,129,0.25)]"
                      : "rounded-2xl border border-zinc-800/70 bg-zinc-950/60 p-6"
                  }
                >
                  {plan.featured && (
                    <p className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-950">
                      Most popular
                    </p>
                  )}
                  <h3 className="text-sm font-semibold text-zinc-50">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">{plan.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span
                      className={
                        plan.priceNote
                          ? "text-3xl font-semibold tracking-tight text-zinc-50 blur-[3px] select-none"
                          : "text-3xl font-semibold tracking-tight text-zinc-50"
                      }
                      aria-hidden={plan.priceNote ? true : undefined}
                    >
                      {plan.price}
                    </span>
                    <span className="text-xs text-zinc-500">{plan.period}</span>
                  </p>
                  {plan.priceNote && (
                    <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-400/80">
                      {plan.priceNote}
                    </p>
                  )}
                  <ul className="mt-6 space-y-2.5 text-sm text-zinc-400">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <svg
                          viewBox="0 0 16 16"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-emerald-400"
                          aria-hidden="true"
                        >
                          <path d="M6.5 11.2L2.8 7.5 1.4 8.9l5.1 5.1 8.1-8.1-1.4-1.4L6.5 11.2z" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={
                      plan.featured
                        ? "mt-8 inline-flex h-10 w-full items-center justify-center rounded-full bg-emerald-500 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
                        : "mt-8 inline-flex h-10 w-full items-center justify-center rounded-full border border-zinc-700/70 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50"
                    }
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center md:py-24">
            <h2 className="mx-auto max-w-xl text-2xl font-semibold tracking-tight text-zinc-50 md:text-3xl">
              Your next swing is already forming.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
              See tonight&rsquo;s signals for free. Cancel anytime.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-zinc-100 px-8 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white"
            >
              Sign up free
              <ArrowIcon />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-zinc-500 sm:flex-row">
          <p>Signals — dummy data, no real trading advice.</p>
          <div className="flex items-center gap-5">
            <a href="#ticker" className="transition-colors hover:text-zinc-300">
              Live feed
            </a>
            <a href="#pricing" className="transition-colors hover:text-zinc-300">
              Pricing
            </a>
            <Link href="/signup" className="transition-colors hover:text-zinc-300">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}