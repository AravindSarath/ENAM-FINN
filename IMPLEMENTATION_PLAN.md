# FINN — Architecture and implementation notes

How FINN is built, why it is built that way, and what is and is not implemented. For setup and commands see `README.md`; for the rules contributors follow see `CLAUDE.md`.

## 1. Product concept

**A briefing you triage, with a research desk behind every card.** The investor opens FINN and sees decisions rather than data: a ranked stack of what changed, each card answering "why does this matter". Any card opens into research with its context carried along. The product ranks ruthlessly, collapses routine filings, shows numbers with deltas and evidence, and is one tap from alert to research.

- **Push:** a windowed digest of exchange announcements and unusual price/volume moves, tiered Act / Noted / Routine with an itemised score, plus user-configurable alerts.
- **Pull:** on-demand research from primary sources only (annual report, concall transcripts, screener.in standardised financials), with a citation (document, page, verbatim quote) on every claim.

## 2. Screens (bottom tab bar, four tabs; the shell is a 430 px column, centred on desktop)

| Tab | What it does |
|---|---|
| **Brief** | Window chips (6h, 24h, 3d, 7d, custom, Unseen); alert banner when rules fire; digest headline built from counts and tickers; tiered feed. Cards: results (Revenue, Operating profit, PBT, PAT with QoQ and YoY), unusual move, management change (one labelled sample card), generic. Each card shows a score breakdown with evidence and source links. Actions: **Dig in** (opens Research with context), **Mute type**, **Done**; choices persist on the device |
| **Portfolio** | Heat map of 18 holdings by day move; sort by "needs attention", day move or weight; volume multiple; stock sheet with recent filings. Weights are illustrative and never used for ranking |
| **Research** | Ticker search and demo picks. Every research-set ticker shows real snapshot numbers; **RELIANCE has the full cited dossier** (section 6). Other tickers show the numeric sections and clearly labelled "not yet researched" sections |
| **Alerts** | Volume-multiple and %-move sliders, announcement-category toggles, live hit count, "Simulate a day" (adds one clearly labelled demo alert), and restore of muted or done items. Rules persist in `localStorage` |

Design: dark editorial theme with one restrained accent; semantic green/red only for deltas; tabular numerals; ₹ crore with Indian grouping; motion kept subtle. No emoji.

## 3. Architecture

```
 Ingest scripts (tsx)                         Runtime (Next.js on Vercel)
 ┌──────────────────────┐   data/*.json      ┌────────────────────────────────────┐
 │ Yahoo EOD ───────────┼──► prices          │ Server components read snapshots   │
 │ NSE announcements ───┼──► announcements   │ via lib/data/load.ts, then build   │
 │ screener.in ─────────┼──► fundamentals    │ the Brief, Portfolio, Alerts and   │
 │ NSE PDFs (page 1) ───┼──► enrichment      │ Research views (classify, group,   │
 └──────────────────────┘                    │ score, digest)                     │
 ┌──────────────────────┐                    │ /api/health                        │
 │ Research pipeline    │   data/research/   │ Alerts rules run in the browser    │
 │ (offline, Gemini)  ──┼──► <SYM>/dossier   └────────────────────────────────────┘
 └──────────────────────┘
```

- **Snapshot-first.** All data is ingested ahead of time and committed. The deployed app makes no upstream or Gemini calls, so it works without environment variables or network access to the sources. `/research/[sym]` is rendered on demand from committed files; `next.config.ts` traces exactly those files for the serverless bundle and excludes `data/raw/`.
- **Demo clock.** Windows are relative to `manifest.ingestedAt`, so the digest is never empty on a weekend or holiday.
- **Shared pure functions.** The rules engine (`lib/rules.ts`) is pure and shared by the Brief banner and the Alerts screen.

## 4. Data sources, verified behaviour and fallbacks

Details and evidence: `docs/DATA_SPIKE.md`, `docs/DATA_COVERAGE.md`, `docs/DATA_VERIFICATION.md`.

| Need | Source | Notes and fallback |
|---|---|---|
| EOD price and volume | Yahoo chart endpoint (`.NS`) | 126 daily bars per ticker; `.BO` was unreliable and is not used. Committed snapshots |
| Announcements | NSE corporate-announcements API (symbol-keyed, needs a date range) | The BSE announcements API returned 403 and was dropped. Committed snapshots |
| Fundamentals | screener.in company pages (HTML tables and document links) | Rate-limits at about one request per second, so ingestion is spaced 4–5 s and raw HTML is cached. No EBITDA row: Operating profit is used and labelled. Committed snapshots |
| Filing PDFs | NSE attachments (page-1 excerpts for classification); BSE-hosted annual reports and transcripts (research) | Raw PDFs stay in gitignored `data/raw/`; snapshots keep only short excerpts, URLs and provenance |

