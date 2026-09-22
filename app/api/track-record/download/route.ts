// Tradebook CSV export for the public track record page
// (app/dashboard/track-record/page.tsx) — same tenant-scoped data, same
// return-locking rules (furthestHitTarget()/returnPct(), lib/live-signals.ts)
// as what's rendered on screen, just flattened to a downloadable file.
// Auth-gated the same way as the page itself: any signed-in customer can
// download their own tenant's tradebook, nothing more.

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { loadLiveSignals, furthestHitTarget, returnPct, type LiveSignal } from "@/lib/live-signals";
import { resolveCustomerTenant } from "@/lib/tenants";

const HEADERS = [
  "Symbol",
  "Direction",
  "Outcome",
  "Generated",
  "Days",
  "Entry",
  "Target 1",
  "Target 1 Hit",
  "Target 2",
  "Target 2 Hit",
  "Target 3",
  "Target 3 Hit",
  "Stop",
  "Stop Hit",
  "Trailing SL",
  "Trail %",
  "Current Trailing Stop",
  "Reference Price",
  "Return %",
];

// Minimal RFC 4180 escaping — wrap in quotes and double up any embedded
// quotes whenever a value could contain a comma, quote, or newline. Every
// field here is either a plain number/date or a short enum string, but
// symbol/name could theoretically contain a comma, so this stays generic
// rather than assuming.
function csvField(v: string | number | null): string {
  if (v === null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function daysSince(generatedAt: string): number {
  const start = new Date(generatedAt).getTime();
  return Math.max(0, Math.round((Date.now() - start) / 86_400_000));
}

function row(s: LiveSignal): (string | number | null)[] {
  const ret = returnPct(s);
  const locked = furthestHitTarget(s);
  const referenceLabel = locked !== null ? "target lock" : s.outcome !== "open" ? "exit" : "live";
  const referencePrice =
    locked !== null ? locked : s.outcome !== "open" && s.exitPrice !== null ? s.exitPrice : s.price;
  return [
    s.symbol,
    s.signal,
    s.outcome,
    new Date(s.generatedAt).toISOString().slice(0, 10),
    daysSince(s.generatedAt),
    s.entry,
    s.target,
    s.target1Hit ? "yes" : "no",
    s.target2,
    s.target2 !== null ? (s.target2Hit ? "yes" : "no") : "",
    s.target3,
    s.target3 !== null ? (s.target3Hit ? "yes" : "no") : "",
    s.stop,
    s.outcome === "stopped" ? "yes" : "no",
    s.trailingSlEnabled ? "yes" : "no",
    s.trailingSlPct,
    s.trailingStopPrice,
    `${referencePrice} (${referenceLabel})`,
    ret === null ? "" : ret.toFixed(2),
  ];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenant = await resolveCustomerTenant(userId);
  const { signals } = await loadLiveSignals(tenant.id);

  const lines = [HEADERS, ...signals.map(row)].map((cols) => cols.map(csvField).join(","));
  const csv = lines.join("\r\n") + "\r\n";
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tradebook-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
