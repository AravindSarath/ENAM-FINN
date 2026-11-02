# RELIANCE ingestion: verification report (31 Oct 2026)

Scope: RELIANCE ingestion, verified before the other tickers were ingested. Snapshots: `data/prices/`, `data/announcements/`, `data/fundamentals/RELIANCE.json`, `data/manifest.json`.
Automated checks: `tests/verification.reliance.test.ts` encodes the filing comparison below (the suite had 71 tests when this report was written and has since grown). The announcement counts below are from the first ingest; the later re-ingest of the committed snapshot holds 17 RELIANCE items (see `DATA_COVERAGE.md`).

## 1. Quarterly results vs the original filing

**Filing:** Unaudited Consolidated and Standalone Financial Results, quarter / half year ended 30 Sep 2026, filed as the outcome of the board meeting on NSE, 30 Oct 2026 19:40 IST.
- NSE attachment: `https://nsearchives.nseindia.com/corporate/kavinavora_30102026193935_SE_30102026_Results.pdf`
- screener.in's "Raw PDF" link for Sep 2026 (`/company/source/quarter/2726/9/2026/`) redirects to the BSE copy `https://www.bseindia.com/xml-data/corpfiling/AttachLive/880087f6-7ecc-40a9-8cac-de48d4616b25.pdf`. **Both files are byte-identical (same MD5).** So screener's per-quarter source link is a valid provenance link to the original filing.
- Method: the PDF's text layer is column-scrambled, so each column was transcribed by hand, then proven by arithmetic identities (total income − total expenses = PBT; PBT − taxes = PAT; PAT + associates = PAT incl. associates; owners + NCI = PAT; expense lines sum to total). All identities hold for all three quarters, which rules out transcription slips.

**Basis and periods:** screener's page is **Consolidated** and its quarterly table ends at **Sep 2026 (period end 2026-09-30)**, with Jun 2026 and Sep 2025 as comparatives. The filing's three columns are exactly those quarters. The standalone figures differ (Sep 2026 PBT 20,339, PAT 15,354), confirming the snapshot is consolidated.

| ₹ crore, consolidated | Sep 2026 | Jun 2026 | Sep 2025 | Matches filing? |
|---|---|---|---|---|
| **Revenue** (screener "Sales") | 330,601 | 309,468 | 254,623 | **Only after a definitional adjustment, see finding A** |
| **Operating profit** | 56,616 | 47,517 | 45,885 | Reproducible from filing lines (finding B) |
| **PBT** | 38,613 | 30,630 | 29,124 | **Exact** |
| **PAT** | 29,550 | 23,196 | 22,092 | **Exact, but includes non-controlling interest** (finding C) |

Derived in code (not typed): Revenue QoQ +6.8%, YoY +29.8%; Operating profit +19.1% / +23.4%; PBT +26.1% / +32.6%; PAT +27.4% / +33.8%.

### Findings and resolutions
- **A. Screener "Sales" is not the filing's headline revenue.** The filing reports *Revenue from Operations* (net of GST) of **332,861 / 311,850 / 258,898**. Screener's Sales is that figure **minus excise duty** (2,260 / 2,382 / 4,275): 332,861 − 2,260 = 330,601, and the same for the other two quarters. So revenue growth differs: filing basis YoY **+28.6%**, screener basis **+29.8%**. Both are defensible, but the number must be labelled. *Resolution:* the reported Revenue from Operations (filing-verified, `data/filings/RELIANCE.json`) is the primary revenue figure for RELIANCE, and screener's figure is kept separately as "Revenue net of excise duty". Growth is calculated on one definition at a time, never mixed across them or across companies.
- **B. Operating profit** is not a line in the filing. Screener computes Revenue (ex-excise) − expenses (ex-excise, finance costs and depreciation). Recomputing from the filing: 330,601 − 273,985 = **56,616** (Sep 2026); 309,468 − 261,951 = 47,517; 254,623 − 208,738 = 45,885. All match. It is **not EBITDA**: it excludes other income (5,793 / 6,550 / 4,482). It is labelled "Operating profit" everywhere in the data layer and tests assert no "EBITDA" label.
- **C. "PAT" = profit after tax and share of associates/JVs, including non-controlling interest** (29,550). Profit attributable to **owners** is **25,548** (Sep 2026), 20,946, 18,165. *Resolution:* PAT including non-controlling interest is the primary figure, and profit attributable to owners (available only from the filing) is shown separately.
- **D. Reconciliation against the PDF was done by hand.** The test file preserves this verification. Automated extraction of reported figures is not implemented, so filing-verified figures exist for RELIANCE only.

