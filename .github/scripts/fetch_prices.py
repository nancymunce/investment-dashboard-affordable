#!/usr/bin/env python3
"""
Scheduled price updater for the static investment dashboard.

- Reads tickers + share counts from holdings.json
- Fetches latest quotes from Finnhub's free API (60 calls/min on the free tier)
- Rolls prices.json forward: latest price -> price, previous close -> prevClose
- Appends one point to history.json (portfolio vs S&P 500 growth series)
- Fails LOUDLY (non-zero exit) on any problem, so the workflow reports a
  real failure instead of a fake success.

Setup: create a free key at https://finnhub.io (no credit card required),
then add it as a GitHub Actions secret named FINNHUB_API_KEY
(repo -> Settings -> Secrets and variables -> Actions). The workflow passes
it in as an environment variable; the key never touches the front end.

The front end reads ONLY the local JSON files.

Run from the repo root:  FINNHUB_API_KEY=xxx python .github/scripts/fetch_prices.py
"""

import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

FINNHUB_URL = "https://finnhub.io/api/v1/quote?symbol={symbol}&token={token}"
BENCHMARK_SYMBOL = "SPY"  # S&P 500 ETF — tracks the index within basis points
MAX_ATTEMPTS = 3
HEADERS = {"User-Agent": "Mozilla/5.0 (dashboard-updater)"}


def fetch_one(symbol, token):
    """Return (price, prev_close, trading_day) for a symbol.

    Raises on any problem; the caller retries, then fails the run loudly.
    """
    url = FINNHUB_URL.format(symbol=urllib.parse.quote(symbol, safe=""), token=token)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        quote = json.load(resp)
    price, prev_close = quote.get("c"), quote.get("pc")
    if not price or not prev_close:
        raise ValueError("incomplete quote for %s: %r" % (symbol, quote))
    stamp = quote.get("t")
    if stamp:
        trading_day = datetime.datetime.fromtimestamp(
            stamp, tz=datetime.timezone.utc).date().isoformat()
    else:
        trading_day = datetime.date.today().isoformat()
    return round(float(price), 2), round(float(prev_close), 2), trading_day


def fetch_quotes(symbols, token):
    """symbols: {key: finnhub_symbol}. Returns {key: (price, prev_close, day)}."""
    out = {}
    for key, symbol in symbols.items():
        last_err = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                out[key] = fetch_one(symbol, token)
                break
            except Exception as e:  # noqa: BLE001 - retried below, then fatal
                last_err = e
                time.sleep(2 * attempt)
        else:
            raise RuntimeError("quote fetch failed for %s: %s" % (symbol, last_err))
        time.sleep(0.5)  # stay comfortably under the free-tier rate limit
    return out


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    # NOTE: when run via `python .github/scripts/fetch_prices.py` from the repo
    # root this chdir is a no-op; it also makes direct execution of the script work.

    token = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not token:
        print("ERROR: FINNHUB_API_KEY is not set. Add it as a GitHub Actions "
              "secret (repo -> Settings -> Secrets and variables -> Actions).",
              file=sys.stderr)
        return 1

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
    symbols = {h["ticker"]: h["ticker"] for h in holdings}
    symbols["__SPX"] = BENCHMARK_SYMBOL

    try:
        quotes = fetch_quotes(symbols, token)
    except RuntimeError as e:
        print("ERROR: %s" % e, file=sys.stderr)
        return 1  # loud failure: the workflow must report this, not fake success

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    for h in holdings:
        t = h["ticker"]
        price, prev_close, _day = quotes[t]
        prices_doc.setdefault("prices", {})[t] = {
            "price": price,
            "prevClose": prev_close,
        }

    spx_price, spx_prev, trading_day = quotes["__SPX"]
    bench = prices_doc.setdefault("benchmark", {"label": "S&P  500"})
    bench["prevClose"] = spx_prev
    bench["price"] = spx_price

    # Append one history point per trading day (skip if already recorded).
    if not history.get("dates") or history["dates"][-1] != trading_day:
        prev_total = sum(h["shares"] * quotes[h["ticker"]][1] for h in holdings)
        new_total = sum(h["shares"] * quotes[h["ticker"]][0] for h in holdings)
        if prev_total > 0 and new_total > 0 and spx_prev > 0:
            history["dates"].append(trading_day)
            history["portfolio"].append(
                round(history["portfolio"][-1] * new_total / prev_total, 2))
            history["sp500"].append(
                round(history["sp500"][-1] * spx_price / spx_prev, 2))

    prices_doc["updated"] = now_iso
    history["updated"] = now_iso

    with open("prices.json", "w") as f:
        json.dump(prices_doc, f, indent=2)
        f.write("\n")
    with open("history.json", "w") as f:
        json.dump(history, f)
        f.write("\n")

    print("Updated %d holdings + S&P 500 benchmark (trading day %s)."
          % (len(holdings), trading_day))
    return 0


if __name__ == "__main__":
    sys.exit(main())
