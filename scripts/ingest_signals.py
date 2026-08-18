#!/usr/bin/env python3
"""Ingest swing-signal output from the Python generator into Postgres.

Standalone script — runs independently of the Next.js app, triggered by cron or
a scheduled function. It never asks the web app to run the generator.

Input contract (JSON file, list of objects):
  required: symbol, signal_type ('buy'|'sell'), entry_price, target_price,
            stop_price, days_to_exit
  optional: name, price, change_pct, days_in, status, generated_at

The file may also be an object with a 'signals' or 'data' list.

Upsert semantics (natural key symbol + signal_type):
  - a row for the same symbol+direction is updated in place;
  - active signals from a previous run that were NOT regenerated this run are
    marked 'expired'.

Usage:
  scripts/.venv/bin/python scripts/ingest_signals.py scripts/sample_signals.json
  DATABASE_URL=postgresql://... scripts/.venv/bin/python scripts/ingest_signals.py /path/to/signals.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

import psycopg

DEFAULT_DSN = "postgresql://signals_app:signals_app@localhost:5432/signals_app"

REQUIRED_FIELDS = (
    "symbol",
    "signal_type",
    "entry_price",
    "target_price",
    "stop_price",
    "days_to_exit",
)
VALID_STATUS = ("active", "expired", "hit_target", "hit_stop")

UPSERT_SQL = """
INSERT INTO signals (
    symbol, name, signal_type, price, change_pct,
    entry_price, target_price, stop_price, days_in, days_to_exit,
    status, generated_at, updated_at
) VALUES (
    %(symbol)s, %(name)s, %(signal_type)s, %(price)s, %(change_pct)s,
    %(entry_price)s, %(target_price)s, %(stop_price)s, %(days_in)s,
    %(days_to_exit)s, %(status)s, %(generated_at)s, now()
)
ON CONFLICT (symbol, signal_type) DO UPDATE SET
    name          = EXCLUDED.name,
    price         = EXCLUDED.price,
    change_pct    = EXCLUDED.change_pct,
    entry_price   = EXCLUDED.entry_price,
    target_price  = EXCLUDED.target_price,
    stop_price    = EXCLUDED.stop_price,
    days_in       = EXCLUDED.days_in,
    days_to_exit  = EXCLUDED.days_to_exit,
    status        = EXCLUDED.status,
    generated_at  = EXCLUDED.generated_at,
    updated_at    = now()
"""

EXPIRE_MISSING_SQL = """
UPDATE signals SET status = 'expired', updated_at = now()
WHERE status = 'active'
  AND NOT (symbol, signal_type) IN (
      SELECT sym, sig FROM unnest(%s::text[], %s::text[]) AS pairs(sym, sig)
  )
"""


def _as_utc(value) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def load_rows(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        for key in ("signals", "data"):
            if isinstance(data.get(key), list):
                return data[key]
        raise SystemExit(f"error: {path} is an object without a 'signals'/'data' list")
    if not isinstance(data, list):
        raise SystemExit(f"error: {path} must be a JSON list of signal objects")
    return data


def normalize(row: dict, index: int) -> dict:
    missing = [k for k in REQUIRED_FIELDS if row.get(k) is None]
    if missing:
        raise SystemExit(f"error: row {index} missing required field(s): {', '.join(missing)}")

    signal_type = str(row["signal_type"]).strip().lower()
    if signal_type not in ("buy", "sell"):
        raise SystemExit(f"error: row {index}: signal_type must be 'buy' or 'sell', got {row['signal_type']!r}")

    status = str(row.get("status", "active")).strip().lower()
    if status not in VALID_STATUS:
        raise SystemExit(f"error: row {index}: invalid status {row['status']!r}")

    return {
        "symbol": str(row["symbol"]).strip().upper(),
        "name": row.get("name"),
        "signal_type": signal_type,
        "price": row.get("price"),
        "change_pct": row.get("change_pct"),
        "entry_price": row["entry_price"],
        "target_price": row["target_price"],
        "stop_price": row["stop_price"],
        "days_in": int(row.get("days_in", 0)),
        "days_to_exit": int(row["days_to_exit"]),
        "status": status,
        "generated_at": _as_utc(row.get("generated_at")),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="path to the generator's signals JSON file")
    parser.add_argument(
        "--dsn",
        default=os.environ.get("DATABASE_URL", DEFAULT_DSN),
        help="Postgres connection string (defaults to $DATABASE_URL)",
    )
    args = parser.parse_args()

    rows = [normalize(r, i) for i, r in enumerate(load_rows(args.file))]

    with psycopg.connect(args.dsn) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(UPSERT_SQL, row)
            if rows:
                cur.execute(
                    EXPIRE_MISSING_SQL,
                    ([r["symbol"] for r in rows], [r["signal_type"] for r in rows]),
                )
            else:
                cur.execute("UPDATE signals SET status = 'expired', updated_at = now() WHERE status = 'active'")
        conn.commit()

    print(f"ingested {len(rows)} signals")
    return 0


if __name__ == "__main__":
    sys.exit(main())
