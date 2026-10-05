#!/usr/bin/env python3
"""
Scheduled price updater for the static investment dashboard.

- Reads tickers + share counts from holdings.json
- Fetches latest quotes from Stooq's free CSV endpoint (no API key needed)
- Rolls prices.json forward: new close -> price, previous price -> prevClose
- Appends one point to history.json (portfolio vs S&P 500 growth series)
- Never fails the workflow: network problems exit 0 with a warning,
  leaving the existing JSON files untouched.

The front end reads ONLY the local JSON files, so no secret ever
touches the browser. If you prefer Alpha Vantage or Finnhub instead of
Stooq, add your key as a GitHub Secret and extend fetch_quotes() below —
the JSON contracts stay exactly the same.

Run from the repo root:  python .github/scripts/fetch_prices.py
"""

import csv
import datetime
import io
import json
import os
import sys
import urllib.parse
import urllib.request

STOOQ_URL = "https://stooq.com/q/l/?s={symbols}&f=sd2t2ohlcv&h&e=csv"
BENCHMARK_KEY = "__SPX"  # internal key for the S&P 500 quote


def stooq_symbol(ticker):
    """Map a dashboard ticker to its Stooq symbol (all sample holdings are US-listed)."""
    return ticker.lower() + ".us"


def fetch_quotes(symbols):
    """symbols: dict of internal_key -> stooq symbol. Returns {internal_key: close or None}."""
    query = ",".join(symbols.values())
    url = STOOQ_URL.format(symbols=urllib.parse.quote(query))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (dashboard-updater)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", "replace")
    out = {key: None for key in symbols}
    inv = {v.lower(): k for k, v in symbols.items()}
    for row in csv.DictReader(io.StringIO(text)):
        key = inv.get(row.get("Symbol", "").strip().lower())
        if not key:
            continue
        try:
            out[key] = float(row["Close"])
        except (TypeError, ValueError):
            out[key] = None  # e.g. "N/D" — leave the old price in place
    return out


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    # NOTE: when run via `python .github/scripts/fetch_prices.py` from the repo
    # root this chdir is a no-op; it also makes direct execution of the script work.

    try:
        with open("holdings.json") as f:
            holdings_doc = json.load(f)
        with open("prices.json") as f:
            prices_doc = json.load(f)
        with open("history.json") as f:
            history = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print("ERROR: could not read input JSON: %s" % e, file=sys.stderr)
        return 1

    holdings = holdings_doc["holdings"]
    symbols = {h["ticker"]: stooq_symbol(h["ticker"]) for h in holdings}
    symbols[BENCHMARK_KEY] = "^spx"

    try:
        quotes = fetch_quotes(symbols)
    except Exception as e:  # network/DNS/rate-limit — keep old data, don't fail the run
        print("WARNING: quote fetch failed (%s); keeping existing prices." % e)
        return 0

    today = datetime.date.today().isoformat()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    # Roll prices forward: old price becomes prevClose (drives the "day change" card).
    old_prices = {t: v.get("price") for t, v in prices_doc.get("prices", {}).items()}
    old_bench = prices_doc.get("benchmark", {}).get("price")

    updated_any = False
    for h in holdings:
        t = h["ticker"]
        q = quotes.get(t)
        if q and q > 0:
            prev = old_prices.get(t) or q
            prices_doc.setdefault("prices", {})[t] = {
                "price": round(q, 2),
                "prevClose": round(prev, 2),
            }
            updated_any = True

    spx = quotes.get(BENCHMARK_KEY)
    if spx and spx > 0:
        bench = prices_doc.setdefault("benchmark", {"label": "S&P 500"})
        bench["prevClose"] = round(old_bench or spx, 2)
        bench["price"] = round(spx, 2)

    # Append one history point (skip if we already have one for today).
    if history.get("dates") and history["dates"][-1] != today:
        def value_at(price_map):
            total = 0.0
            for h in holdings:
                p = price_map.get(h["ticker"])
                if p:
                    total += h["shares"] * p
            return total

        new_map = {t: v["price"] for t, v in prices_doc["prices"].items() if v.get("price")}
        prev_map = {t: (old_prices.get(t) or new_map.get(t)) for t in new_map}
        prev_total, new_total = value_at(prev_map), value_at(new_map)
        if prev_total > 0 and new_total > 0 and updated_any:
            pf_factor = new_total / prev_total
            spx_factor = (spx / old_bench) if (spx and old_bench) else 1.0
            history["dates"].append(today)
            history["portfolio"].append(round(history["portfolio"][-1] * pf_factor, 2))
            history["sp500"].append(round(history["sp500"][-1] * spx_factor, 2))

    prices_doc["updated"] = now_iso
    history["updated"] = now_iso

    with open("prices.json", "w") as f:
        json.dump(prices_doc, f, indent=2)
        f.write("\n")
    with open("history.json", "w") as f:
        json.dump(history, f)
        f.write("\n")

    print("Updated prices for %d holdings (benchmark S&P 500: %s)." %
          (sum(1 for h in holdings if quotes.get(h["ticker"])), spx))
    return 0


if __name__ == "__main__":
    sys.exit(main())
