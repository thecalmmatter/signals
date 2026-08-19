"use client";

import { useEffect, useState } from "react";

type BrokerPosition = {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT" | "FLAT";
  qty: number;
  avgPrice: number;
  ltp: number;
  productType: string;
  pl: number;
  realizedPl: number;
  unrealizedPl: number;
};

type PositionsResponse = {
  positions: BrokerPosition[];
  openCount: number;
  totalPl: number;
  funds: { available: number } | null;
  error: string | null;
};

type OrderSide = "BUY" | "SELL";
type OrderKind = "MARKET" | "LIMIT";
type ProductType = "CNC" | "INTRADAY";

type OrderForm = {
  symbol: string;
  qty: string;
  side: OrderSide;
  orderKind: OrderKind;
  limitPrice: string;
  productType: ProductType;
};

const emptyForm: OrderForm = {
  symbol: "",
  qty: "",
  side: "BUY",
  orderKind: "MARKET",
  limitPrice: "",
  productType: "CNC",
};

const inr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const inputCls =
  "rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-200 outline-none transition focus:border-zinc-600";

const toggleCls = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-zinc-100 text-zinc-900"
      : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800"
  }`;

const REFRESH_MS = 15_000;

async function fetchPositions(): Promise<PositionsResponse> {
  try {
    const res = await fetch("/api/admin/broker/positions", { cache: "no-store" });
    return (await res.json()) as PositionsResponse;
  } catch {
    return { positions: [], openCount: 0, totalPl: 0, funds: null, error: "network error" };
  }
}

export default function AdminBroker() {
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const json = await fetchPositions();
      if (cancelled) return;
      setData(json);
      setLoading(false);
    };

    tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function submitOrder() {
    setOrderError(null);
    setOrderSuccess(null);

    const symbol = form.symbol.trim().toUpperCase();
    const qty = Number(form.qty);
    if (!symbol) return setOrderError("symbol is required");
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return setOrderError("qty must be a positive whole number");
    }
    let limitPrice: number | undefined;
    if (form.orderKind === "LIMIT") {
      limitPrice = Number(form.limitPrice);
      if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
        return setOrderError("limit price is required for a LIMIT order");
      }
    }

    const priceDesc =
      form.orderKind === "MARKET" ? "at MARKET" : `LIMIT @ ${inr(limitPrice!)}`;
    const confirmed = window.confirm(
      `Place order: ${form.side} ${qty} ${symbol} ${priceDesc} (${form.productType})?\n\nThis sends a real order to your connected Fyers account.`
    );
    if (!confirmed) return;

    setPlacing(true);
    try {
      const res = await fetch("/api/admin/broker/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol,
          qty,
          side: form.side,
          orderKind: form.orderKind,
          limitPrice,
          productType: form.productType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "order failed");
      setOrderSuccess(`Order placed — id ${json.orderId}`);
      setForm((f) => ({ ...f, qty: "", limitPrice: "" }));
      // Positions may take a moment to reflect on Fyers' side; refresh now
      // and once more shortly after.
      setData(await fetchPositions());
      setTimeout(async () => setData(await fetchPositions()), 3000);
    } catch (e) {
      setOrderError((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Funds + status */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-zinc-300">
          {loading ? "Loading…" : `${data?.openCount ?? 0} open position${data?.openCount === 1 ? "" : "s"}`}
        </span>
        {data && !data.error && (
          <span
            className={`rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 ${
              data.totalPl > 0 ? "text-emerald-400" : data.totalPl < 0 ? "text-red-400" : "text-zinc-300"
            }`}
          >
            Total P&amp;L {inr(data.totalPl)}
          </span>
        )}
        {data?.funds && (
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-sky-400">
            Available margin {inr(data.funds.available)}
          </span>
        )}
      </div>

      {data?.error && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          Couldn&apos;t reach Fyers: {data.error}. Positions below may be stale —
          if this is the daily token expiry, refresh{" "}
          <code className="text-amber-200">FYERS_ACCESS_TOKEN</code>.
        </div>
      )}

      {/* Place order */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-200">
          Place order{" "}
          <span className="ml-1 text-xs font-normal text-zinc-500">
            (fires a real order to your connected Fyers account — no auto stop-loss/target)
          </span>
        </h2>

        {orderError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {orderError}
          </div>
        )}
        {orderSuccess && (
          <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
            {orderSuccess}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Symbol
            <input
              className={`${inputCls} w-32 uppercase`}
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              placeholder="RELIANCE"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Qty
            <input
              className={`${inputCls} w-20`}
              type="number"
              min={1}
              step={1}
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
            />
          </label>

          <div className="flex flex-col gap-1 text-xs text-zinc-400">
            Side
            <div className="flex gap-1.5">
              <button
                type="button"
                className={toggleCls(form.side === "BUY")}
                onClick={() => setForm((f) => ({ ...f, side: "BUY" }))}
              >
                Buy
              </button>
              <button
                type="button"
                className={toggleCls(form.side === "SELL")}
                onClick={() => setForm((f) => ({ ...f, side: "SELL" }))}
              >
                Sell
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1 text-xs text-zinc-400">
            Order type
            <div className="flex gap-1.5">
              <button
                type="button"
                className={toggleCls(form.orderKind === "MARKET")}
                onClick={() => setForm((f) => ({ ...f, orderKind: "MARKET" }))}
              >
                Market
              </button>
              <button
                type="button"
                className={toggleCls(form.orderKind === "LIMIT")}
                onClick={() => setForm((f) => ({ ...f, orderKind: "LIMIT" }))}
              >
                Limit
              </button>
            </div>
          </div>

          {form.orderKind === "LIMIT" && (
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Limit price
              <input
                className={`${inputCls} w-24`}
                type="number"
                step="any"
                value={form.limitPrice}
                onChange={(e) => setForm((f) => ({ ...f, limitPrice: e.target.value }))}
              />
            </label>
          )}

          <div className="flex flex-col gap-1 text-xs text-zinc-400">
            Product
            <div className="flex gap-1.5">
              <button
                type="button"
                className={toggleCls(form.productType === "CNC")}
                onClick={() => setForm((f) => ({ ...f, productType: "CNC" }))}
              >
                CNC
              </button>
              <button
                type="button"
                className={toggleCls(form.productType === "INTRADAY")}
                onClick={() => setForm((f) => ({ ...f, productType: "INTRADAY" }))}
              >
                Intraday
              </button>
            </div>
          </div>

          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={placing}
            onClick={submitOrder}
          >
            {placing ? "Placing…" : "Place order"}
          </button>
        </div>
      </section>

      {/* Running positions */}
      <section className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2.5">Symbol</th>
              <th className="px-3 py-2.5">Side</th>
              <th className="px-3 py-2.5">Qty</th>
              <th className="px-3 py-2.5">Avg price</th>
              <th className="px-3 py-2.5">LTP</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {!loading && (data?.positions.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                  No open positions right now.
                </td>
              </tr>
            )}
            {data?.positions.map((p) => (
              <tr key={p.id} className="bg-zinc-950">
                <td className="px-3 py-2.5 font-medium text-zinc-100">{p.symbol}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                      p.side === "LONG"
                        ? "bg-emerald-500/15 text-emerald-400 ring-emerald-400/30"
                        : "bg-red-500/15 text-red-400 ring-red-400/30"
                    }`}
                  >
                    {p.side}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">{p.qty}</td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">{inr(p.avgPrice)}</td>
                <td className="px-3 py-2.5 tabular-nums text-zinc-300">{inr(p.ltp)}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">{p.productType}</td>
                <td
                  className={`px-3 py-2.5 tabular-nums font-medium ${
                    p.pl > 0 ? "text-emerald-400" : p.pl < 0 ? "text-red-400" : "text-zinc-300"
                  }`}
                >
                  {inr(p.pl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
