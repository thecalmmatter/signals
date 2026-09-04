// Manual conviction-score check for a single symbol — no need to open the
// app. By default this looks up the symbol's REAL live signal (same query
// loadLiveSignals() runs for the track record page — needs DATABASE_URL and
// Fyers credentials in .env.local, same as the app), so the number always
// matches what the UI shows. If the symbol has no active signal, it scores
// as "no active signal" (technical defaults to 50) — same as the app would.
//
// Usage (run from the project root):
//   ./scripts/score.sh RELIANCE
//   npx tsx scripts/check-stock-score.ts RELIANCE
//
// To simulate a hypothetical outcome instead of looking up the real signal
// (e.g. "what would this score if it hit target"), override with:
//   npx tsx scripts/check-stock-score.ts MCX --outcome=target_hit
//
// Needs the "tsx" dev dependency — installed via `npm install -D tsx` if
// it's not already in package.json.

import { getStockDetails, isIndianStockApiConfigured } from "../lib/indian-stock-api";
import { convictionScore } from "../lib/conviction-score";
import { loadLiveSignals, type LiveSignal, type SignalOutcome } from "../lib/live-signals";

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

  let signal: LiveSignal | null = null;
  if (outcomeValue) {
    // Explicit override — fake signal just enough for convictionScore's
    // technical component, which only reads .outcome.
    signal = {
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
      target1Hit: false,
      target2Hit: false,
      target3Hit: false,
      exitPrice: null,
      daysIn: 0,
      daysToExit: 0,
      generatedAt: new Date().toISOString(),
    };
  } else {
    // Default path: look up the symbol's actual live signal, exactly like
    // the track record page does, so this matches the UI without guessing.
    try {
      const { signals } = await loadLiveSignals();
      signal = signals.find((s) => s.symbol === symbol) ?? null;
      console.log(
        signal
          ? `Active signal found: ${signal.signal}, outcome=${signal.outcome}`
          : `No active signal for ${symbol} — scoring as "no active signal".`
      );
    } catch (err) {
      console.warn(
        `Could not look up the live signal (check DATABASE_URL / Fyers env vars) — falling back to "no active signal". ${
          err instanceof Error ? err.message : err
        }`
      );
    }
  }

  console.log(`Fetching research data for ${symbol}...`);
  const stock = await getStockDetails(symbol);
  const score = convictionScore(signal, stock);

  console.log(`\n${stock.companyName ?? symbol}`);
  console.log(`Overall score: ${score.overall}`);
  console.log(`  Technical: ${score.technical}  (outcome=${signal?.outcome ?? "no active signal, defaults to 50"})`);
  console.log(`  Analyst:   ${score.analyst}`);
  console.log(`  Ownership: ${score.ownership}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
