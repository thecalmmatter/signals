// Fyers order-placement + positions client — separate from lib/fyers.ts
// (which only reads market data). This talks to Fyers' trading endpoints
// under /api/v3, using the same FYERS_APP_ID / FYERS_ACCESS_TOKEN as the
// rest of the app (single shared broker account — admin only, no per-user
// broker login).
//
// Endpoints confirmed against Fyers API v3 docs + community examples:
//   POST /api/v3/orders/sync  — place a single order
//   GET  /api/v3/positions    — current day's open/closed positions
//   GET  /api/v3/funds        — available margin/funds by segment

import { toFyersSymbol } from "@/lib/fyers";

const FYERS_TRADE_BASE = "https://api-t1.fyers.in/api/v3";

export class FyersOrderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function authHeaders() {
  const appId = process.env.FYERS_APP_ID;
  const token = process.env.FYERS_ACCESS_TOKEN;
  if (!appId || !token) {
    throw new FyersOrderError("FYERS_APP_ID / FYERS_ACCESS_TOKEN not configured");
  }
  return {
    Authorization: `${appId}:${token}`,
    "Content-Type": "application/json",
  };
}

// ---- Place order ----------------------------------------------------

export type OrderSide = "BUY" | "SELL";
export type OrderKind = "MARKET" | "LIMIT";
export type ProductType = "CNC" | "INTRADAY";

export type PlaceOrderInput = {
  symbol: string; // plain ticker, e.g. "RELIANCE" — converted to NSE:RELIANCE-EQ
  qty: number;
  side: OrderSide;
  orderKind: OrderKind;
  limitPrice?: number; // required when orderKind === "LIMIT"
  productType: ProductType;
};

export type PlaceOrderResult = { orderId: string };

/**
 * Places a single, plain order (no bracket/GTT stop-loss or target attached
 * — the admin manages exits separately). Throws FyersOrderError on any
 * non-2xx or rejected response; callers should catch and surface the message
 * as-is since Fyers' rejection reasons (margin, market closed, etc.) are
 * already human-readable.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const headers = authHeaders();

  if (input.orderKind === "LIMIT" && !(input.limitPrice && input.limitPrice > 0)) {
    throw new FyersOrderError("limitPrice is required for a LIMIT order");
  }

  const body = {
    symbol: toFyersSymbol(input.symbol),
    qty: input.qty,
    type: input.orderKind === "LIMIT" ? 1 : 2, // 1=Limit, 2=Market
    side: input.side === "BUY" ? 1 : -1,
    productType: input.productType,
    limitPrice: input.orderKind === "LIMIT" ? input.limitPrice : 0,
    stopPrice: 0,
    validity: "DAY",
    disclosedQty: 0,
    offlineOrder: false,
    stopLoss: 0,
    takeProfit: 0,
  };

  const res = await fetch(`${FYERS_TRADE_BASE}/orders/sync`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    s?: string;
    id?: string;
    message?: string;
    code?: number;
  };

  if (!res.ok || data.s !== "ok" || !data.id) {
    throw new FyersOrderError(data.message ?? `fyers order rejected (${res.status})`, res.status);
  }

  return { orderId: data.id };
}

// ---- Positions --------------------------------------------------------

export type BrokerPosition = {
  id: string;
  symbol: string; // plain ticker (NSE:RELIANCE-EQ -> RELIANCE)
  side: "LONG" | "SHORT" | "FLAT";
  qty: number;
  avgPrice: number;
  ltp: number;
  productType: string;
  pl: number;
  realizedPl: number;
  unrealizedPl: number;
};

export type PositionsSummary = {
  positions: BrokerPosition[];
  openCount: number;
  totalPl: number;
};

function plainSymbol(fyersSymbol: string): string {
  // "NSE:RELIANCE-EQ" -> "RELIANCE"
  const withoutExchange = fyersSymbol.includes(":") ? fyersSymbol.split(":")[1] : fyersSymbol;
  return withoutExchange.replace(/-EQ$/i, "");
}

function sideLabel(side: number): BrokerPosition["side"] {
  if (side === 1) return "LONG";
  if (side === -1) return "SHORT";
  return "FLAT";
}

/** Current trading day's open + closed positions, straight from Fyers. */
export async function getPositions(): Promise<PositionsSummary> {
  const headers = authHeaders();

  const res = await fetch(`${FYERS_TRADE_BASE}/positions`, {
    headers,
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    s?: string;
    message?: string;
    netPositions?: Array<{
      id: string;
      symbol: string;
      side: number;
      netQty: number;
      netAvg: number;
      ltp: number;
      productType: string;
      pl: number;
      realized_profit: number;
      unrealized_profit: number;
    }>;
    overall?: { count_open?: number; pl_total?: number };
  };

  if (!res.ok || data.s !== "ok" || !Array.isArray(data.netPositions)) {
    throw new FyersOrderError(data.message ?? `fyers positions ${res.status}`, res.status);
  }

  const positions = data.netPositions
    .filter((p) => p.netQty !== 0) // only currently-open positions
    .map((p) => ({
      id: p.id,
      symbol: plainSymbol(p.symbol),
      side: sideLabel(p.side),
      qty: Math.abs(p.netQty),
      avgPrice: p.netAvg,
      ltp: p.ltp,
      productType: p.productType,
      pl: p.pl,
      realizedPl: p.realized_profit,
      unrealizedPl: p.unrealized_profit,
    }));

  return {
    positions,
    openCount: data.overall?.count_open ?? positions.length,
    totalPl: data.overall?.pl_total ?? positions.reduce((sum, p) => sum + p.pl, 0),
  };
}

// ---- Funds --------------------------------------------------------------

export type Funds = { available: number };

/**
 * Available equity margin. Best-effort — callers should treat a thrown
 * error as "unknown", not block order placement on it.
 */
export async function getFunds(): Promise<Funds> {
  const headers = authHeaders();

  const res = await fetch(`${FYERS_TRADE_BASE}/funds`, {
    headers,
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as {
    s?: string;
    message?: string;
    fund_limit?: Array<{ id: number; title: string; equityAmount: number }>;
  };

  if (!res.ok || data.s !== "ok" || !Array.isArray(data.fund_limit)) {
    throw new FyersOrderError(data.message ?? `fyers funds ${res.status}`, res.status);
  }

  // "Available Balance" is the conventional title Fyers uses for the
  // spendable-today figure; fall back to 0 rather than guessing a wrong id.
  const available =
    data.fund_limit.find((f) => f.title.toLowerCase().includes("available"))?.equityAmount ?? 0;

  return { available };
}
