import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin";
import { placeOrder, FyersOrderError } from "@/lib/fyers-orders";
import type { OrderKind, OrderSide, ProductType } from "@/lib/fyers-orders";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

const SIDES: OrderSide[] = ["BUY", "SELL"];
const KINDS: OrderKind[] = ["MARKET", "LIMIT"];
const PRODUCTS: ProductType[] = ["CNC", "INTRADAY"];

// Admin-only: places a real order against the app's own connected Fyers
// account. No auto stop-loss/target — this fires exactly one order; the
// admin manages exits separately (in Fyers, or by hand).
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (!adminId) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);

  const qty = Number(body.qty);
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    return json({ error: "qty must be a positive whole number" }, 400);
  }

  const side = String(body.side ?? "").toUpperCase() as OrderSide;
  if (!SIDES.includes(side)) return json({ error: "side must be BUY or SELL" }, 400);

  const orderKind = String(body.orderKind ?? "").toUpperCase() as OrderKind;
  if (!KINDS.includes(orderKind)) return json({ error: "orderKind must be MARKET or LIMIT" }, 400);

  const productType = String(body.productType ?? "").toUpperCase() as ProductType;
  if (!PRODUCTS.includes(productType)) {
    return json({ error: "productType must be CNC or INTRADAY" }, 400);
  }

  let limitPrice: number | undefined;
  if (orderKind === "LIMIT") {
    limitPrice = Number(body.limitPrice);
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
      return json({ error: "limitPrice is required for a LIMIT order" }, 400);
    }
  }

  try {
    const result = await placeOrder({ symbol, qty, side, orderKind, limitPrice, productType });
    return json({ orderId: result.orderId }, 201);
  } catch (error) {
    const message = error instanceof FyersOrderError ? error.message : "order placement failed";
    console.error(`POST /api/admin/broker/orders failed for ${symbol}`, error);
    return json({ error: message }, 502);
  }
}
