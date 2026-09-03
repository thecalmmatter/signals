#!/usr/bin/env bash
# Quick wrapper around scripts/check-stock-score.ts — just give it a symbol.
#
# Usage (run from the project root):
#   ./scripts/score.sh RELIANCE
#   ./scripts/score.sh MCX --outcome=target_hit
#
# Loads INDIAN_STOCK_API_KEY (and anything else) from .env.local automatically,
# so you don't need to export it yourself first.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/score.sh <SYMBOL> [--outcome=open|target_hit|stopped]" >&2
  exit 1
fi

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

npx tsx scripts/check-stock-score.ts "$@"
