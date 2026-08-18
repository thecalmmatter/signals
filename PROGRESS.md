# PROGRESS — Stage 4 follow-up (Chartlink parser tightened to real payload)

The Chartlink webhook (`app/api/webhooks/chartlink/route.ts`) was rebuilt against
the now-confirmed payload shape. See the Stage 5 section below for the admin panel.

## Confirmed payload shape
```json
{
  "stocks": "SYMBOL 1, SYMBOL 2, SYMBOL 3",   // comma-separated STRING
  "trigger_prices": "2500.00,600.00,3400.00", // comma-separated STRING
  "triggered_at": "4:58 pm",                  // time only, NO date
  "scan_name": "Manish Goel Scan",            // free text (informational)
  "scan_url": "manish-goel-scan",             // stable slug = scan identity
  "alert_name": "...",
  "webhook_url": "..."                        // echoes our URL incl. the token -> sanitized
}
```

## Parser logic now in place
- `stocks` and `trigger_prices` are comma-separated **strings** — split on `,`,
  trim, parse prices as floats, then pair by index. **One row per stock**, upserted
  against `(symbol, trigger_date, scan_url)`.
- Length mismatch → `400` + a `malformed` `signal_events` row; the whole batch is
  skipped (never a partial pairing).
- `trigger_date` is computed **server-side as today in IST** (`Asia/Kolkata`)
  via `Intl.DateTimeFormat` — never UTC/server-local. `triggered_at` (time only)
  is parsed to `HH:MM` and stored in `triggered_at_ist` for display only; it is
  **not** used to derive the date (a morning-IST alert would be the previous day
  in UTC).
- Scan identity = **`scan_url`** (stable slug), not `scan_name` (renamable).
- **Direction never guessed:** `scan_url` is looked up in `scan_mappings`; if found
  and `active`, its `signal_type` is used. Otherwise the alert is logged as an
  `unmapped_scan` event (including scan_url + scan_name) and skipped — an
  unrecognized scan can't be labeled buy or sell by mistake.
- The echoed `webhook_url` (contains our token) is **stripped from `raw_payload`
  and from logs** before persisting (`sanitizePayload`).
- Override guard unchanged: a `suppressed`/`manual_override` row is updated on
  price/snapshot only and logged as `override_preserved`; it is never flipped back
  to active.
- `CHARTLINK_BUY_SCAN_NAME` / `CHARTLINK_SELL_SCAN_NAME` env vars are **removed**
  (the old one-buy-one-sell-guess approach); direction now comes solely from
  `scan_mappings`.

## `scan_mappings` table (new)
```
scan_mappings: scan_url TEXT PK, scan_name TEXT (info), signal_type TEXT CHECK(buy,sell),
               active BOOLEAN DEFAULT true, updated_at
```
Seeded rows:
- `manish-goel-scan` ("Manish Goel Scan") — **inactive**, `signal_type='buy'`
  placeholder. Direction is **UNCONFIRMED** (owner decides after an actual signal);
  being inactive, real alerts for it are skipped as `unmapped_scan` until flipped.

## Schema changes (Neon, via `scripts/migration_chartlink_v2.sql`; mirrored in `schema.sql`)
- `signals` added: `scan_url TEXT`, `triggered_at_ist TEXT`. Upsert key changed to
  `(symbol, trigger_date, scan_url)` (new index; the old `(…, scan_name)` index
  dropped).
- `signal_events` added: `scan_url TEXT`; `event_type` extended with `unmapped_scan`.
- New `scan_mappings` table + seed (see above).

## Verified
- Real payload → `200 processed:3`, three `signals` rows correctly paired to prices,
  `buy` from the mapping, `trigger_date` in IST, `triggered_at_ist='16:58'`, sanitized
  `raw_payload` (no `webhook_url`).
- Mismatched lengths → `400`, no rows. Unknown `scan_url` → `200 skipped:1`,
  `unmapped_scan` event, no `signals` row. Override → `manual_override` preserved +
  `override_preserved` event. All test rows/events cleaned; temp mapping removed;
  inactive `manish-goel-scan` seed retained.

## scan_mappings admin control (built, Stage 5.5)
- The follow-up is now **built**: `/dashboard/admin` includes an **AdminScanMappings**
  panel (`components/admin-scan-mappings.tsx`) to manage scans from the UI.
- Admin-only API: `GET`+`POST /api/scan-mappings`, `PATCH`+`DELETE
  /api/scan-mappings/[scanUrl]` (all explicit `getAdminUserId` → 403; not proxy-gated).
- UI: list all scans, set direction buy/sell, activate/inactivate, delete, and add a
  new scan (scan_url slug + display name + direction). Inactive/missing scans continue
  to be skipped as `unmapped_scan`.
- **`manish-goel-scan` was confirmed as `buy` and activated** (owner decision after the
  first real alert). A real test alert (5:32 pm) wrote 3 rows before the owner deleted
  them via the panel — confirming the live path works end-to-end.

## Important operational note (worth remembering)
- **Unmapped scans are silently skipped.** If a new scan is registered in Chartlink
  and nothing shows up on the dashboard, check `signal_events` for `unmapped_scan`
  before assuming the webhook is down. Add the scan to `scan_mappings` (active +
  correct `signal_type`) via the admin panel to start ingesting it.

---

