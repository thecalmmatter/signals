// Shared conviction-score logic — originally lived only inside
// components/stock-analytics-pane.tsx, extracted so the track-record table
// (a plain server component, no "use client") can compute the same score
// per row without duplicating the heuristic or importing client-component
// code. First-pass heuristic composite, 0-100. Deliberately simple and
// openly approximate — not investment advice.

import type { LiveSignal } from "./live-signals";
import type { RecosBar, ShareholdingCategory, StockDetails } from "./indian-stock-api";

export type ConvictionScore = {
  overall: number;
  technical: number;
  analyst: number;
  ownership: number;
};

export function recoCounts(recosBar: RecosBar): { buy: number; hold: number; sell: number } {
  const rows = recosBar?.stockAnalyst ?? [];
  const find = (name: string) => rows.find((r) => r.ratingName === name)?.numberOfAnalysts ?? 0;
  return {
    buy: find("Strong Buy") + find("Buy"),
    hold: find("Hold"),
    sell: find("Sell") + find("Strong Sell"),
  };
}

export function latestShareholdingPct(
  shareholding: ShareholdingCategory[] | null,
  displayName: string
): number | null {
  const row = shareholding?.find((s) => s.displayName === displayName);
  const last = row?.categories[row.categories.length - 1];
  if (!last) return null;
  const v = Number(last.percentage);
  return Number.isFinite(v) ? v : null;
}

export function convictionScore(signal: LiveSignal | null, stock: StockDetails | null): ConvictionScore {
  const technical = !signal ? 50 : signal.outcome === "target_hit" ? 90 : signal.outcome === "stopped" ? 20 : 65;

  const { buy, hold, sell } = recoCounts(stock?.recosBar ?? null);
  const totalRecos = buy + sell + hold;
  const analyst = totalRecos > 0 ? Math.round(((buy + hold * 0.5) / totalRecos) * 100) : 50;

  const promoterPct = latestShareholdingPct(stock?.shareholding ?? null, "Promoter");
  const ownership = promoterPct === null ? 50 : promoterPct >= 50 ? 70 : promoterPct >= 25 ? 55 : 40;

  const overall = Math.round(technical * 0.4 + analyst * 0.35 + ownership * 0.25);
  return { overall, technical, analyst, ownership };
}
