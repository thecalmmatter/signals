# signals_app

A Next.js signals dashboard that ingests Chartlink screener alerts via a webhook,
shows them on a live customer feed, and gives the owner an admin panel to approve,
edit, or suppress signals. Uses Clerk for auth and a Neon (Postgres) database.

**Positioning (2026-09-17):** not framed as "just another signal app" — the
public-facing copy (landing page, dashboard, track record, waitlist) now
leads with a "build the portfolio, not just the trade" / snowball-compounding
narrative, and coverage language was widened from "NSE large-caps" to
"large, mid and small cap, NSE and BSE" everywhere it appeared. This is a
**messaging-only** change — nothing about how signals are ingested, which
exchange/segment Chartlink or Fyers actually cover, or the underlying data
pipeline was touched. **Caveat:** whether BSE symbols and mid/small-cap
names actually flow end-to-end today (Chartlink scan → webhook → Fyers
quote/candle lookup) hasn't been verified — if they don't, this copy is
ahead of the product. Verify before repeating this coverage claim anywhere
external (ads, Product Hunt, etc.).

**Regulatory disclaimer (2026-09-17, critical):** `lib/disclaimer.ts` is the
single source of truth for the "educational purposes only, not a buy/sell
recommendation, not SEBI-registered" disclaimer, shown on every page that
displays a live entry/target/stop call: `/dashboard`
(`components/disclaimer-banner.tsx`), `/dashboard/track-record` (same
banner), the signal detail modal (`components/signal-detail-modal.tsx`,
generic wording — not tenant-aware yet, see its inline comment), the stock
analytics pane (`components/stock-analytics-pane.tsx`), the main landing
page, `/waitlist`, `/launch`, and the Telegram lead bot's auto-reply. A
tenant with `sebi_reg_name`/`sebi_reg_number` set gets different wording
(asserting *their* registration) — only set those columns for a tenant
whose registration you've actually confirmed yourself; the code doesn't
verify it. **This is not legal advice** — the wording is a reasonable-effort
plain-English disclaimer, not something checked against SEBI's actual
Research Analyst/Investment Adviser regulations by a lawyer. Get it
reviewed by a securities lawyer before relying on it, especially before
`BILLING_ENABLED` goes on or a second (paid) tenant onboards.