# PROGRESS — Stage 5 (manual signal controls / admin panel)

Stage 1: static ticker UI. Stage 2: Postgres data layer + Python ingestion + API.
Stage 3: Clerk auth, `/dashboard`, user sync into Neon. Stage 4: Chartlink webhook
(live feed). Stage 5 adds the decision layer: a single-person admin panel to
suppress a webhook-triggered signal, edit its levels, or add a signal by hand
that Chartlink never fired on.

## Admin surface
- **Page:** `/dashboard/admin` (server component) — admin-only; non-admin → `redirect('/dashboard')`,
  anonymous → 307 to `/login` (already Clerk-gated because `proxy.ts` protects anything under `/dashboard`).
- Table of the 200 most recent signals across **all** statuses (including suppressed,
  greyed out) with inline controls: Save (edit entry/target/stop/notes), Suppress,
  Reactivate, Delete; plus an "Add signal manually" form (symbol, type, entry, target, stop).
- Client table: `components/admin-signals.tsx` (`"use client"`), calls PATCH/DELETE/POST.
  There is intentionally **no roles/permissions system** — just the admin allowlist below.

## Access control (admin-only API)
- `lib/admin.ts` → `getAdminUserId()`: returns the signed-in Clerk id **only** if it is on
  the `ADMIN_USER_IDS` allowlist, else `null`. Called at the top of the admin page and every
  admin API route (null in a page → redirect; null in an API → 403).
- `ADMIN_USER_IDS` env var — my single Clerk user id, comma separated for a future second person.
  Set in `.env.local` (gitignored) and documented in `.env.example`.
- Defense in depth: `proxy.ts` (unchanged) already blocks anonymous traffic to `/api/signals*`
  and `/dashboard`, so only a signed-in non-admin can even reach the route to get the 403.

## API routes (all admin-only)
- `PATCH /api/signals/[id]` (`app/api/signals/[id]/route.ts`): update `status`, `entryPrice`,
  `targetPrice`, `stopPrice`, `notes` (any subset). Sets `updated_by` + `updated_at`, writes one
  `signal_events` row describing the change.
- `DELETE /api/signals/[id]`: traces a `manual_edited` "signal deleted by admin" event, then deletes.
- `POST /api/signals` (added to existing `app/api/signals/route.ts`): manual create,
  `source='manual'`, `status='active'`, writes a `manual_created` event.
- `GET /api/signals` (public ticker source) is **unchanged** — still `WHERE status='active'` and
  still returns only public columns. Suppressing a signal thus removes it from the live feed
  without deleting the row or losing history. `notes` / `source` / `updated_by` are never exposed here.

## Signal events (manual actions)
- Reused the existing `signal_events` table; extended `event_type` with
  `manual_suppressed`, `manual_reactivated`, `manual_created`, `manual_edited`.
- Manual events set `raw_payload = NULL` (no webhook payload behind them) and use `detail`.

## Schema changes (Neon, via `scripts/migration_admin.sql`; mirrored in `scripts/schema.sql`)
- `signals` added: `source text NOT NULL DEFAULT 'webhook' CHECK (source IN ('webhook','manual'))`,
  `updated_by text NULL`, `notes text NULL`. Existing rows defaulted to `source='webhook'`.
- `signal_events` `event_type` CHECK extended with the four `manual_*` values.

## Confirmed: webhook still respects overrides
- The Chartlink webhook (`app/api/webhooks/chartlink/route.ts`) was **not modified** this stage.
  Its override guard is intact: on `(symbol, trigger_date, scan_name)` collision, if the existing
  row has status `suppressed` or `manual_override`, it updates only `price`/`change_pct`/`raw_payload`
  and writes an `override_preserved` event — it never flips those back to `active`. So a decision
  made here in the admin panel is not undone by the next Chartlink re-alert.

## Verified this session
- `npm run lint` clean; `npm run build` clean: routes now include `ƒ /api/signals/[id]` and `ƒ /dashboard/admin`.
- Anonymous → 307 at the network boundary on `GET`/`PATCH`/`POST`/`DELETE /api/signals*` and `/dashboard/admin`.
- DB-level (mirroring the handler SQL): manual create sets `source='manual'`+`updated_by`; the feed
  query (`WHERE status='active'`) drops a row the moment it's suppressed and returns it on reactivate;
  admin table query shows all statuses incl. `source`/`notes`/`updated_by`; event trail produced
  `manual_created` → `manual_suppressed` → `manual_reactivated` → `manual_edited`, all `raw_payload=NULL`.
  Test rows cleaned up.
- **Not yet exercised:** the signed-in admin 200/403 paths (needs an authenticated session). Open
  `/dashboard/admin` while logged in as the admin to confirm the table + controls.

## Env additions (`.env.local` gitignored; mirrored in `.env.example`)
```
ADMIN_USER_IDS=user_3HRj614TjS2H4I2Ln9v2Zs7maSY   # single admin now
```

## Notes for next session
- Edit `ADMIN_USER_IDS` if the Clerk user id changes (e.g. re-created test instance).
- Edits to an **active** webhook row can still be overwritten by the next Chartlink re-trigger
  (that path refreshes levels). To lock a row against the webhook, press Suppress first — the
  override guard then protects it.
- Next: billing to flip `users.subscription_status`, and/or expiring older recurring webhook rows.