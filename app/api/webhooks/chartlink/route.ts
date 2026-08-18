import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

// Chartlink webhook ingestion. PUBLIC by design — proxy.ts does NOT gate this
// path (Chartlink cannot authenticate via Clerk). Auth = shared secret token in
// the URL:  /api/webhooks/chartlink?token=<CHARTLINK_WEBHOOK_TOKEN>
//
// Confirmed payload shape (one POST carries many stocks):
// {
//   "stocks": "SYMBOL 1, SYMBOL 2, ...",          // comma-separated STRING
//   "trigger_prices": "2500.00,600.00, ...",      // comma-separated STRING
//   "triggered_at": "4:58 pm",                    // time only, NO date
//   "scan_name": "Manish Goel Scan",              // free text (informational)
//   "scan_url": "manish-goel-scan",               // stable slug = scan identity
//   "alert_name": "...", "webhook_url": "..."     // webhook_url echoes our token
// }
//
// Rules implemented here:
//   - stocks/trigger_prices must pair 1:1 after splitting on ','; a length
//     mismatch is a malformed batch -> skipped whole, no partial rows.
//   - trigger_date is computed as TODAY IN IST (Asia/Kolkata). A naive UTC date
//     is wrong for morning-IST alerts (UTC is still the previous day).
//     triggered_at is stored separately in triggered_at_ist (display only).
//   - scan direction comes ONLY from scan_mappings (keyed by scan_url). An
//     unknown or inactive scan is logged as unmapped_scan and skipped — never
//     guessed. This prevents an unrecognized scan from getting mislabeled.
//   - The webhook_url field Chartlink echoes contains our token; it is stripped
//     from raw_payload and from logs before either is persisted.

export const dynamic = "force-dynamic";

