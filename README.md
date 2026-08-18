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
| `DATABASE_URL` | Your Neon Postgres connection string |
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
psql "$DATABASE_URL" -f scripts/migration_positions.sql
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
`Mapped · signal written` or `Unmapped · skipped` and refreshes every 10s.

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

## 8. Positions ledger (track record)

An admin-only record of the swing positions actually posted publicly —
separate from `signals` (which only drives the live ticker). This is the
source of truth for a future win-rate / statistical-edge report.

- `/dashboard/admin` → **Positions ledger**: log a symbol/direction/entry/
  target/stop with the date posted, then mark it "Hit target," "Hit stop," or
  "Close" (manual exit) as it plays out. Shows a running win-rate stat over
  closed positions.
- `GET/POST /api/admin/positions`, `PATCH/DELETE /api/admin/positions/[id]`
  — all admin-only, nested under `/api/admin` (already covered by
  `proxy.ts`'s protected-route list, no separate wiring needed).
- Not linked to `signals` by foreign key on purpose: a logged position is "I
  called this trade publicly on this date," independent of whatever the admin
  signals view currently shows for that symbol.

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