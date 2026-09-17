import { disclaimerBannerText, type DisclaimerTenant } from "@/lib/disclaimer";

// Prominent, always-visible regulatory disclaimer for pages that show real
// entry/target/stop calls (dashboard, track record) — see lib/disclaimer.ts
// for why this exists and its "not legal advice, get this reviewed" caveat.
// Deliberately its own component (not inlined per-page) so every page that
// needs it renders byte-identical wording — the fix for one page's copy
// drifting from another's is to only have one copy to begin with.
export function DisclaimerBanner({ tenant }: { tenant: DisclaimerTenant }) {
  return (
    <p className="mb-6 rounded-lg border border-zinc-700/60 bg-zinc-900/60 px-3 py-2 text-xs leading-5 text-zinc-400">
      {disclaimerBannerText(tenant)}
    </p>
  );
}
