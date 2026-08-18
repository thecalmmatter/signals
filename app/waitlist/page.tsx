import { WaitlistForm } from "@/components/waitlist-form";

export const metadata = {
  title: "Get tomorrow's signal — Signals",
  description:
    "One swing setup, delivered before the market opens. Entry, target, stop, and the RSI cascade behind it. Free to join.",
};

const EXAMPLE = {
  symbol: "RELIANCE",
  name: "Reliance Industries",
  entry: 2890,
  target: 3150,
  stop: 2840,
};

const POINTS = [
  {
    title: "One setup, every morning",
    body: "A single high-conviction swing signal, picked the night before and in your inbox before the opening bell.",
  },
  {
    title: "Entry, target, stop — no guesswork",
    body: "Every signal comes with exact levels and the RSI cascade (weekly → 15m) that triggered it.",
  },
  {
    title: "No spam, no upsell drip",
    body: "Just the setup. Unsubscribe in one click whenever you want.",
  },
];

export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string }>;
}) {
  const { src } = await searchParams;
  const source = src?.trim() || null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Swing signals on Indian large-caps
        </p>

        <h1 className="mx-auto mt-6 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-zinc-50 md:text-5xl md:leading-[1.05]">
          Get tomorrow&apos;s signal
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-zinc-400">
          One swing setup a day — entry, target, stop, and why. Join free and
          get the next one before the market opens.
        </p>

        <div className="mt-10 w-full">
          <WaitlistForm source={source} />
        </div>

        {/* Static example — not live data, just what a signal looks like. */}
        <div className="mt-14 w-full">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-600">
            What you&apos;ll get — example
          </p>
          <div className="mx-auto w-full max-w-sm rounded-2xl border border-emerald-400/40 bg-zinc-900 p-5 text-left shadow-[0_16px_32px_-18px] shadow-emerald-500/40">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-zinc-50">{EXAMPLE.symbol}</p>
                <p className="text-xs text-zinc-500">{EXAMPLE.name}</p>
              </div>
              <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-emerald-300 ring-1 ring-inset ring-emerald-400/40">
                BUY
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-4 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Entry</p>
                <p className="font-semibold tabular-nums text-zinc-50">
                  ₹{EXAMPLE.entry.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Target</p>
                <p className="font-semibold tabular-nums text-emerald-400">
                  ₹{EXAMPLE.target.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Stop</p>
                <p className="font-semibold tabular-nums text-zinc-50">
                  ₹{EXAMPLE.stop.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-zinc-800/70 bg-zinc-900/40 p-4">
              <h3 className="text-sm font-semibold text-zinc-50">{p.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-zinc-400">{p.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-800/60 py-6 text-center text-xs text-zinc-600">
        Signals — dummy data, no real trading advice.
      </footer>
    </div>
  );
}
