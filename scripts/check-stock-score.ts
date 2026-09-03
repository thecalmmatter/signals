// Manual conviction-score check for a single symbol — no need to open the
// app or wait for a symbol to have a live signal. Reuses the exact same
// lib/conviction-score.ts + lib/indian-stock-api.ts code the track record
// page and stock analytics pane run, so the number here always matches what
// the UI would show.
//
// Usage (run from the project root):
//   INDIAN_STOCK_API_KEY=xxxxx npx tsx scripts/check-stock-score.ts RELIANCE
//
// Or, if INDIAN_STOCK_API_KEY is already in .env.local:
//   set -a && source .env.local && set +a && npx tsx scripts/check-stock-score.ts RELIANCE
//
// By default this scores the symbol as if it has NO active signal (matches
// what you'd see for a stock with no live trade — technical component
// defaults to 50). Pass --outcome=open|target_hit|stopped to see the score
// as if a signal in that state were live, matching a real row on the track
// record page:
//   npx tsx scripts/check-stock-score.ts MCX --outcome=target_hit
//
// Needs the "tsx" dev dependency — installed via `npm install -D tsx` if
// it's not already in package.json.

import { getStockDetails, isIndianStockApiConfigured } from "../lib/indian-stock-api";
import { convictionScore } from "../lib/conviction-score";
import type { LiveSignal, SignalOutcome } from "../lib/live-signals";

const VALID_OUTCOMES: SignalOutcome[] = ["open", "target_hit", "stopped"];

async function main() {
  const [symbolArg, ...rest] = process.argv.slice(2);
  if (!symbolArg) {
    console.error("Usage: npx tsx scripts/check-stock-score.ts <SYMBOL> [--outcome=open|target_hit|stopped]");
    process.exit(1);
  }
  const symbol = symbolArg.toUpperCase();

  if (!isIndianStockApiConfigured()) {
    console.error("INDIAN_STOCK_API_KEY is not set — export it or source your .env.local first.");
    process.exit(1);
  }

  const outcomeFlag = rest.find((a) => a.startsWith("--outcome="));
  const outcomeValue = outcomeFlag?.split("=")[1];
  if (outcomeValue && !VALID_OUTCOMES.includes(outcomeValue as SignalOutcome)) {
    console.error(`--outcome must be one of: ${VALID_OUTCOMES.join(", ")}`);
    process.exit(1);
  }

  // Fake signal, just enough for convictionScore's technical component,
  // which only reads .outcome. Leave outcomeFlag unset to score as "no
  // active signal" (technical defaults to 50) — pass null in that case.
  const fakeSignal: LiveSignal | null = outcomeValue
    ? {
        symbol,
        name: symbol,
        signal: "buy",
        price: 0,
        changePct: 0,
        change: 0,
        entry: null,
        target: null,
        target2: null,
        target3: null,
        stop: null,
        outcome: outcomeValue as SignalOutcome,
        exitPrice: null,
        daysIn: 0,
        daysToExit: 0,
        generatedAt: new Date().toISOString(),
      }
    : null;

  console.log(`Fetching research data for ${symbol}...`);
  const stock = await getStockDetails(symbol);
  const score = convictionScore(fakeSignal, stock);

  console.log(`\n${stock.companyName ?? symbol}`);
  console.log(`Overall score: ${score.overall}`);
  console.log(`  Technical: ${score.technical}  (outcome=${fakeSignal?.outcome ?? "no active signal, defaults to 50"})`);
  console.log(`  Analyst:   ${score.analyst}`);
  console.log(`  Ownership: ${score.ownership}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
