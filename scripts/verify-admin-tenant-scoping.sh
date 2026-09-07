#!/usr/bin/env bash
# Runs scripts/verify-admin-tenant-scoping.ts — automated check of the
# admin→tenant resolution logic (lib/admin.ts) and signals/positions
# tenant isolation added in multi-tenancy Phase 2. DB-only, no Clerk
# session needed; safe on prod (creates and cleans up its own test data).
#
# Usage (run from the project root):
#   ./scripts/verify-admin-tenant-scoping.sh
#
# Loads DATABASE_URL (and anything else) from .env.local automatically.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

npx tsx scripts/verify-admin-tenant-scoping.ts "$@"