**Substack cross-promotion (2026-09-17):** `lib/links.ts` holds
`SUBSTACK_URL` (https://smartalphas.substack.com/), linked as "Newsletter"
from the main landing page (nav + footer), `/dashboard` (header link +
inline mention under the intro), `/dashboard/track-record` (header), and
`/waitlist` and `/launch` (footers) — all outbound `target="_blank"` links,
no subscriber-status checks or content sync. Scope was deliberately
cross-promotion only: gating app access by Substack paid-subscription
status, or auto-publishing app content to Substack, were both explicitly
out of scope when this was built (Substack's official Developer API,
shipped early 2026, only returns public profile info via a creator's
LinkedIn handle — it doesn't expose paid/free subscriber status, so gating
app access by Substack subscription would need an undocumented/unofficial
workaround, not a supported integration, if it's wanted later).

**Trailing stop loss (2026-09-22):** per-trade opt-in, live signals only
(`signals` table — the automatic engine behind `loadLiveSignals()`/the
track-record "tradebook"; not mirrored on the manually-operated `positions`
ledger, which as of this writing has never had a row closed by an admin).
Backed by a one-time backtest (`trailing-sl-backtest.md`, 10 real closed
trades) that found trailing SL clearly helps trades that move favorably
before reversing and does nothing for trades that fall straight from entry —
hence a per-trade admin toggle + %, not a blanket default or one hardcoded
width. Schema: `scripts/migration_trailing_stop.sql` adds
`trailing_sl_enabled`, `trailing_sl_pct`, `trailing_peak_price` to `signals`.
Logic: `trailingStopLevel()` in `lib/live-signals.ts` — trails a fixed %
below the peak price since entry (buy) / above the trough (sell), replacing
`stop_price` as the level `computeOutcome()` checks while enabled; the peak
only ever ratchets favorably and is persisted each poll
(`trailing_peak_price`). Admin UI: a checkbox + % input per row in
`components/admin-signals.tsx` (Trail SL column) — editing it, or any other
field, resets the peak back to the current entry price, same "an edit
invalidates prior derived state" rule already applied to
`outcome_locked`/`target_N_hit_at`. Shown on `/dashboard/track-record`'s Stop
column (with a trailing-level tooltip while open) and as three extra columns
on the tradebook CSV download.

## Stack

- **Framework:** Next.js 16 (Turbopack) + React 19 + Tailwind CSS v4
- **Auth:** Clerk (v7) — embedded sign in/up, middleware in `proxy.ts`
- **Database:** Neon Postgres (`pg`)
- **Ingestion:** POST webhook from Chartlink (`/api/webhooks/chartlink`)

## Prerequisites

- Node.js 22+ (`nvm use 22`)
- A Neon Postgres project (free tier is fine) — grab the connection string
- A Clerk application (https://dashboard.clerk.com) — for auth keys + webhook
- A Chartlink account if you want live alerts

## 1. Install

```bash
npm install
```

## 2. Environment

Copy the template and fill in every value:

```bash
cp .env.example .env.local
```

`.env.local` is gitignored and must never be committed. Reference entries are
documented in the file; the key ones:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Your Neon Postgres connection string — **use the pooled one** (hostname has `-pooler` in it). Direct connections exhaust Neon's connection limit fast on serverless hosting. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk **API keys** |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook signing secret (`whsec_…`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-in` -> `/login`, `/signup` (already in the example) |
| `CHARTLINK_WEBHOOK_TOKEN` | Secret token for `/api/webhooks/chartlink?token=…` — generate with `openssl rand -hex 24` |
| `ADMIN_USER_IDS` | Your Clerk user id(s), comma-separated (grants `/dashboard/admin` + admin APIs) |

## 3. Database

Fresh setup: apply the canonical schema, then the migrations (idempotent):

```bash
psql "$DATABASE_URL" -f scripts/schema.sql
psql "$DATABASE_URL" -f scripts/schema_users.sql
psql "$DATABASE_URL" -f scripts/migration_chartlink.sql
psql "$DATABASE_URL" -f scripts/migration_chartlink_v2.sql
psql "$DATABASE_URL" -f scripts/migration_admin.sql
psql "$DATABASE_URL" -f scripts/migration_billing.sql
psql "$DATABASE_URL" -f scripts/migration_waitlist.sql
psql "$DATABASE_URL" -f scripts/migration_waitlist_invite.sql
psql "$DATABASE_URL" -f scripts/migration_positions.sql
psql "$DATABASE_URL" -f scripts/migration_positions_signal_link.sql
psql "$DATABASE_URL" -f scripts/migration_multi_target.sql
psql "$DATABASE_URL" -f scripts/migration_signal_outcome_lock.sql
psql "$DATABASE_URL" -f scripts/migration_waitlist_block.sql
psql "$DATABASE_URL" -f scripts/migration_telegram_leads.sql
psql "$DATABASE_URL" -f scripts/migration_telegram_digest.sql
psql "$DATABASE_URL" -f scripts/migration_telegram_snapshot_digest.sql
psql "$DATABASE_URL" -f scripts/migration_stock_analytics_cache.sql
psql "$DATABASE_URL" -f scripts/migration_backfill_outcome_exit_price.sql
psql "$DATABASE_URL" -f scripts/migration_fix_partial_target_lock.sql
psql "$DATABASE_URL" -f scripts/migration_target_hit_lock.sql
psql "$DATABASE_URL" -f scripts/migration_backfill_target_hit_dates.sql
psql "$DATABASE_URL" -f scripts/migration_backfill_intraday_stop_touches.sql
psql "$DATABASE_URL" -f scripts/migration_unlock_hblengine_false_stop.sql
psql "$DATABASE_URL" -f scripts/migration_tenants.sql
```

(`schema.sql` is the canonical fresh shape; the `migration_*` files are the live
evolution applied so far.)

## 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000. Sign up/in with Clerk.

### The admin panel

Find your Clerk user id (Clerk dashboard → Users → your user → `User ID`), put it
in `ADMIN_USER_IDS`, then visit:

```
http://localhost:3000/dashboard/admin
```

Here you can hand-add signals, edit/suppress/delete them, and manage **scan
mappings** (see below).

## 5. Chartlink webhook

Point a Chartlink alert at the public route with the token:

```
POST https://<your-public-host>/api/webhooks/chartlink?token=<CHARTLINK_WEBHOOK_TOKEN>
```

Content-Type: `application/json`, body keys the parser expects:

```json
{
  "stocks": "SYMBOL 1, SYMBOL 2",
  "trigger_prices": "2500.00, 600.00",
  "triggered_at": "4:58 pm",
  "scan_name": "Manish Goel Scan",
  "scan_url": "your-scan-slug"
}
```

- `scan_url` is the scan's **identity** and must match a row in admin → **scan
  mappings** (exact, case-sensitive). A scan not in the table is skipped and
  logged as `unmapped_scan` — it is never auto-typed.
- `trigger_date` is computed in IST (`Asia/Kolkata`), so morning-IST alerts land
  on the correct day.
- The `webhook_url` field Chartlink echoes (it contains your token) is stripped
  before being stored/logged.

The admin **Incoming webhook activity** feed (admin-only) shows every alert as
`Mapped · signal written` or `Unmapped · skipped` and refreshes every 10s. Each
unmapped symbol has **Add** (prefills it into the manual-add form below, entry
price included when Chartlink sent one) and **Drop** (dismisses it from the
feed) buttons, so triaging the unmapped backlog doesn't mean retyping symbols
by hand.

If `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` are set (see `.env.example`), an
unmapped scan also pings Telegram — useful since the feed above only updates
while you have the dashboard open.

## 6. Billing (dry-run trial + Razorpay subscription)

Every signed-in user gets full access until their dry-run cutoff passes,
then needs an active Razorpay subscription (`lib/access.ts`). Admins
(`ADMIN_USER_IDS`) always pass, so the owner can't lock themselves out.

- Cutoff resolution: `users.trial_ends_at` (per-user, admin-set) →
  `app_settings.default_trial_ends_at` (global) → unlimited if neither is set.
  Manage both from `/dashboard/admin` → **Trial & billing**.
- Subscribing: `SubscribeButton` → `POST /api/billing/subscribe` creates/reuses
  a Razorpay subscription → Razorpay Checkout → `POST /api/billing/confirm`
  fast-path-activates on success. `POST /api/webhooks/razorpay` (public,
  signature-verified) is the authoritative source of truth for
  `users.subscription_status`.
- Requires a Plan created in the Razorpay dashboard first (Subscriptions →
  Plans) — its `plan_xxxxx` id goes in `RAZORPAY_PLAN_ID`. See `.env.example`
  for the full var list and where to find each one.
- **Kill switch:** set `BILLING_ENABLED=false` to give every signed-in user
  full free access unconditionally (e.g. a free public dry-run before RIA
  registration), without touching trial dates or the Razorpay flow. Default
  (unset, or `true`) runs the trial/subscription logic above as normal. The
  dashboard badge shows "Free (beta)" and `/dashboard/admin` shows a banner
  while it's off.

## 7. Waitlist (`/waitlist`)

A standalone, single-CTA landing page for posting to external communities
(Reddit, Telegram, Discord, etc.) — no nav, no pricing, just "Get tomorrow's
signal" and an email field. Not linked from the main site; share it directly.

- Use a different link per community so signups are attributable:
  `https://<your-domain>/waitlist?src=reddit-algotrading`,
  `?src=telegram-swing-traders`, etc. `src` is stored with the signup.
- `POST /api/waitlist` (public) writes to `waitlist_signups`, deduped by
  email. Has a basic honeypot field for bot submissions — no other rate
  limiting yet.
- No email is sent automatically. `/dashboard/admin` → **Waitlist** shows the
  total, a breakdown by source, and the most recent 100 signups for manual
  follow-up.
- **Joining the waitlist does not grant access.** By default Clerk's Access
  mode is **Open**, so anyone can `/signup` directly regardless of the
  waitlist. To actually gate access:
  1. In the [Clerk Dashboard](https://dashboard.clerk.com) → your app →
     **Access mode**, switch from **Open** to **Invite-only** and save. This
     is free on Clerk's Hobby plan. Now `/signup` shows "you need an
     invitation" to anyone without one.
  2. In `/dashboard/admin` → **Waitlist**, click **Invite** next to a signup
     to send them a real Clerk invitation email (`POST
     /api/admin/waitlist/invite`, admin-only). The row flips to "invited"
     once sent; click **Re-invite** to resend (e.g. an expired invite).
  3. Existing signed-in users are unaffected either way — Invite-only mode
     only blocks new sign-ups, not existing sessions.

## 8. Positions ledger (track record)

An admin-only record of the swing positions actually posted publicly —
separate from `signals` (which only drives the live ticker). This is the
source of truth for a future win-rate / statistical-edge report.

- **Auto-populated from `signals`** — no manual re-entry. The moment a
  signal has entry/target/stop all set (adding one by hand in
  **Add signal manually**, or filling those in on a webhook-triggered signal
  that arrived without prices), a matching ledger row is created or updated
  automatically. `positions.signal_id` uniquely links the two, so re-saving
  a signal's prices updates its existing ledger row instead of duplicating
  it. The ledger table shows an **auto** / **manual** badge per row.
- `/dashboard/admin` → **Positions ledger**: mark a row "Hit target," "Hit
  stop," or "Close" (manual exit) as it plays out — that part is still a
  manual call, since nothing currently tracks fills automatically. Shows a
  running win-rate stat over closed positions. The **Log a position by
  hand** form is now a fallback, for a call you made outside the signals
  table entirely.
- `GET/POST /api/admin/positions`, `PATCH/DELETE /api/admin/positions/[id]`
  — all admin-only, nested under `/api/admin` (already covered by
  `proxy.ts`'s protected-route list, no separate wiring needed).
  `upsertPositionFromSignal` (`lib/positions-admin.ts`) is called from
  `POST /api/signals` and `PATCH /api/signals/[id]` — it never blocks the
  signal write if it fails (e.g. migration not applied yet).
- **Return % locks permanently to the furthest target hit, once any target
  is hit — even if the trade later stops out** (2026-09-11, refined same
  day). Originally a narrower fix (HBLENGINE, TEJASNET, SBICARD all hit T1
  while T2/T3 were still open, and the displayed return kept drifting with
  the live price — even going negative on a retrace — instead of reflecting
  that T1 had genuinely been reached), then widened per explicit product
  call: TEJASNET later hit T1, retraced, and stopped out, and the honest
  closed-trade loss (correct at the time) was still judged to be hiding a
  real result — a target that's genuinely reached should win over whatever
  the trade does afterward, full stop, not just while still open.
  `lib/live-signals.ts`'s `furthestHitTarget()`/`referencePrice()`/
  `returnPct()` (shared by the track record page and the tradebook CSV
  export below) and `lib/positions-admin.ts`'s own `furthestHitTarget()`/
  `returnPct()` now check the sticky `target1Hit`/`target2Hit`/`target3Hit`
  flags *first*, ahead of the closed/exit-price check: once any target's
  been reached, the return is computed against the furthest one hit,
  period — shown with a 🔒 and a tooltip — regardless of whether the trade
  is still open, later hit a further target, or later stopped out. Only
  falls back to the stop's exit price when a trade closes via stop *without*
  ever having reached a target. Applies automatically to every signal, past
  and future — no backfill needed, since it's computed live off columns that
  already existed.
- **"Download tradebook" CSV export** (2026-09-13) —
  `GET /api/track-record/download`, auth-gated the same as the track record
  page (any signed-in customer, tenant-scoped via `resolveCustomerTenant`).
  Flattens the exact same signals + return calc shown on screen (symbol,
  direction, outcome, entry/T1/T2/T3/stop with per-target hit flags,
  reference price + basis, return %, days) into a `text/csv` attachment.
  Linked from a "Download tradebook ⤓" link in the track record page header.
  No new table or stored export — generated fresh from `loadLiveSignals()`
  on every request.

## 9. Broker order placement (Fyers)

`/dashboard/admin/broker` — admin-only. Places real orders on the **same
Fyers account** already configured via `FYERS_APP_ID` / `FYERS_ACCESS_TOKEN`
(see §2/§4.5) and shows that account's running positions live. This is not a
per-user brokerage feature — there's one shared broker connection (yours),
and only `ADMIN_USER_IDS` can reach the page or its API routes.

- **Place order**: symbol, qty, Buy/Sell, Market/Limit, CNC (delivery) or
  Intraday. Fires one plain order — no auto stop-loss/target attached, you
  manage exits yourself (in Fyers or by hand). A confirm dialog shows the
  full order summary before it's sent, since this moves real money.
- **Running positions**: pulled live from Fyers' `/positions` endpoint —
  symbol, side, qty, avg price, LTP, and P&L. Polls every 15s. Separate from
  the `positions` ledger in §8 (that's a hand-logged public track record,
  not tied to actual broker quantities).
- `lib/fyers-orders.ts` — the REST client (`placeOrder`, `getPositions`,
  `getFunds`), same auth pattern as `lib/fyers.ts`.
- `GET/POST /api/admin/broker/{positions,orders}` — admin-only. Since
  `FYERS_ACCESS_TOKEN` expires daily (refresh via
  `scripts/fyers-get-token.mjs`, see §2), a stale token surfaces here as an
  inline "couldn't reach Fyers" banner rather than a hard failure.

## 10. Telegram Ads lead capture

A second, dedicated Telegram bot (`TELEGRAM_LEADS_BOT_TOKEN` — separate from
the alert bot in §2) that receives updates and logs a lead every time
someone taps the deep link on a Telegram Ads campaign and hits Start.

- **Setup:** message @BotFather → `/newbot`. Set an avatar (`/setuserpic`)
  and description (`/setdescription`, `/setabouttext`) — Telegram Ads
  rejects a destination bot with no avatar/bio, or one that hasn't been
  active in the last 2 weeks. Send it a `/start` yourself once.
- Run `scripts/migration_telegram_leads.sql`, set `TELEGRAM_LEADS_BOT_TOKEN`
  / `TELEGRAM_LEADS_WEBHOOK_SECRET` / `SITE_URL` (see `.env.example`), then
  register the webhook once (command is also in `.env.example`):
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/webhooks/telegram-leads&secret_token=<SECRET>"
  ```
- **Ad deep link:** `https://t.me/<YourBotUsername>?start=<tag>` — `<tag>`
  (e.g. `ph_ad`) is whatever you want to identify this placement by; it's
  stored as `start_param` on the lead so you can tell which ad drove it.
- `lib/telegram-leads.ts` — send helper (`sendLeadsBotMessage`) + admin read
  helper (`loadTelegramLeads`).
- `POST /api/webhooks/telegram-leads` — public, authenticated by the
  `X-Telegram-Bot-Api-Secret-Token` header Telegram echoes back (not by
  session/admin auth). Logs `/start` (with its payload) to `telegram_leads`,
  upserting on `telegram_user_id` so a re-start updates username/name but
  keeps the original attribution. Replies with a short welcome + signup link
  built from `SITE_URL`, plus (if §11's results channel is configured) a
  second, lighter-weight link straight to the channel — someone arriving
  via a Telegram Ad is already mid-Telegram, not mid-browser, so "see the
  public track record" is a lower-friction first ask than "go sign up on a
  website." Without this line there was no path from the bot to the channel
  at all.
- Leads show up read-only on `/dashboard/admin/users` under "Telegram ad
  leads" — username (links to `t.me/<username>`), name, start param, joined
  date.
- Telegram Ads itself: self-serve platform at ads.telegram.org requires a
  minimum €2,000 account top-up; smaller budgets are only available through
  a certified Telegram ad agency partner. Ad destination URLs must be
  Telegram links (a bot or channel) — no external URLs allowed.

## 11. Public results channel (Telegram)

A public Telegram channel that auto-posts a signal's outcome (symbol,
entry → exit, return %, days in) the instant it's stopped out or hits a
target — sourced from the same sticky `outcome_locked` state as the app's
own DIR badges (§ multi-target / live-signals), so the channel and the app
can never disagree on what actually happened.

Deliberately **results-only**, not a live mirror of the actionable feed —
see the positioning discussion this was built from: giving away the live,
actionable signal for free undercuts the paid tier being built toward,
whereas posting closed outcomes (wins and losses both, nothing curated) is
pure proof of the "we don't hide losses" claim already on the landing page,
with zero cannibalization risk. If daily reach grows, a second, deliberately
capped surface (e.g. one free live signal a day) is the natural next step —
not built yet, everything beyond that stays app-exclusive by design.

- **Setup:** add @SignalsLeadsBot (or whichever bot `TELEGRAM_LEADS_BOT_TOKEN`
  belongs to — same bot as §10, reused rather than standing up a third bot)
  as an admin of your channel, with permission to post messages.
- Set `TELEGRAM_RESULTS_CHANNEL_ID` — `@yourchannelusername` for a public
  channel, or the numeric `-100...` chat id for a private one (find it via
  `getUpdates` after posting once in the channel with the bot already
  admin). Leave blank to disable; nothing else breaks.
- `lib/telegram-results.ts` — `announceOutcome()`, called from
  `lib/live-signals.ts` the exact moment (and only the exact moment — see
  the `RETURNING id` race-guard in that file) a signal's outcome gets
  locked. Best-effort: a Telegram failure here never affects the ticker
  response users actually see.
- Posts use `parse_mode: "HTML"` with a 🟢/🔴 dot per outcome — the colored
  win/loss mix at a glance is the point of posting both unfiltered.
- **Getting people to actually see the channel:** Telegram has no
  "auto-subscribe" — a bot can't add a user to a channel, only give them a
  join link to tap themselves. `getResultsChannelUrl()` in
  `lib/telegram-results.ts` derives that link (`t.me/<handle>` for a public
  channel, or `TELEGRAM_RESULTS_CHANNEL_URL` if you set one for a private
  channel) and is currently used in one place: the §10 leads bot's welcome
  message. Anywhere else a human should see this link (site footer,
  dashboard) is not wired up yet.

### 11a. Periodic results digest

On top of the instant per-close post above, a scheduled digest rolls up
everything closed **since the last digest** into one "symbols + overall
return" post — for people who just want a periodic pulse check rather than
a notification per close.

- Run `scripts/migration_telegram_digest.sql` — adds `signals.outcome_exit_price`
  (the price frozen at the moment a signal locked, so a digest's return %
  doesn't keep drifting with the live quote after the trade is actually
  over) and a single-row `telegram_digest_state` table (`last_posted_at`).
- **Bug fixed + backfilled (2026-09-03):** rows locked *before* this column
  existed (or that otherwise ended up with it NULL) were falling back to
  *today's live price* as the exit price everywhere it's read (track record
  page, stock analytics pane, this digest) — so a "closed" trade's return
  kept silently drifting with the market instead of staying frozen. Verified
  against real Fyers OHLC: MCX crossed its ₹3,328 target on 2026-08-26 (a
  genuine ~+10.4% move) but was displaying +5.7%, using that day's live
  price instead. Fixed in `lib/live-signals.ts` (fallback is now the
  target/stop price that actually closed the trade, not a live quote) and
  backfilled existing rows with `scripts/migration_backfill_outcome_exit_price.sql`.
- Triggered by the `crons` entry in `vercel.json` hitting
  `/api/cron/telegram-digest` — **once a day on Vercel's Hobby plan**
  (Hobby caps cron frequency at daily; Pro allows finer schedules by editing
  that cron expression). Default fire time is `30 10 * * *` UTC (16:00 IST,
  just after NSE close) — edit `vercel.json` and redeploy to change it.
- `DIGEST_INTERVAL_HOURS` (env var, default `24`) controls the *actual*
  posting cadence on top of that daily trigger — e.g. `48` to post every
  other day — and takes effect on the next cron tick with **no redeploy**.
  Can't go more frequent than the underlying cron schedule.
- Set `CRON_SECRET` (any random value, `openssl rand -hex 24`) — Vercel
  automatically sends it back as `Authorization: Bearer <value>` on requests
  it generates for the cron job, which the route checks. Also works as a
  manual `?token=<value>` query param to trigger a check by hand.
- If nothing has closed since the last digest, it silently skips (no empty
  "nothing happened" post) and leaves `last_posted_at` untouched, so the
  next check still looks back to the same point.
- `lib/telegram-digest.ts` — `postDigestIfDue()`. Same bot/channel/HTML
  formatting as the instant post (`sendResultsChannelMessage()`, shared from
  `lib/telegram-results.ts`), so the channel reads consistently.

### 11b. Live signals snapshot table

A second, independent periodic post — a compact `symbol / return / days`
table of **every currently-active signal** (open, stopped, and target-hit
alike), not just what closed recently. Same numbers as
`/dashboard/track-record`, condensed to three columns.

- Run `scripts/migration_telegram_snapshot_digest.sql` — repoints
  `telegram_digest_state` from a single fixed row to one row per post
  `kind` (`closed_summary`, `snapshot`), so this and §11a's digest track
  their own schedules independently.
- `SNAPSHOT_INTERVAL_HOURS` (env var, default `24`) — same no-redeploy
  behavior as `DIGEST_INTERVAL_HOURS`.
- Posts unconditionally once the interval elapses (no "nothing to report"
  skip — open positions always exist to show), using a monospace `<pre>`
  block since Telegram has no real table, with a 🟢/🔴/⚪ dot per row for
  gain/loss/no-entry-price. Column widths are computed per-post from the
  actual symbol lengths.
- `lib/telegram-digest.ts` — `postSnapshotIfDue()`. Reuses
  `loadLiveSignals()`, the same source the ticker and track-record page
  read from — the numbers here can never disagree with the app. Side
  effect: since `loadLiveSignals()` always runs its outcome-lock check,
  this cron hit can itself catch a newly-crossed target/stop even if nobody
  had the dashboard open at that moment.
- Both §11a and §11b are checked on the same daily cron trigger in
  `vercel.json` — see `app/api/cron/telegram-digest/route.ts`.

## 12. Per-stock analytics pane

`/dashboard/stocks/[symbol]` — a dedicated page per symbol (not the
tap-to-open chart/RSI modal, which stays a quick glance) combining this
app's own live signal state with third-party research: analyst consensus,
shareholding, corporate actions, and recent news.

- **Discoverability**: the track-record page (`/dashboard/track-record`) is
  the *only* entry point, by design — every symbol in that table is a
  near-invisible link (`components/symbol-link.tsx`): no button chrome, just
  the symbol text with a subtle hover underline. Clicking it (plain left
  click — modifier/middle clicks still open in a new tab normally) animates
  into `/dashboard/stocks/[symbol]` via the native View Transitions API: the
  table cell and the destination page's `<h1>` share a per-symbol
  `view-transition-name`, so supporting browsers morph the symbol text
  directly into the page title instead of a hard cut. Browsers without
  support (Safari/Firefox at time of writing) just get an instant
  navigation — pure progressive enhancement, nothing depends on it running.
  An earlier version of this added a separate `/dashboard/stocks` index page
  and extra nav links; removed in favor of this single, quieter path.

- **Data sources, deliberately split two ways**: trade levels/outcome come
  from `loadLiveSignals()` (§ live-signals — same source as the ticker, so
  this page can never disagree with it). Everything else — analyst
  buy/hold/sell, shareholding %, corporate actions, recent news — comes from
  a separate REST API, **not** from any MCP connector: MCP tools (Tijori
  Finance was explored first) are only callable by an AI agent in a chat
  session, not by this app's own backend at runtime. `stock.indianapi.in`
  is a real API this app can call directly with its own key.
- Set `INDIAN_STOCK_API_KEY` (get one at indianapi.in) — see `.env.example`
  for the exact curl to test it. Leave blank to disable; the page still
  works, those tiles just show "not configured."
- `lib/indian-stock-api.ts` — `getStockDetails(symbol)`, a single
  `GET /stock?name=X` call that returns financials, analyst view,
  shareholding, corporate actions, and news together. Cached 30 minutes
  (this is a per-page-view lookup a human triggers by clicking through, not
  a polled endpoint like the ticker). **Gotcha, confirmed the hard way**: the
  docs site lives at `analyst.indianapi.in` and shows the query param as
  `symbol`, but the real API host is `stock.indianapi.in` and the param is
  actually `name` — `symbol` 422s. Plain NSE tickers work fine as the `name`
  value (fuzzy-matched). Field shapes (`recosBar.stockAnalyst[]`,
  `shareholding[].categories[]`, `stockCorporateActionData.{bonus,dividend,
  rights,splits,annualGeneralMeeting}`, numeric-looking fields returned as
  strings) are taken from a real authenticated response and typed exactly in
  `lib/indian-stock-api.ts` — no more defensive guessing in
  `components/stock-analytics-pane.tsx`.
- **Conviction score** (0-100, shown big on the page): a first-pass
  heuristic — 40% the live signal's technical state, 35% analyst
  buy/hold/sell mix, 25% promoter shareholding level. Openly approximate,
  not investment advice; refine the weights/inputs once real field shapes
  are confirmed and there's a view on what actually predicts outcomes.
- Visual language reuses `LandingParticleCanvas` and the `glass-panel` CSS
  utility from the landing page (§ Landing page) rather than inventing a
  new one — floating, translucent-but-legible tiles over an ambient
  particle field. Prototype this was built from:
  `prototypes/analytics-pane-prototype.html` (static demo, not wired to
  real data).
- **Conviction score is shared, not pane-only** — `lib/conviction-score.ts`
  holds `convictionScore()`/`recoCounts()`/`latestShareholdingPct()` (moved
  out of `stock-analytics-pane.tsx`, which now just imports them) so the
  track-record page (`/dashboard/track-record`) can render the same score
  per row in a `Score` column, batch-read via
  `getCachedStockDetailsBatch(symbols)` — one query for every visible
  symbol, read-only, never triggers a live fetch. A symbol with no cached
  research data shows `—` rather than a heuristic built entirely on the
  50/50 defaults, which would look like a real score when it isn't one.
- **Track record: closed trades don't show a live price.** Once a signal's
  outcome locks (`stopped`/`target_hit`), the "Live" column shows the frozen
  `exitPrice` (see `lib/live-signals.ts`) instead of the still-drifting live
  quote — a stopped trade floating back above its stop hours later was
  confusing to look at. Return % and the T1/T2/T3 "reached" checkmarks use
  the same frozen reference price for closed trades (`referencePrice()` in
  `app/dashboard/track-record/page.tsx`), so a closed trade's numbers stop
  moving the instant it closes, exactly like a real trade book.
- **Bug fixed (2026-09-04): partial target hit was closing the trade.**
  `computeOutcome()` used to lock as `target_hit` (→ shown as "Closed") the
  moment *any* configured target hit — so a T1/T2/T3 ladder that only
  cleared T1 got marked closed even though T2/T3 were still ahead of it.
  Now it only closes on the *furthest* configured target (T3 if set, else
  T2, else T1); an earlier target still lights up its own checkmark on the
  track record page, it just doesn't end the trade. A stop always closes the
  trade regardless of how many targets were hit first — that part was
  already correct. Existing rows locked prematurely on an intermediate
  target were reset back to `open` by `scripts/migration_fix_partial_target_lock.sql`.
- **Bug fixed (2026-09-04): T1/T2/T3 checkmarks weren't sticky.** They were a
  pure live-price comparison recomputed on every page load, so a target that
  was genuinely reached and then retraced un-checked itself — wrong, a
  target being hit is a fact that doesn't un-happen. `scripts/migration_target_hit_lock.sql`
  adds `signals.target_1_hit_at`/`target_2_hit_at`/`target_3_hit_at`, set
  automatically the first time price crosses each level (same sticky
  read/write pattern as `outcome_locked`, in `lib/live-signals.ts`) and
  cleared only when an admin edits the signal's targets. The track record
  page now reads these flags directly instead of re-deriving them from live
  price. Existing open signals that had already crossed a target before
  this fix were backfilled against real Fyers OHLC by
  `scripts/migration_backfill_target_hit_dates.sql` (see that file for the
  audited per-symbol results).
- **Bug fixed (2026-09-04): stop/target detection could miss a brief
  intraday touch.** Product rule: if SL is touched at all — a dip that
  recovers before the next price poll included — the trade is done, full
  stop, no exception. But `computeOutcome()` only ever compared the *current*
  live tick against the stop/target, on a ~10-20s poll cycle; a wick that
  touched and bounced back between two polls was invisible to it. Fixed by
  using Fyers' running intraday day-high/day-low (`lib/fyers.ts` `Quote.high`/
  `Quote.low`) instead of just the latest tick, for both the overall
  stop/target check and the per-target sticky-hit check. The audit that
  found the original T1/T2/T3 bug also caught two live examples of exactly
  this gap: `scripts/migration_backfill_intraday_stop_touches.sql` corrects
  AKUMS (day low ₹748.35 vs stop ₹751 on 2026-09-04) and PNBHOUSING (day low
  ₹1,125.4 vs stop ₹1,134 on 2026-09-02) — both genuinely stopped out days
  before their pages showed it. See that file's header for two other
  candidates that were checked and deliberately excluded (same-day-as-entry
  ambiguity — a daily candle can't tell if a dip happened before or after
  the entry trigger).
- **Bug fixed (2026-09-04, caught live within minutes): the day-low/day-high
  fix above had a same-day blind spot.** Fyers' day range is cumulative
  since market open, not since a specific trade's entry — for a signal
  generated earlier in *today's* session, that range can include price
  action from before the entry ever triggered. HBLENGINE dipped to ₹667
  before its buy signal fired at ₹701, and the day-low check wrongly locked
  it "stopped" against its ₹676 stop off a price the trade was never
  actually exposed to. Fixed with an `enteredToday` guard in
  `loadLiveSignals()`: a signal from a prior day still gets the full
  day-range check (safe — the whole trading day happened after entry); a
  signal from today falls back to the plain current-tick comparison instead
  (accepting a smaller risk of missing a same-day wick between polls, over
  the much worse risk of closing a trade off pre-entry price action).
  `scripts/migration_unlock_hblengine_false_stop.sql` clears the bad lock
  this produced — run it before the other pending migrations.
- **Data pipeline / cache** (`scripts/migration_stock_analytics_cache.sql`,
  `lib/stock-analytics-cache.ts`): every page view used to call the Indian
  API live — slow on first load and wasteful against a rate-limited
  third-party key, and with no way to pre-populate a symbol before anyone
  clicks through. `stock_analytics_cache` (one row per symbol, `data`
  JSONB + `fetched_at` + `error`) fixes both:
  - **Auto-populate on ingestion**: `ensureStockAnalyticsCached(symbol)` runs
    (best-effort, never throws) from both the Chartlink webhook and the
    manual "add signal" route the first time a symbol is seen — a newly
    published stock's analytics tile is ready by the time anyone opens it,
    not fetched cold on first view. Already-cached symbols are a single
    indexed lookup, so this costs nothing on the (common) repeat case.
  - **Admin pipeline panel** (`/dashboard/admin` → "Stock analytics
    pipeline", `components/admin-stock-analytics.tsx`): one row per active
    symbol showing cached/failed/never-fetched status, last-attempt time,
    and the error if one occurred — with a per-symbol "Refresh" button and
    a top-level "Refresh all" for backfilling or forcing a fresh pull.
    Backed by `GET/POST /api/admin/stock-analytics[/refresh]`.
  - **Page read path**: `getOrPopulateStockDetails(symbol)` trusts an
    existing cache row (success or failure) as-is — freshness is the
    admin's job via the refresh buttons, not re-fetched every page view.
    A true "never attempted" miss does **not** await a live fetch inline —
    that used to be exactly what made the symbol→analytics navigation feel
    slow (the page render blocked on an external HTTP call, up to its 8s
    timeout, before anything could be sent to the browser). It's now
    scheduled with Next's `after()` to run once the response has already
    gone out, and the page returns immediately with a "fetching for the
    first time" message; `stock-analytics-pane.tsx` auto-refreshes itself
    once ~3.5s later to pick up the result without a manual reload.

## Useful commands

```bash
npm run lint        # ESLint
npm run build       # production build
npm run start       # run the production build
```

## 13. Multi-tenancy / reseller platform (Phase 3 — in progress)

Goal: let SEBI-registered advisors run their own Telegram audience through
this app's infra under their own brand and registration, instead of the
single-operator setup this app has been until now. Full reasoning
(regulatory split, competitor landscape, why this is a real wedge right
now) is in `reseller-competitor-analysis.md`.

**Phase 1 (done):** foundational schema, additive and backward-compatible.

- `scripts/migration_tenants.sql` — new `tenants` / `tenant_admins` tables;
  `signals.tenant_id` (NOT NULL, backfilled to a seeded `'default'` tenant
  that represents today's single-operator instance); `signals`'s unique
  constraint becomes `(tenant_id, symbol, trigger_date, scan_url)`.
- `lib/tenants.ts` — `getDefaultTenant()`, `getTenantByWebhookToken()`,
  `getTenantForAdminUser()`.
- `app/api/webhooks/chartlink/route.ts` — the `?token=` query param
  resolves a tenant (a tenant's own `chartlink_webhook_token`, or the
  legacy `CHARTLINK_WEBHOOK_TOKEN` env var → `'default'` tenant). Every
  signal row it writes is stamped with `tenant_id`.
- `lib/live-signals.ts` — `loadLiveSignals(tenantId?)` takes an optional
  tenant filter, defaulting to `'default'`.
- Verify: `scripts/verify-multitenancy.sh` (webhook token resolution +
  data isolation, against the real deployed endpoint).

**Phase 2 (done, this section):** the admin panel and its write-side API
routes for signals + the positions ledger are now scoped to `tenant_admins`
instead of the single global `ADMIN_USER_IDS` allowlist — this is the part
that actually lets a second tenant's admin operate independently, without
env-var changes per tenant.

- `scripts/migration_positions_tenant_id.sql` — adds `positions.tenant_id`
  (NOT NULL), backfilled from each position's linked signal (or `'default'`
  for hand-logged rows with no signal link). Run AFTER
  `migration_tenants.sql`.
- `lib/admin.ts` — rewritten around `resolveAdminTenant(userId)` (pure DB
  logic, no Clerk — tries a real `tenant_admins` row first, falls back to
  the legacy `ADMIN_USER_IDS` allowlist scoped to `'default'`) and
  `getAdminContext()` (the Clerk-wrapped version: `{ userId, tenant }`).
  `getAdminUserId()` still exists, built on top of `getAdminContext()`, for
  admin surfaces not yet tenant-scoped (see below) — so this is fully
  backward-compatible; the single existing operator's access is unchanged.
- `app/dashboard/admin/page.tsx` — the signals list and positions ledger
  queries are now `WHERE tenant_id = $1` for the resolved admin's tenant.
  Scan mappings and the webhook activity feed on the same page are still
  global (see below).
- `app/api/signals/route.ts` (POST) / `app/api/signals/[id]/route.ts`
  (PATCH, DELETE) — create/dedupe/edit/delete are all scoped to the
  resolved admin's tenant; editing or deleting another tenant's signal
  returns 404 (not 403 — doesn't reveal that the id exists elsewhere).
- `app/api/admin/positions/route.ts` (GET, POST) /
  `app/api/admin/positions/[id]/route.ts` (PATCH, DELETE) — same tenant
  scoping and ownership checks, mirroring the signals routes.
- `lib/positions-admin.ts` — `upsertPositionFromSignal()` now takes a
  required `tenantId` and stamps it on every auto-created ledger row.
- Verify: `scripts/verify-admin-tenant-scoping.sh` (DB-level — checks
  `resolveAdminTenant()`'s two branches, including that a user who is
  neither a tenant admin nor in the legacy allowlist correctly resolves to
  `null`, plus that tenant-scoped signal/position queries actually exclude
  another tenant's rows).

**Phase 3 (done, this section):** the customer-facing side —
`/dashboard`, `/dashboard/track-record`, and `GET /api/signals` (the
ticker feed) now resolve and filter by the signed-in customer's own
tenant, closing the gap Phase 2 left open ("a second tenant's admin can
manage their own signals, but there's nowhere for their own customers to
see them").

- `scripts/migration_tenant_customers.sql` — new `tenant_customers` table
  (`user_id` PRIMARY KEY → `tenant_id`; a customer belongs to exactly one
  tenant, unlike `tenant_admins`' composite key). No hard ordering
  requirement against a deploy — see next bullet.
- `lib/tenants.ts` — `getTenantForCustomer(userId)` and
  `resolveCustomerTenant(userId)` (always returns a `Tenant`, never `null`:
  falls back to `'default'` for any user with no `tenant_customers` row,
  i.e. every existing customer today). Unlike the admin/webhook tenant
  paths, this one sits on the customer-facing ticker's hot path, so
  `getTenantForCustomer()` deliberately catches its own query errors and
  falls back to `null` (→ `'default'`) instead of throwing — this code is
  safe to deploy before or after the migration runs, no ordering
  constraint either way.
- `app/api/signals/route.ts` (GET), `app/dashboard/page.tsx`,
  `app/dashboard/track-record/page.tsx` — all resolve
  `resolveCustomerTenant(userId)` and pass the result into
  `loadLiveSignals(tenant.id)`; the two dashboard pages also render
  `tenant.brandName` in the header instead of the hardcoded "Signals" —
  the first visible, working piece of per-tenant branding, ahead of the
  full subdomain/custom-domain work that's still deferred.
- `lib/live-signals.ts` — `loadLiveSignals()` no longer announces a closed
  trade to the public Telegram results channel unless it's the `'default'`
  tenant's signal. Caught while wiring this phase: the Telegram bot is
  still single global config (see below), so without this guard a second
  tenant's private trade closes would've been broadcast onto the
  operator's own public channel the moment that tenant had a real signal.
- Verify: `scripts/verify-customer-tenant-scoping.sh` (DB-level — checks
  both branches of `resolveCustomerTenant()` and that
  `loadLiveSignals(tenantId)` actually isolates a test tenant's signal from
  the default tenant's view).

**Explicitly NOT done yet** (each is a bigger, riskier change, deliberately
deferred rather than rushed):

- `scan_mappings` (scan_url → buy/sell direction) is still global, not
  tenant-scoped — its primary key is `scan_url` alone, so today every
  tenant would share the same scan→direction mapping. Needs a composite
  key change.
- The webhook activity feed (`/api/webhook-events`, shown on the admin
  page) and the stock-analytics cache/pipeline are still global/unscoped —
  they're diagnostic/shared-infrastructure surfaces, not tenant data.
- Billing (Razorpay), the Telegram results channel/digest bot, and the
  Fyers broker integration are all still single global env-var
  configuration, not per-tenant. `tenants.telegram_bot_token` /
  `telegram_chat_id` columns already exist for this but nothing reads them
  yet — a second tenant's trade closes are correctly suppressed from the
  channel (see Phase 3 above), not yet posted to their own.
- The user-management page (`/dashboard/admin/users`) and billing panel
  still use `isAdminUserId()`/the global allowlist directly — these are
  operator-only concerns (Clerk users, Razorpay subscriptions) with no
  per-tenant concept yet.
- No reseller-facing signup/onboarding flow exists yet — creating a new
  tenant, its first `tenant_admins` row, and its customers'
  `tenant_customers` rows today all mean inserting rows by hand. The SEBI
  RA/RIA registration-number verification gate described in
  `reseller-competitor-analysis.md` §1a is not built.
- No per-tenant branding beyond the `brandName` header text above — no
  subdomain, custom domain, logo, or color theme per tenant. Every tenant
  also still shares the same billing/paywall (`lib/access.ts`) — a second
  tenant's customer needs a subscription in the same global Razorpay
  account, or trial/admin access, exactly like today's customers.

**Suggested next order:** (1) per-tenant Telegram bot config, reading
`tenants.telegram_bot_token`/`telegram_chat_id` instead of the env vars —
so a second tenant's results actually get announced somewhere, not just
correctly suppressed; (2) the RA/RIA-verified signup flow (this is also
what would populate `tenant_admins`/`tenant_customers` without hand-written
SQL); (3) per-tenant billing/revenue split; (4) `scan_mappings` composite
key.

## 14. Performance

A few concrete changes made after noticing the app felt slow at times,
plus honest notes on what does and doesn't actually help here.

**Speculation Rules (`app/layout.tsx`)** — a `<script type="speculationrules">`
tells Chromium browsers (Chrome/Edge/Opera; other browsers silently ignore
an unrecognized `<script type>`, so this is a safe no-op there) to
speculatively prefetch/prerender a same-origin page ahead of a click.
Scoped deliberately, not blanket:

- Marketing/public pages (everything except `/api/*` and `/dashboard/*`)
  get full `prerender` at `"moderate"` eagerness (hover ~200ms) — cheap to
  render, not personalized, worth the resource cost for the sign-up funnel.
- `/dashboard/*` (excluding `/dashboard/admin/*`) gets only lighter
  `prefetch` at `"conservative"` eagerness (click-triggered only) — these
  pages are personalized and DB/live-Fyers-quote backed
  (`loadLiveSignals()`), so a casual hover shouldn't speculatively fire
  those calls for a page that might never actually open.
- `/api/*` and `/dashboard/admin/*` are excluded from both entirely.

**Important honest caveat, confirmed against MDN and Vercel's own guidance
before adding this:** the Speculation Rules API targets full browser
("hard") navigations — it's designed for traditional multi-page sites.
Next.js's App Router intercepts `<Link>` clicks after the page has
hydrated and does its own client-side ("soft") navigation instead, which
means the browser's real navigation (and therefore the prerendered/
prefetched page) never actually activates for most in-app link clicks —
Next.js already automatically prefetches `<Link>` targets as they enter
the viewport, which is what's actually speeding up those clicks today.
Where Speculation Rules genuinely helps in a Next.js app like this one:
the very first click before the page's JS has hydrated (slower devices/
connections), plain non-`<Link>` anchors, and true hard navigations. It's
a real, safe, zero-regression addition — just not a blanket "makes every
click instant" fix the way it would be on a classic multi-page site.
Sources: [MDN Speculation Rules API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API),
[Vercel: Optimizing hard navigations](https://vercel.com/kb/guide/optimizing-hard-navigations).

**Landing hero particle canvas (`components/landing-particle-canvas.tsx`)**
— found and fixed a real, separate performance issue while looking into
this: the decorative particle animation ran an O(n²) pairwise
distance-check every frame, forever, with no pause — even after the user
scrolled past the hero, and even with the tab backgrounded. Now paused via
`document.visibilitychange` (tab hidden) and an `IntersectionObserver`
(hero scrolled out of view), resuming when either becomes true again. Pure
CPU/battery waste eliminated; no visual change while the hero is on
screen.

**Parallelized independent DB/API reads** — several server components
were doing sequential `await`s for reads that don't depend on each other,
paying for N round trips back to back instead of running concurrently.
Fixed with `Promise.all` in:
- `app/dashboard/admin/page.tsx` — the signals list, scan mappings,
  positions ledger, and stock-analytics status queries are independent;
  only `loadLivePricesFor(positions)` genuinely has to wait on positions.
- `app/dashboard/stocks/[symbol]/page.tsx` — `loadLiveSignals()` (which
  can be slow: live Fyers quotes for every active symbol, not just this
  page's) and the stock-analytics cache lookup are independent.
- `app/dashboard/page.tsx` — the new tenant lookup (Phase 3, §13) and
  Clerk's `currentUser()` are independent. `ensureUserRecord()` →
  `getAccessStatus()` stay sequential on purpose — that ordering is the
  fix from an earlier session (a brand-new user's very first page load
  needs their DB row to exist before the access check runs).

**Not changed, and why:** `app/dashboard/track-record/page.tsx` fetches
`loadLiveSignals()` then batches stock details for exactly the symbols
that came back — a genuine dependency, not parallelizable. Every dashboard
route stays `force-dynamic` on purpose (per-user, per-tenant, live-price
data — none of it is safe to statically cache); the real lever there is
the query/quote parallelization above, not disabling dynamic rendering.

## Scripts

- `scripts/ingest_signals.py` — legacy manual/backfill generator (single
  row-per-symbol output, independent of the webhook path). Note: its
  `ON CONFLICT (symbol, signal_type)` target predates several schema
  changes (including Phase 1 multi-tenancy above) and no longer matches a
  real constraint — treat this script as stale/inactive, not a maintained
  ingestion path.
- `scripts/schema.sql` — canonical schema.
- `scripts/migration_*.sql` — incremental schema changes.
- `scripts/sample_signals.json` — sample output from the generator.
- `scripts/score.sh` — manual conviction-score check for a single symbol
  (`./scripts/score.sh RELIANCE`).
- `scripts/verify-multitenancy.sh` — automated isolation smoke test for
  multi-tenancy Phase 1, see §13 above.
- `scripts/verify-admin-tenant-scoping.sh` — automated check of Phase 2's
  admin→tenant resolution + signals/positions data isolation, see §13
  above.
- `scripts/verify-customer-tenant-scoping.sh` — automated check of Phase
  3's customer→tenant resolution + `loadLiveSignals()` data isolation, see
  §13 above.