Demo set: 18 portfolio tickers (RELIANCE, HDFCBANK, ICICIBANK, TCS, INFY, SUNPHARMA, MARUTI, TITAN, LT, ITC, BAJFINANCE, ETERNAL, DIXON, POLYCAB, KPITTECH, HAL, SUZLON, VEDL) and 4 research tickers (ASIANPAINT, DMART, CDSL, TATAELXSI). All 22 were ingested with no source failures: 21 fully covered, 1 partially covered (TATAELXSI, using a standalone fallback).

## 5. Push pipeline

NSE filing → subject extraction → classification (NSE label, keywords, page-1 excerpt) → event grouping → additive score → tier. Prices → move statistics → move card → score. Key properties:
- Scores are deterministic, itemised and independent of portfolio weights and the clock (Act ≥ 55, Noted ≥ 30). Every weight and threshold is in `docs/PUSH_INTELLIGENCE.md`, and a test fails if the document and `lib/data/materiality.ts` drift.
- Filings group only on strong evidence (same attachment, specific subject, near-identical text, same stated period); every original filing stays reachable.
- A failed or missing PDF read never makes a filing routine; routine needs a positive rule.
- No model is used. Generated text states facts and sizes only, with no beat/miss language.
- Results cards need a stated reporting period in the filing text and a matching screener quarter; otherwise numbers are withheld with a reason. Reported figures (Revenue from Operations, PBT, PAT including NCI, owners' profit) are filing-verified for RELIANCE only; other companies use screener's figures under labels that say so.

## 6. Pull pipeline (RELIANCE)

Offline pipeline: fetch and page-split the documents → select annual-report pages → extract with `gemini-3.5-flash-lite` → verify in code → compute metrics → evaluate guidance → synthesise with `gemini-3.5-flash` last → assemble `dossier.json`. The principle is that the model proposes and code disposes: quotes, pages, speakers, comparators, units, periods and every number are verified or derived in code, and a failed check drops the claim rather than repairing it. Four content kinds stay distinct in data and UI: calculated metrics, extracted facts, management statements and model synthesis. Full detail, measurements and limitations: `docs/RESEARCH_PIPELINE.md`, `docs/RESEARCH_VERIFICATION.md`, `docs/RESEARCH_PILOT.md`.

Result: 3 concall transcripts and 36 annual-report pages → 138 verified facts, 29 deterministic metrics, 42 guidance items (1 consistent, 6 not compared, 35 not measurable) and model-written bull/bear points with cited sources. 29 Gemini calls, 341,751 prompt and 63,282 output tokens, three 503 retries, no 429.

## 7. Key technical decisions

- **Snapshot-first over live calls:** the app cannot fail on an upstream outage; the cost is staleness (data as of 30 Oct 2026).
- **Rules before models:** Push needs no model; research uses a cheap model for bulk extraction and a stronger one only for synthesis, within the free tier. Calls are logged as token counts only.
- **Numbers from code, with labelled definitions:** reported Revenue from Operations is primary where filing-verified and screener's net-of-excise revenue is kept separately; PAT includes non-controlling interest with owners' profit separate; Operating profit is never called EBITDA.
- **Null with a reason:** unavailable data is shown as unavailable, never substituted.
- **NSE over BSE** for announcements, because BSE's API is blocked.
- **Verification over breadth:** research is complete and verified for one company rather than shallow for many.

## 8. Implementation status

| Area | Status |
|---|---|
| Data ingestion for 22 tickers, validator, manifest | Built |
| Push intelligence (classification, grouping, scoring, digest, alerts) | Built; filings no rule recognises stay Noted (9 at the time of the classification measurement, see `docs/DATA_COVERAGE.md`) |
| Research dossier | Built for RELIANCE; other tickers show real numeric sections only |
| Management-change bio | Sample card only (not built) |
| Ask bar (grounded Q&A) | Not built |
| Arbitrary-ticker research API | Not built |
| PWA manifest, real push notifications, auth, intraday data | Not built |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Upstream blocks or changes an API | Ingest ahead of time, commit snapshots, no dependency on live calls at runtime |
| screener.in markup changes or rate limits | Cached HTML, defensive parsing, slow ingestion, snapshots |
| PDF text quality | Numbers from screener tables; model extraction only for text and guidance; verbatim quote verification on the cited page |
| Model hallucination on research | Quote and page verification, speaker and period derived in code, citation validation, synthesis points discarded if unsupported |
| Free-tier limits | Offline pipeline, measured token usage, retries on 503 |
| Serverless limits on Vercel | Read-only committed data, explicit file tracing, no runtime model calls |

## 10. Out of scope

Authentication, multi-user support, real push notifications, intraday data, LinkedIn scraping, news or broker data, valuation modelling, trading and backtesting.

## 11. Possible next steps

Extend the research pipeline to more companies behind a resumable job runner; extract reported figures for all companies; management-change bios; portfolio-aware ranking that learns from dismissals; live alerts.
