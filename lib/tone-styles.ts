// Shared tone (buy/sell/watch + live-derived outcome) styling — used by
// TickerCard and the signal detail modal so both render the same
// badge/border colors. Split out of ticker.tsx to avoid a circular import
// between ticker.tsx and the modal.
//
// target_hit / stopped take over the DIR badge once the live price crosses
// a target or the stop — a signal no longer shows "BUY" forever just
// because nobody's manually closed it out yet.

export type Tone = "bullish" | "bearish" | "neutral" | "target_hit" | "stopped";

export const TONES: Record<
  Tone,
  {
    label: string;
    badge: string;
    card: string;
    hover: string;
    text: string;
    target: string;
    shadow: string;
  }
> = {
  bullish: {
    label: "BUY",
    badge: "bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/40",
    card: "border-emerald-400/40 bg-zinc-900",
    hover: "group-hover:border-emerald-300/70",
    text: "text-emerald-400",
    target: "text-emerald-400",
    shadow: "shadow-[0_16px_32px_-18px] shadow-emerald-500/40",
  },
  bearish: {
    label: "SELL",
    badge: "bg-rose-400/15 text-rose-300 ring-1 ring-inset ring-rose-400/40",
    card: "border-rose-400/40 bg-zinc-900",
    hover: "group-hover:border-rose-300/70",
    text: "text-rose-400",
    target: "text-rose-400",
    shadow: "shadow-[0_16px_32px_-18px] shadow-rose-500/40",
  },
  neutral: {
    label: "WATCH",
    badge: "bg-zinc-400/15 text-zinc-300 ring-1 ring-inset ring-zinc-400/40",
    card: "border-zinc-600/60 bg-zinc-900",
    hover: "group-hover:border-zinc-300/70",
    text: "text-zinc-300",
    target: "text-zinc-200",
    shadow: "shadow-[0_16px_32px_-18px] shadow-zinc-900",
  },
  target_hit: {
    label: "TARGET HIT",
    badge: "bg-sky-400/15 text-sky-300 ring-1 ring-inset ring-sky-400/40",
    card: "border-sky-400/40 bg-zinc-900",
    hover: "group-hover:border-sky-300/70",
    text: "text-sky-400",
    target: "text-sky-400",
    shadow: "shadow-[0_16px_32px_-18px] shadow-sky-500/40",
  },
  stopped: {
    label: "STOPPED",
    badge: "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/40",
    card: "border-amber-400/40 bg-zinc-900",
    hover: "group-hover:border-amber-300/70",
    text: "text-amber-400",
    target: "text-amber-400",
    shadow: "shadow-[0_16px_32px_-18px] shadow-amber-500/40",
  },
};
