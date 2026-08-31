# signals_app

A Next.js signals dashboard that ingests Chartlink screener alerts via a webhook,
shows them on a live customer feed, and gives the owner an admin panel to approve,
edit, or suppress signals. Uses Clerk for auth and a Neon (Postgres) database.

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

## Scripts

- `scripts/ingest_signals.py` — legacy manual/backfill generator (single
  row-per-symbol output, independent of the webhook path).
- `scripts/schema.sql` — canonical schema.
- `scripts/migration_*.sql` — incremental schema changes.
- `scripts/sample_signals.json` — sample output from the generator.