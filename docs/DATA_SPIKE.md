# Stage 0 — Data Spike Results (31 Oct 2026)

Tested from the dev machine with plain HTTP (curl, browser User-Agent), no API keys. Samples in `data/spike-samples/`.

| Integration | Result | Evidence | Strategy |
|---|---|---|---|
| **Yahoo Finance chart API** (`query1.finance.yahoo.com/v8/finance/chart/{SYM}.NS`) | **WORKS** | 200 for 14/14 tickers tested; 64 daily bars for 3mo, 0 null closes, volume present, latest bar = 31 Oct 2026 | Primary for EOD OHLCV. Call JSON endpoint directly (no library needed). `.BO` returned only 1 bar for 3mo/1d (unreliable) → use `.NS` only; treat `.BO` as last-resort |
| **NSE corporate announcements** (`nseindia.com/api/corporate-announcements?index=equities&symbol=X&from_date=DD-MM-YYYY&to_date=…`) | **WORKS, no cookie needed** from this machine | 200 for all 15 tickers (4–20 filings in Oct 2026); fields: `an_dt, desc, attchmntText, attchmntFile, sm_name, hasXbrl, seq_id`. Homepage itself returns 403 but the API doesn't | **Primary announcements source** (symbol-keyed, which is ideal for any-NSE-ticker). Unfiltered `symbol=X` returns full history (2.9 MB for RELIANCE) → always pass date range. Needs Referer + `Accept: application/json`; may fail from cloud IPs → snapshot fallback is mandatory |
| **BSE announcements API** (`api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w`, `AnnGetData/w`) | **FAILS** — 403 Akamai "Access Denied" even with Referer/Origin | 2 endpoint variants tested | Demote BSE: not used for announcements. (BSE-hosted PDFs *are* downloadable, see below) |
| **screener.in company page** (`/company/{SYM}/consolidated/`) | **WORKS, but rate-limited** | 200 with 236 KB HTML; sections present: quarters, profit-loss, balance-sheet, cash-flow, ratios, documents. 10 of 14 requests OK, then **HTTP 429** at 1 req/s (VEDL, CDSL, DMART, BAJFINANCE blocked) | Ingest ahead of time at ≥4–5 s spacing with backoff+retry; cache raw HTML; commit parsed JSON. Runtime fetch for ad-hoc tickers allowed but cached; on 429 show "try again shortly" and serve snapshot if exists |
| **Screener quarterly table** | **WORKS** | 12 quarters of Sales, Expenses, Operating Profit, OPM, Other income, Interest, Depreciation, PBT, Tax, Net Profit, EPS. RELIANCE Sep-2026: Sales 330,601; OP 56,616; PBT 38,613; PAT 29,550 (₹ cr) | Ground truth for QoQ/YoY. **Caveat:** screener has no "EBITDA" row — use Operating Profit (= EBITDA proxy, excludes other income); label it. Row labels contain buttons (`Sales +`), strip when parsing. Banks/NBFCs have different row sets (Revenue/Financing profit) → parser must handle |
| **Screener documents section** | **WORKS** | Annual Reports (FY13–FY26), concall "Transcript"/"PPT"/"REC" links (16–53 transcript links per company), credit-rating links, recent announcements | Source of AR + transcript URLs for the pull pipeline. Some `REC` links are YouTube (ignore) |
| **Quarterly results filing PDF** (from NSE `attchmntFile`, `nsearchives.nseindia.com`) | **WORKS** | 8.8 MB PDF, 200, text-extractable (pdftotext), contains outcome letter + results | Use for push results card; reconcile vs screener table. Large files → extract only first ~15 pages / results tables |
| **Concall transcript PDF** (`bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname=…`) | **WORKS** | 607 KB PDF, 200 with a Referer; real text | Pull-side primary source. Need to confirm full-transcript text quality per company (spot check passed on RELIANCE) |
| **Annual report PDF** (`bseindia.com/xml-data/corpfiling/AttachHis/…`, `/bseplus/AnnualReport/…`) | **WORKS but heavy** | 11 MB (FY26) and 25 MB (FY22) downloads OK | Do **not** process whole ARs at runtime on serverless. Pre-extract and cache text for demo tickers; for ad-hoc tickers extract only MD&A + financial-statement pages (page-range heuristics) with a size/time cap |
| **LinkedIn / person bio** | Not tested (by design) | — | No scraping. Plan unchanged: LLM with search grounding or Wikipedia; filing facts as fallback (decide in Stage 5) |

## Findings that change the plan
1. **NSE is the primary announcements source; BSE is dropped.** Simpler: one symbol-keyed API.
2. **screener.in 429s at ~1 req/s.** Ingest must be slow, cached and resumable; ad-hoc research must tolerate 429.
3. **"EBITDA" is not in screener** — use Operating Profit as the proxy, labelled; the filing PDF can supply reported EBITDA where stated.
4. **Whole annual reports are too large for runtime**; pre-extract text, extract page ranges for new tickers.
5. **Real data is current** (filings dated 30–31 Oct 2026, Reliance Q2 FY27 results already in). The "24h window" will be non-empty on ingest day; still keep the `asOf` demo clock.
6. NSE/Yahoo/screener may block datacenter IPs on Vercel — unverified; fallback = committed snapshots. Test the deployed runtime in Stage 1 end.

## Environment finding (blocker for scaffold)
**Node.js/npm are not installed** on this machine (checked PATH, Program Files, LocalAppData). `winget` is available. The Next.js scaffold is pending installation of Node LTS.

## Not yet verified
- Banks' screener tables (HDFCBANK page returned 200 but row set not parsed)
- LLM extraction quality on results PDFs (Stage 2, needs API key)
- Datacenter-IP access to NSE/Yahoo/screener
