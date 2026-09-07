#!/usr/bin/env bash
# Runs scripts/verify-customer-tenant-scoping.ts — automated check of
# Phase 3's customer-facing tenant resolution (lib/tenants.ts) and
# loadLiveSignals() tenant isolation. DB-only, no Clerk session needed;
# safe on prod (creates and cleans up its own test data).
#
# Usage (run from the project root):
#   ./scripts/verify-customer-tenant-scoping.sh
#
# Loads DATABASE_URL (and anything else, e.g. Fyers creds) from .env.local
# automatically — Fyers being unconfigured is fine too, loadLiveSignals()
# degrades gracefully to stored prices either way.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

npx tsx scripts/verify-customer-tenant-scoping.ts "$@"
