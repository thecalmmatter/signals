import { SubscribeButton } from "@/components/subscribe-button";

export function Paywall({ trialEndsAt }: { trialEndsAt: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/70 to-zinc-950 px-6 py-16 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-inset ring-emerald-400/30">
        <svg viewBox="0 0 16 16" className="h-6 w-6 fill-current" aria-hidden="true">
          <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2z" />
        </svg>
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-50">
        {trialEndsAt ? "Your dry run has ended" : "Subscribe to unlock the live feed"}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-zinc-400">
        Subscribe to keep full access — live signals, the chart & RSI splash, and asking about any setup.
      </p>
      <div className="mt-6">
        <SubscribeButton />
      </div>
    </div>
  );
}
