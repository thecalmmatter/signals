import Link from "next/link";
import { Ticker } from "@/components/ticker";
import { LandingParticleCanvas } from "@/components/landing-particle-canvas";
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

const COMPLEXITY = [
  {
    tag: "01",
    title: "Indicator paralysis",
    body: "RSI says overbought, MACD says bullish cross, Bollinger Bands squeeze. Ten conflicting indicators lead to hesitation and late entries.",
  },
  {
    tag: "02",
    title: "Emotional exit drag",
    body: "Traders sell winners after a small pop out of fear, but hold losers hoping for a rebound. Without a clear stop, discipline decays.",
  },
  {
    tag: "03",
    title: "Undefined risk",
    body: "Entering without a clear invalidation point turns a promising setup into an open-ended drawdown.",
  },
];

const STEPS = [
  {
    title: "Nightly screener scan",
    body: "A screener runs across NSE large-caps after market close and flags stocks matching a defined technical setup.",
  },
  {
    title: "Mapped scans publish, the rest queue for review",
    body: "A flagged setup only becomes a live signal if it matches a known, pre-mapped scan. Anything unmapped goes into a review queue instead of being guessed.",
  },
  {
    title: "One clean card",
    body: "Every published signal reads the same way: symbol, entry, target, stop. Nothing else to interpret.",
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
          <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
            <a href="#ticker" className="transition-colors hover:text-zinc-100">
              Live signals
            </a>
            <a href="#how" className="transition-colors hover:text-zinc-100">
              How it works
            </a>
            <a href="#track-record" className="transition-colors hover:text-zinc-100">
              Track record
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
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="neural-grid-bg pointer-events-none absolute inset-0" />
          <LandingParticleCanvas />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/60 to-zinc-950" />

          <div className="relative mx-auto w-full max-w-6xl px-6 pt-20 pb-14 text-center md:pt-28 md:pb-20">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full glass-panel px-3.5 py-1.5 text-xs font-mono font-medium tracking-wide text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              SWING SIGNALS, PUBLISHED NIGHTLY
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">NSE LARGE-CAPS</span>
            </p>
            <h1 className="mx-auto mt-6 max-w-2xl text-4xl font-normal leading-tight tracking-tight text-zinc-50 md:text-6xl md:leading-[1.05]">
              Know the signal.
              <br />
              <span className="font-serif italic editorial-gradient-text">
                Skip the noise.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-400 md:text-lg">
              A nightly scan surfaces high-conviction swing setups on Indian
              large-caps. Every setup lands as one clean card — entry, target,
              stop. Nothing to interpret.
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
                href="#how"
                className="inline-flex h-11 items-center rounded-full glass-panel px-6 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-50"
              >
                See how it works
              </a>
            </div>

            <div className="mx-auto mt-14 grid max-w-2xl grid-cols-1 gap-4 border-t border-white/[0.08] pt-8 text-center sm:grid-cols-3 sm:gap-8">
              <div>
                <p className="font-mono text-lg font-semibold text-white sm:text-xl">
                  Entry · Target · Stop
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  Every signal, same format
                </p>
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-emerald-400 sm:text-xl">
                  Admin-reviewed
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  Nothing auto-published blind
                </p>
              </div>
              <div>
                <p className="font-mono text-lg font-semibold text-sky-400 sm:text-xl">
                  Free right now
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
                  During the public dry run
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* LIVE TICKER */}
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

        {/* THE COMPLEXITY */}
        <section className="scroll-mt-24 border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <p className="font-mono text-xs uppercase tracking-widest text-sky-400">
              The market paradigm
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
              Indian markets are{" "}
              <span className="font-serif italic text-zinc-300">
                chaotic and noisy.
              </span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
              Between false breakouts and dozens of indicators pointing in
              different directions, most retail traders fail from cognitive
              overload, not a lack of setups.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {COMPLEXITY.map((item) => (
                <div
                  key={item.title}
                  className="glass-panel rounded-2xl p-6 transition-colors hover:border-white/20"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-800/80 font-mono text-sm text-zinc-300 ring-1 ring-inset ring-zinc-700/60">
                    {item.tag}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-zinc-50">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-24 border-t border-zinc-800/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">
              How Signals works
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
              Three steps,{" "}
              <span className="font-serif italic text-emerald-300">
                no black box.
              </span>
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div
                  key={step.title}
                  className="glass-panel-glow rounded-2xl p-6"
                >
                  <p className="font-mono text-xs uppercase tracking-widest text-sky-400">
                    Step {String(i + 1).padStart(2, "0")}
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

        {/* TRACK RECORD */}
        <section
          id="track-record"
          className="scroll-mt-24 border-t border-zinc-800/60 bg-zinc-900/30"
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <p className="font-mono text-xs uppercase tracking-widest text-sky-400">
              Track record
            </p>
            <h2 className="mt-3 max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
              No cherry-picked stats.{" "}
              <span className="font-serif italic text-sky-300">
                Just what actually got called.
              </span>
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
              We&rsquo;re early — there&rsquo;s no backtested win rate to show
              yet, and we&rsquo;d rather say that plainly than make one up.
              Every position posted publicly is logged the moment it&rsquo;s
              made: symbol, direction, entry, target, stop, and how it closed.
              As that history builds, it&rsquo;ll be shown here in full, wins
              and losses both.
            </p>
            <div className="mt-8 max-w-xl glass-panel rounded-2xl p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  How it&rsquo;s tracked
                </span>
              </div>
              <p className="text-sm leading-6 text-zinc-400">
                Every publicly-posted call goes into a running ledger the
                moment it&rsquo;s made — not after the fact, and not only the
                ones that worked out. Nothing is removed or reworded once
                it&rsquo;s live.
              </p>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="scroll-mt-24 border-t border-zinc-800/60">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">
                Membership access
              </p>
              <h2 className="mt-3 text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
                Simple,{" "}
                <span className="font-serif italic text-emerald-300">
                  high-conviction access.
                </span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                Free for everyone during the public dry run. Pricing unlocks
                at launch.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-3 md:items-start">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={
                    plan.featured
                      ? "relative glass-panel-glow rounded-2xl border border-emerald-500/40 p-6"
                      : "glass-panel rounded-2xl p-6"
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

        {/* CLOSING CTA */}
        <section className="border-t border-zinc-800/60 bg-zinc-900/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20 text-center md:py-24">
            <div className="glass-panel mx-auto max-w-2xl rounded-3xl px-8 py-12 sm:px-12 sm:py-16">
              <h2 className="mx-auto max-w-xl text-2xl font-normal tracking-tight text-zinc-50 md:text-4xl">
                Your next swing is{" "}
                <span className="font-serif italic text-emerald-300">
                  already forming.
                </span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
                New setups land as the nightly scan completes. No charts to
                babysit.
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
            </div>
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