const TOKEN = process.env.CHARTLINK_WEBHOOK_TOKEN ?? "";
const OVERRIDE_STATUSES = new Set(["suppressed", "manual_override"]);

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Today's calendar date in IST (Asia/Kolkata), formatted YYYY-MM-DD.
function istDateNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// "4:58 pm" / "4:58 PM" / "16:58" -> "HH:MM" (24h), or null when unparseable.
function parseTimeOfDay(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const meridiem = m[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Strip the echoed webhook_url (contains our token) before persisting/logging.
function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  delete copy.webhook_url;
  return copy;
}

function parseAlert(obj: Record<string, unknown>):
  | { symbols: string[]; prices: number[]; scannedAtIst: string | null }
  | { error: string } {
  if (typeof obj.stocks !== "string" || typeof obj.trigger_prices !== "string") {
    return { error: "missing string fields 'stocks' and/or 'trigger_prices'" };
  }
  const symbols = obj.stocks
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const prices: number[] = [];
  for (const raw of (obj.trigger_prices as string).split(",")) {
    const t = raw.trim();
    if (t === "") return { error: "empty trigger price entry" };
    const n = Number(t);
    if (!Number.isFinite(n)) return { error: `invalid trigger price '${t}'` };
    prices.push(n);
  }
  if (symbols.length !== prices.length) {
    return {
      error: `stocks/trigger_prices length mismatch: ${symbols.length} stocks vs ${prices.length} prices`,
    };
  }
  return { symbols, prices, scannedAtIst: parseTimeOfDay(obj.triggered_at) };
}

async function lookupSignalType(scanUrl: string): Promise<"buy" | "sell" | null> {
  const { rows } = await getPool().query(
    "SELECT signal_type FROM scan_mappings WHERE scan_url = $1 AND active = true",
    [scanUrl]
  );
  return (rows[0]?.signal_type as "buy" | "sell") ?? null;
}

async function upsertSignal(params: {
  symbol: string;
  signalType: "buy" | "sell";
  price: number;
  triggerDate: string;
  scanUrl: string;
  scanName: string | null;
  scannedAtIst: string | null;
  rawPayload: Record<string, unknown>;
}): Promise<void> {
  const { symbol, signalType, price, triggerDate, scanUrl, scanName, scannedAtIst, rawPayload } = params;
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: number; status: string }>(
      `SELECT id, status FROM signals
        WHERE symbol = $1 AND trigger_date = $2 AND scan_url = $3
        FOR UPDATE`,
      [symbol, triggerDate, scanUrl]
    );
    const row = existing.rows[0];

    if (row && OVERRIDE_STATUSES.has(row.status)) {
      // A human set suppressed/manual_override on this symbol+date+scan. Update
      // only the snapshot fields; status is left untouched.
      await client.query(
        `UPDATE signals
            SET price = $1, triggered_at_ist = $2, raw_payload = $3, updated_at = now()
          WHERE id = $4`,
        [price, scannedAtIst, rawPayload, row.id]
      );
      await client.query(
        `INSERT INTO signal_events (signal_id, event_type, symbol, trigger_date, scan_name, scan_url, detail, raw_payload)
         VALUES ($1, 'override_preserved', $2, $3, $4, $5, 'webhook trigger arrived for an overridden signal; status left untouched', $6)`,
        [row.id, symbol, triggerDate, scanName, scanUrl, rawPayload]
      );
      await client.query("COMMIT");
      return;
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO signals
         (symbol, name, signal_type, price, status, trigger_date, scan_url, scan_name,
          triggered_at_ist, raw_payload, generated_at, updated_at, days_in)
       VALUES ($1, $1, $2, $3, 'active', $4, $5, $6, $7, $8, now(), now(), 0)
       ON CONFLICT (symbol, trigger_date, scan_url) DO UPDATE SET
         signal_type      = EXCLUDED.signal_type,
         price            = EXCLUDED.price,
         scan_name        = EXCLUDED.scan_name,
         triggered_at_ist = EXCLUDED.triggered_at_ist,
         raw_payload      = EXCLUDED.raw_payload,
         updated_at       = now()
       RETURNING id`,
      [symbol, signalType, price, triggerDate, scanUrl, scanName, scannedAtIst, rawPayload]
    );
    await client.query(
      `INSERT INTO signal_events (signal_id, event_type, symbol, trigger_date, scan_name, scan_url, detail, raw_payload)
       VALUES ($1, 'trigger', $2, $3, $4, $5, 'chartlink webhook processed', $6)`,
      [inserted.rows[0].id, symbol, triggerDate, scanName, scanUrl, rawPayload]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[chartlink] db error for", symbol, scanUrl, triggerDate, err);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1) Token auth (query param) — the only auth Chartlink can do.
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN) {
    console.error("[chartlink] CHARTLINK_WEBHOOK_TOKEN is not set; rejecting all requests");
    return json({ error: "webhook not configured" }, 500);
  }
  if (token !== TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  // 2) Parse JSON. Only JSON is supported (confirmed shape).
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await req.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    console.warn("[chartlink] unparseable (non-JSON) body rejected");
    return json({ error: "unparseable payload" }, 400);
  }

  // Never log/persist the echoed webhook_url — it contains our token.
  const safe = sanitizePayload(body);
  console.log("[chartlink] payload:", JSON.stringify(safe).slice(0, 4000));

  const scanUrl = String(body.scan_url ?? "").trim();
  const scanName = String(body.scan_name ?? "").trim();
  const pool = getPool();

  if (!scanUrl) {
    console.warn("[chartlink] malformed: missing scan_url");
    await pool.query(
      `INSERT INTO signal_events (event_type, scan_name, detail, raw_payload)
       VALUES ('malformed', $1, 'missing scan_url; batch skipped', $2)`,
      [scanName || null, safe]
    );
    return json({ error: "missing scan_url" }, 400);
  }

  // 3) Scan direction lookup — never guess.
  const signalType = await lookupSignalType(scanUrl);
  if (!signalType) {
    console.warn(`[chartlink] unmapped scan_url='${scanUrl}' scan_name='${scanName}' skipped`);
    await pool.query(
      `INSERT INTO signal_events (event_type, symbol, scan_name, scan_url, detail, raw_payload)
       VALUES ('unmapped_scan', NULL, $1, $2, 'scan_url not present (or inactive) in scan_mappings; no signal written', $3)`,
      [scanName || null, scanUrl, safe]
    );
    return json({ ok: true, processed: 0, skipped: 1 }, 200);
  }

  // 4) Parse + pair stocks/trigger_prices. A mismatch = malformed batch: skip
  //    everything, never write a partial pairing.
  const parsed = parseAlert(body);
  if ("error" in parsed) {
    console.warn(`[chartlink] malformed batch (${scanUrl}): ${parsed.error}`);
    await pool.query(
      `INSERT INTO signal_events (event_type, scan_name, scan_url, detail, raw_payload)
       VALUES ('malformed', $1, $2, $3, $4)`,
      [scanName || null, scanUrl, `batch skipped: ${parsed.error}`, safe]
    );
    return json({ error: parsed.error }, 400);
  }

  // 5) One signals row per stock, all keyed on today's IST date.
  const triggerDate = istDateNow();
  let processed = 0;
  for (let i = 0; i < parsed.symbols.length; i += 1) {
    await upsertSignal({
      symbol: parsed.symbols[i].toUpperCase(),
      signalType,
      price: parsed.prices[i],
      triggerDate,
      scanUrl,
      scanName,
      scannedAtIst: parsed.scannedAtIst,
      rawPayload: safe,
    });
    processed += 1;
  }

  return json({ ok: true, processed, skipped: 0 }, 200);
}