import type { TickerStock } from "@/lib/stocks";

export type SignalsResponse = {
  signals: TickerStock[];
  generatedAt: string;
};

export async function fetchSignals(): Promise<SignalsResponse | null> {
  try {
    const res = await fetch("/api/signals", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SignalsResponse;
  } catch {
    return null;
  }
}