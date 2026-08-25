export type Signal = "buy" | "sell" | "watch";

export type TickerStock = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  signal: Signal;
  /** Days already into the swing. */
  daysIn: number;
  /** Days remaining until the setup's expected exit. */
  daysToExit: number;
  entry: number;
  /** T1 / short-term target. */
  target: number;
  /** T2 / medium-term target — not every signal has one yet. */
  target2?: number | null;
  /** T3 / long-term target — not every signal has one yet. */
  target3?: number | null;
  stop: number;
};

/** Hardcoded dummy data until a real data layer is introduced. */
export const STOCKS: TickerStock[] = [
  { symbol: "RELIANCE", name: "Reliance Industries", price: 2984.5, change: 35.4, changePct: 1.2, signal: "buy", daysIn: 3, daysToExit: 2, entry: 2890, target: 3150, stop: 2840 },
  { symbol: "TCS", name: "Tata Consultancy Srv", price: 4102.3, change: 24.6, changePct: 0.6, signal: "buy", daysIn: 5, daysToExit: 4, entry: 3985, target: 4280, stop: 3930 },
  { symbol: "HDFCBANK", name: "HDFC Bank", price: 1789.9, change: -14.2, changePct: -0.79, signal: "sell", daysIn: 2, daysToExit: 1, entry: 1860, target: 1685, stop: 1920 },
  { symbol: "INFY", name: "Infosys", price: 1598.4, change: 6.3, changePct: 0.4, signal: "watch", daysIn: 1, daysToExit: 6, entry: 1540, target: 1705, stop: 1500 },
  { symbol: "SBIN", name: "State Bank of India", price: 834.1, change: -6.8, changePct: -0.81, signal: "sell", daysIn: 4, daysToExit: 3, entry: 885, target: 795, stop: 910 },
  { symbol: "ADANIENT", name: "Adani Enterprises", price: 3122.7, change: 48.9, changePct: 1.59, signal: "buy", daysIn: 6, daysToExit: 5, entry: 2910, target: 3400, stop: 2850 },
  { symbol: "TITAN", name: "Titan Company", price: 3490.2, change: -21.6, changePct: -0.61, signal: "sell", daysIn: 3, daysToExit: 2, entry: 3620, target: 3310, stop: 3730 },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", price: 1654.8, change: 12.1, changePct: 0.74, signal: "buy", daysIn: 2, daysToExit: 1, entry: 1598, target: 1750, stop: 1560 },
  { symbol: "WIPRO", name: "Wipro", price: 288.6, change: -2.4, changePct: -0.82, signal: "sell", daysIn: 1, daysToExit: 2, entry: 305, target: 271, stop: 312 },
  { symbol: "ONGC", name: "Oil & Natural Gas", price: 272.4, change: 0, changePct: 0, signal: "watch", daysIn: 2, daysToExit: 4, entry: 261, target: 290, stop: 254 },
];

export function toneOf(
  signal: Signal
): "bullish" | "bearish" | "neutral" {
  if (signal === "buy") return "bullish";
  if (signal === "sell") return "bearish";
  return "neutral";
}