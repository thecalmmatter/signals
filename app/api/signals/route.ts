import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPool } from "@/lib/db";
import { getAdminUserId } from "@/lib/admin";
import { getAccessStatus } from "@/lib/access";
import { getQuotes, type Quote } from "@/lib/fyers";
import { ADMIN_COLUMNS, mapAdminRow } from "@/lib/signals-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

function goodNum(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

// Live quotes are shared across every browser polling this route (every
// signed-in user's ticker hits this every 10s) — cache briefly so we're not
// hammering Fyers once per request. Keyed by the sorted symbol set so it
// self-invalidates when the active signal list changes.
type QuoteCacheEntry = { at: number; data: Map<string, Quote> };
let quoteCache: QuoteCacheEntry | null = null;
let quoteCacheKey = "";
const QUOTE_TTL_MS = 20_000;

async function getQuotesCached(symbols: string[]): Promise<Map<string, Quote>> {
  if (symbols.length === 0) return new Map();
  const key = [...symbols].sort().join(",");
  if (quoteCache && quoteCacheKey === key && Date.now() - quoteCache.at < QUOTE_TTL_MS) {
    return quoteCache.data;
  }
  const data = await getQuotes(symbols);
  quoteCache = { at: Date.now(), data };
  quoteCacheKey = key;
  return data;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return json({ error: "unauthorized" }, 401);
  const access = await getAccessStatus(userId);
  if (!access.allowed) return json({ error: "subscription required" }, 402);

  try {
    // Duplicate active rows can exist per symbol (manual rows have NULL
    // trigger_date/scan_url, and Postgres doesn't enforce uniqueness across
    // NULLs) — DISTINCT ON collapses to the most recently updated row per
    // symbol so an edit always wins over a stale duplicate.
    const { rows } = await getPool().query(
      `SELECT * FROM (
         SELECT DISTINCT ON (symbol)
                symbol, name, signal_type, price,
                entry_price, target_price, stop_price, days_in, days_to_exit,
                status, generated_at, updated_at
           FROM signals
          WHERE status = 'active'
          ORDER BY symbol, updated_at DESC
       ) t
       ORDER BY generated_at DESC, symbol`
    );

    // Price and %change shown on the ticker are live market data, not
    // admin-entered — fetch a live quote per symbol (batched, cached) and
    // use it whenever available. Falls back to the DB's stored price (e.g.
    // Chartlink's trigger-time price) with 0% change if Fyers is down or a
    // symbol has no quote, rather than breaking the whole feed.
    let quotes = new Map<string, Quote>();
    try {
      quotes = await getQuotesCached(rows.map((r) => r.symbol));
    } catch (error) {
      console.error("GET /api/signals: live quotes unavailable, falling back to stored price", error);
    }

    const signals = rows.map((r) => {
      const quote = quotes.get(r.symbol);
      const price = quote ? quote.ltp : Number(r.price) || 0;
      const changePct = quote && quote.prevClose ? ((quote.ltp - quote.prevClose) / quote.prevClose) * 100 : 0;
      const change = quote ? quote.ltp - quote.prevClose : 0;
      return {
        symbol: r.symbol,
        name: r.name ?? r.symbol,
        signal: r.signal_type,
        price,
        changePct,
        change,
        entry: Number(r.entry_price),
        target: Number(r.target_price),
        stop: Number(r.stop_price),
        // No longer shown on the ticker, but the chat feature still uses
        // this as background context — keep it populated, just not rendered.
        daysIn: Number(r.days_in) || 0,
        daysToExit: Number(r.days_to_exit) || 0,
      };
    });

    return NextResponse.json({ signals, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/signals failed", error);
    return NextResponse.json(
      { error: "failed to load signals" },
      { status: 500 }
    );
  }
}

// Manually create a signal (admin only). This is the "add by hand a signal
// Chartlink never fired on" path — no webhook involved, source = 'manual'.
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
  const type = String(body.type ?? "").trim().toLowerCase();
  if (!symbol) return json({ error: "symbol is required" }, 400);
  if (type !== "buy" && type !== "sell") return json({ error: "type must be 'buy' or 'sell'" }, 400);

  const entry = goodNum(body.entryPrice);
  const target = goodNum(body.targetPrice);
  const stop = goodNum(body.stopPrice);
  if (entry === "invalid") return json({ error: "invalid entryPrice" }, 400);
  if (target === "invalid") return json({ error: "invalid targetPrice" }, 400);
  if (stop === "invalid") return json({ error: "invalid stopPrice" }, 400);
  const notes = body.notes === undefined || body.notes === null ? null : String(body.notes);

  const pool = getPool();

  // Manual rows have NULL trigger_date/scan_url, so the DB's unique
  // constraint (symbol, trigger_date, scan_url) doesn't dedupe them — adding
  // the same symbol twice silently created two active rows. Upsert on the
  // existing active row for this symbol instead of always inserting.
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM signals WHERE symbol = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`,
    [symbol]
  );

  let id: string;
  let eventType: string;
  let eventDetail: string;

  if (existing.rows[0]) {
    id = existing.rows[0].id;
    await pool.query(
      `UPDATE signals
          SET signal_type = $1, entry_price = $2, target_price = $3, stop_price = $4,
              source = 'manual', updated_by = $5, notes = $6, updated_at = now()
        WHERE id = $7`,
      [type, entry, target, stop, adminId, notes, id]
    );
    eventType = "manual_edited";
    eventDetail = `manual add re-used existing active row (entry=${entry}, target=${target}, stop=${stop})`;
  } else {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO signals
         (symbol, name, signal_type, entry_price, target_price, stop_price,
          source, updated_by, notes, status, generated_at, updated_at, days_in)
       VALUES ($1, $1, $2, $3, $4, $5, 'manual', $6, $7, 'active', now(), now(), 0)
       RETURNING id`,
      [symbol, type, entry, target, stop, adminId, notes]
    );
    id = inserted.rows[0].id;
    eventType = "manual_created";
    eventDetail = "manually created signal (source=manual)";
  }

  await pool.query(
    `INSERT INTO signal_events (signal_id, event_type, symbol, detail, raw_payload)
     VALUES ($1, $2, $3, $4, NULL)`,
    [id, eventType, symbol, eventDetail]
  );

  const row = await pool.query(`SELECT ${ADMIN_COLUMNS} FROM signals WHERE id = $1`, [id]);
  return json({ signal: mapAdminRow(row.rows[0]) }, existing.rows[0] ? 200 : 201);
}