## 2. Announcements (NSE)
- Source: `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=RELIANCE&from_date=01-10-2026&to_date=31-10-2026`; **18 items**, status ok, none skipped.
- **Timestamps:** all 18 converted IST → UTC were compared with NSE's own compact `dt` field (`ddmmyyyyHHMMSS`, IST): **0 mismatches**. Newest: 31 Oct 17:34:03 IST = 12:04:03Z.
- **Filing URLs:** all 18 attachment URLs return HTTP 200 (`nsearchives.nseindia.com`). Source text and URLs are preserved verbatim.
- **Classification (rules, no LLM):** audited by hand against the filing text. Correct: both results outcomes, the press release, credit rating, litigation order, NCD allotment (fund_raise), audio recording (earnings_call), trading-window / newspaper items (routine). Known limitations:
  - The 27 Oct notice that Jio Platforms listing starts on 28 Oct is classed `results` (its text also mentions the subsidiary's board meeting on results). It is material either way, but the label is imprecise.
  - 2 items are flagged `needsReview`: the investor presentation (text is only "informed the Exchange about Investor Presentation"; assumed to be the results deck, low confidence) and the Hamleys subsidiary strike-off (`M&A`, low). Two "Updates" filings with no recognisable content are `unclassified` and are routine only because their text positively matches a newspaper-clipping rule. Nothing unrecognised is treated as routine.
  - Result for the 18 filings: 6 results, 5 M&A (mostly the Jio Platforms IPO), 1 each of earnings call, press release, credit rating, litigation and fund raise, 2 unclassified; 3 flagged routine.
  - An item can be both routine and categorised (a newspaper clipping about the Jio IPO is `M&A` + `routine`); tiering must respect `routine`.
  - Keyword rules are coarse by design; a model could refine them, but none is used for classification.

## 3. Prices and volume (Yahoo `.NS`)
- Source: `https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=6mo&interval=1d`; 126 daily bars, currency INR, Asia/Kolkata, latest bar **2026-10-30 (Friday)**; the market was closed at ingest (`lastBarPartial: false`). No weekend dates; dates are exchange-local.
- The snapshot series was recomputed independently in Python straight from the raw response: **identical**.
- Latest close 1,164.90 vs screener's separately sourced Current Price ₹1,165: **consistent**.
- **Day move** −0.2142% (1,164.90 vs 1,167.40). **Volume multiple** 14,753,650 ÷ mean of the previous 20 sessions (15,184,654) = **0.972×**. Code and the independent Python calculation agree to 4 decimals. The latest day is excluded from its own average; with fewer than 20 prior sessions, or any missing volume, the multiple is `null`.
- These real values replace the mock's "RELIANCE +1.2%, 1.1×".

## 4. Hygiene
- `data/raw/` (raw HTML/JSON cache) is gitignored; `git check-ignore` confirms. No credentials are used by any adapter.
- Screener was fetched once (cached 24 h). Re-runs read the cache; `--refresh` bypasses it.

## 5. Limitations
- When this report was written only RELIANCE had been ingested. All 22 tickers were later ingested, including banks and NBFCs, which have no Operating profit row (see `DATA_COVERAGE.md`).
- Screener "OPM %" is rounded to integers by the source; compute margins from the rupee values instead.
- Yahoo volumes are consolidated exchange volume as Yahoo reports it; not cross-checked against NSE bhavcopy.
