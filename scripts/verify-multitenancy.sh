#!/usr/bin/env bash
# Runs scripts/verify-multitenancy.ts — automated proof that multi-tenancy
# Phase 1 isolation actually works, against the real deployed webhook.
# Creates and cleans up its own throwaway tenant/scan/signal; safe on prod.
#
# Usage (run from the project root):
#   ./scripts/verify-multitenancy.sh
#   ./scripts/verify-multitenancy.sh https://signals-tawny.vercel.app
#   ./scripts/verify-multitenancy.sh --keep      # leave test data for inspection
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

args=()
for a in "$@"; do
  if [[ "$a" == --* ]]; then
    args+=("$a")
  else
    args+=("--base-url=$a")
  fi
done

npx tsx scripts/verify-multitenancy.ts "${args[@]}"
