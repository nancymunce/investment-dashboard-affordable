# Sample Affordable Portfolio Dashboard

A **static** investment dashboard for GitHub Pages: plain HTML, CSS, and vanilla JS — no build step, no framework, no backend. Chart.js loads from cdnjs. A scheduled GitHub Action refreshes prices automatically.

This is the **affordable companion** to the original sample dashboard: same core-satellite philosophy, same panels, but a ~$10,000 sample portfolio where every holding trades under ~$70/share.

> **Disclaimer:** Educational content only — not personalized financial advice. The portfolio, prices, and history in this repo are a *sample* for illustration. Past performance does not guarantee future results.

## Repo structure

```
.
├── index.html                        # Dashboard page
├── styles.css                        # Light/dark theme, responsive layout
├── app.js                            # All dashboard logic (vanilla JS)
├── holdings.json                     # ★ EDIT ME: holdings, targets, theses
├── prices.json                       # Latest quotes (updated by the Action)
├── history.json                      # Daily portfolio vs S&P 500 series
├── commentary.md                     # ★ EDIT ME: "The Veteran's Desk" content
├── .github/
│   ├── workflows/update-prices.yml   # Scheduled price refresh (weekdays)
│   └── scripts/fetch_prices.py       # Stooq fetcher — no API key needed
└── README.md
```

The page reads **only** the local JSON/Markdown files. Nothing secret ever reaches the browser.

## The sample portfolio

A concentrated-but-diversified core-satellite portfolio (11 holdings, ~$10,000):

| Sleeve | Holdings | Target |
|---|---|---|
| Core (~65%) | SCHB (US broad market), SCHF (international), SCHZ (bonds) | Low-cost compounding engine |
| Satellite (~35%) | CSCO, KO, VZ, USB, PFE, CSX, EXC, UL | 8 quality stocks, 7 sectors, all under ~$70/share |

Design rules enforced by the dashboard: no single stock over 8%, no sector over 25%, ≥6 sectors, international (SCHF + UL ≈ 18%) + defensive exposure. The Risk panel scores all of this and flags any holding drifting more than 5pp from target.

Note: one holding (PFE) is intentionally underwater in the sample data — red ink is normal, not failure.

## Setup — GitHub Pages

Same five minutes as the original:

1. Create a **public** repo (e.g. `investment-dashboard-affordable`) and push these files to `main`.
2. Repo → *Settings* → *Pages* → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → *Save*.
3. Repo → *Actions* → enable workflows if prompted.
4. Visit `https://YOU.github.io/investment-dashboard-affordable/`.

**Tip from the first build:** if `git push` rejects the commit because your saved token lacks the `workflow` scope, push everything except `.github/workflows/update-prices.yml`, then add that file via the website (*Add file → Create new file*).

### API keys (optional)

The default fetcher uses **Stooq's free CSV endpoint — no key required**. Keep any alternative provider keys in repo *Settings → Secrets and variables → Actions*, never in the front end.

## Editing

- **`holdings.json`** — change `targetWeight`, `shares`, `costBasis`, `thesis`, `risk`, or add/remove holdings. The dashboard recomputes everything automatically.
- **`commentary.md`** — "The Veteran's Desk" renders this file live (headings, bold/italic, lists, quotes, `code`). This edition's commentary is angled toward starting small.
- **`prices.json` / `history.json`** — normally written by the Action; the committed files are sample data so the page works immediately.

## Local preview

```bash
cd investment-dashboard-affordable
python3 -m http.server 8000
# open http://localhost:8000
```

(`fetch()` doesn't work over `file://`.)

## How the price updater works

1. `fetch_prices.py` reads tickers from `holdings.json` (mapped to Stooq `ticker.us` symbols + `^spx`).
2. Fetches one CSV request for all symbols.
3. Rolls `prices.json` forward: new close → `price`, previous `price` → `prevClose`.
4. Appends one point to `history.json` (portfolio vs S&P 500).
5. Commits only if something changed. Network failures exit 0 with a warning.

## Diversification score (exact formula)

Starts at 100: −15 if any single **stock** exceeds 8% · −15 if any **sector** exceeds 25% (−5 if 20–25%) · −3 per holding drifting >5pp from target · −5 if holdings outside 10–15 · −10 if fewer than 6 sectors. Labels: 80+ Strong · 60–79 Adequate · below 60 Concentrated. (Broad-market ETFs and bonds are excluded from the sector check — they're diversified by construction.)

## Limitations

- Sample prices/history are illustrative, not real quotes (until the Action runs).
- Stooq quotes are ~15 minutes delayed; this is a tracking dashboard, not a trading tool.
- No authentication — don't put personal account data in this repo.
