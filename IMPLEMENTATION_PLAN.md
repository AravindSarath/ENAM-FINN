# FINN — Implementation Plan

## 1. Requirements digest
**Deliverables:** mobile-first working prototype (deployed link, phone-friendly), GitHub repo, AI build history, covering-email writeup (built / decisions & trade-offs / left out / next) to assessment@enam.com, subject `ENAM - IIT screening - 2027`.

**Graded on:** product sense, creativity, judgment, architecture, cost efficiency (bonus). Not completeness. Working > broad.

**Must have**
- Portfolio of 15–20 NSE/BSE stocks (mixed sector/size) + 3–5 ad-hoc research tickers; research generalises to any NSE ticker.
- Data: EOD price/volume, exchange announcements, fundamentals (annual reports + concall transcripts via screener.in).
- Push: windowed digest (default 24h, user-selectable) filtered and prioritised; triggered alerts (material announcement types; configurable volume-multiple and %-move thresholds).
- Showcase pushes: management change with incoming person's bio; quarterly results with Revenue/EBITDA/PBT/PAT QoQ and YoY.
- Pull: menu of 8 outputs (business, financials, trajectory, balance sheet, cash quality, narrative-vs-numbers, guidance, bull/bear). **Primary sources only.** Promised-vs-delivered over last 4 quarters is the highest-value item.
- Interaction model with a point of view; no generic chatbot/dashboard.

## 2. Product concept
**"A briefing you triage, with a research desk behind every card."**
The investor opens FINN and sees *decisions*, not data: a ranked stack of what changed, each card already answering "why care". Any card can be pulled open into research ("dig in") with the context carried along. Chat is a secondary entry point (command bar), not the product.

Principles: rank ruthlessly; collapse the routine; show numbers with deltas and evidence; one-tap from push → pull.

### Screens (bottom tab bar, 4 tabs)
1. **Brief** (home, Push). Window chip (6h / 24h / 3d / 7d / custom). Top: alert banner if triggers fired. Body: tiered feed — **Act** (expanded cards), **Note** (one-liners), **Routine** (single collapsed row "14 routine filings across 9 companies", expandable). Card types:
   - *Results card*: Revenue / EBITDA / PBT / PAT, QoQ & YoY deltas, margin, beat/miss colour, mini 8-quarter spark, "Open filing".
   - *Management-change card*: who left, who joined, role, short bio (background, previous roles), source link.
   - *Market-move card*: volume ×avg or % move, with what filed that day.
   - *Generic card*: category pill, one-line "so what", priority reason, filing link.
   - Swipe/tap actions: **Dig in** (→ Research with context), **Mute type for this company**, **Done**.
2. **Portfolio**. Holdings heat-strip (day move, volume-multiple dots), sorted by "needs attention". Tap a stock → stock sheet: price/volume chart, recent filings, "Research" button.
3. **Research** (Pull). Ticker search (any NSE symbol) + recents + demo picks. Dossier page = vertical stack of collapsible evidence-linked sections: Snapshot, Trajectory, Balance sheet, Cash quality, **Promised vs delivered** (hero), Guidance, Bull/Bear. Progress streams while a new ticker is analysed. Floating **Ask** bar: grounded Q&A over that company's extracted facts only, answers cite sources.
4. **Alerts**. Rule builder: volume multiple (default 2×), price move ±X% (default 4%), announcement categories (toggles), scope (all / per stock). Fired-alert inbox. Rules persisted in localStorage. "Simulate a day" button replays a trigger for demo reliability.

Shell: on desktop render inside a 420px phone frame so reviewers see mobile design. PWA installable.

### Design direction
Editorial, dark-ink background with one restrained accent; semantic green/red only for deltas; tabular numerals; ₹ crore Indian grouping; generous hierarchy over borders; subtle motion (card expand, number count-in). Density where it counts, whitespace where it breathes. No gradients-for-decoration, no emoji.

## 3. Priorities
| Tier | Push | Pull |
|---|---|---|
| **P0 (must ship)** | Windowed digest with tiering + scoring; results card (4 metrics QoQ/YoY); EOD triggers (volume, % move) + category alerts; configurable rules | Financial snapshot, trajectory, balance sheet, cash quality (deterministic from screener tables); **Promised vs delivered** (4 quarters, transcripts); Guidance; Bull/Bear; citations; any-ticker support |
| **P1 (if time)** | Management-change card with bio; one-line summaries for Note tier; mute/done actions | Business snapshot (AR); grounded Ask bar; narrative-vs-numbers divergence flags |
| **P2 (cut)** | Real web-push notifications; voice; LinkedIn scraping; multi-user/auth; backtests | Peer comps; any non-primary source |

**Cut line:** if behind at end of Stage 3 (T+10h), drop P1 and polish P0.

## 4. Architecture
```
 Ingest scripts (tsx)                       Runtime (Next.js on Vercel)
 ┌──────────────────────┐   data/*.json    ┌──────────────────────────────────┐
 │ Yahoo EOD  ──────────┼──► prices        │ /api/digest?window=  (read+score) │
 │ BSE (NSE) announce ──┼──► announcements │ /api/triggers        (rules→hits) │
 │ screener.in ─────────┼──► fundamentals  │ /api/stock/[sym]                  │
 │ PDFs (AR/concall/    │      + doc text  │ /api/research/[sym]  (SSE, cached)│
 │ results) → LLM facts─┼──► enriched      │ /api/ask             (grounded)   │
 └──────────────────────┘   cache/<hash>   └───────────────┬──────────────────┘
        ▲ same adapters reused for ad-hoc tickers ─────────┘
```
**Key pipeline decisions**
- **Snapshot-first.** Demo data is ingested ahead of time and committed; live fetch is an enhancement. Guarantees a running demo.
- **Announcement classification:** rules on exchange category/subcategory + headline regex mapped to the reference taxonomy (adapted: merge/drop to ~14 categories); LLM (`fast`) only for `unclassified` leftovers.
- **Priority score (deterministic, explainable):** `category_weight × user_pref × position_weight × (1 + market_reaction)` where market_reaction = |day move| and volume-multiple on filing day. Maps to Act / Note / Routine. The "why this ranks here" reason string is shown on the card — judgment made visible.
- **Results extraction:** filing PDF → text → `fast` LLM extracts Revenue/EBITDA/PBT/PAT (current qtr, prior qtr, year-ago qtr if present) into a zod schema → **reconciled against screener quarterly table** (Sales, Operating Profit, PBT, Net Profit are there for 12 quarters). Deltas computed in code. Mismatch beyond tolerance → show screener value with a small "filing differs" flag. Standalone vs consolidated: prefer consolidated, label it.
- **Management-change bio:** extract name/role from filing (`fast`); bio via LLM with search grounding if available, else Wikipedia/company IR page; precomputed for demo set; if nothing found show filing facts only and say so. No direct LinkedIn scraping (ToS/blocking).
- **Pull pipeline (any ticker):** resolve symbol → screener page (tables + document links) → fetch last 4 concall transcripts + latest annual report → PDF text, chunked by section with page refs → `fast` extraction per doc into **facts** `{type: guidance|result_commentary|risk|segment|capex, text, quote, doc, page}` → `smart` synthesis from facts + screener numbers only, schema-enforced, each statement must reference fact ids → validator drops uncited/unknown-id statements. Promised-vs-delivered: guidance facts from quarter *t* matched to actuals from quarter *t+1…* (computed in code from screener tables) → verdict per item: delivered / partially / missed / not-yet-measurable.
- **Caching:** key = hash(doc bytes + prompt version + model). Committed `data/cache/` for demo tickers; Upstash (optional) for new tickers; in-memory otherwise. Re-runs cost zero.
- **Model routing:** `fast` (Gemini Flash-Lite class) for classification, extraction, one-liners (batched per company-day); `smart` (Gemini Flash/Pro class) only for synthesis. Provider swappable by env. Log tokens/calls per run → show "analysed with N calls, ~₹X" in the writeup as an efficiency proof.
- **Triggers:** pure function `evaluate(rules, prices, announcements) → hits`, run at ingest and on load. Volume vs 20-day average; % move vs previous close; category match for the user's selected types. Unit-tested.

## 5. Data sources and fallbacks
| Need | Primary | Fallback |
|---|---|---|
| EOD price/volume | Yahoo chart endpoint / `yahoo-finance2` (`.NS`, `.BO`) | committed `data/prices/*.json`; if `.NS` empty try `.BO` |
| Announcements | **NSE corporate-announcements API** (symbol-keyed, works without cookies, always pass a date range). BSE API is 403-blocked (Akamai) — dropped. *(Stage 0 verified, see `docs/DATA_SPIKE.md`)* | committed `data/announcements/*.json` |
| Fundamentals | screener.in company page (HTML tables + document links; consolidated first). **Rate-limits at ~1 req/s (429): ingest at ≥4–5 s spacing with backoff, cache raw HTML.** No EBITDA row → use Operating Profit, labelled | committed `data/fundamentals/*.json`; PDFs cached as extracted text |
| PDFs | direct fetch of BSE/IR links → `unpdf`/pdfjs text | pre-extracted text in cache; skip doc with a visible "unavailable" |
| Person bio | LLM + search grounding / Wikipedia | filing facts only |

Stage 0 is a **data spike with a go/no-go**: confirm each source returns real data for 3 tickers before building anything on it.

## 6. Demo set (candidates — validate in spike)
**Portfolio (18):** RELIANCE, HDFCBANK, ICICIBANK, TCS, INFY, SUNPHARMA, MARUTI, TITAN, LT, ITC, BAJFINANCE, ETERNAL, DIXON, POLYCAB, KPITTECH, HAL, SUZLON, VEDL — large/mid/small; banks, IT, pharma, auto, consumer, capital goods, a high-pledging name (VEDL) and a volatile small-cap (SUZLON) for interesting alerts.
**Ad-hoc research (4):** ASIANPAINT, DMART, CDSL, TATAELXSI. Plus a "try any ticker" demo on a symbol not pre-warmed (proves generality). Swap out any symbol whose data fails the spike.

## 7. Stages (time-boxed; today is 31 Oct, ~27h to deadline)
| Stage | Hours | Output | Acceptance |
|---|---|---|---|
| **0. Spike & scaffold** ✅ DONE | 1.5 | Spike (`docs/DATA_SPIKE.md`): Yahoo, NSE, screener, PDFs work; BSE blocked. Scaffold: Next.js 16.4 + React 19 + TS strict + Tailwind 4 (no `src/`, `@/*` alias), deps `zod cheerio framer-motion unpdf` + dev `tsx`; placeholder page, `/api/health`, `.claude/launch.json`, folder skeleton, `.env.example`, git init (no commits) | Verified: `npm run build`, `typecheck`, `lint` pass; dev server serves `/` and `/api/health`; `npm audit --omit=dev` = 0 vulns |
| **1. Frontend shell (mock data)** ✅ DONE, awaiting review | 3 | Design system (ink/ivory/gold tokens, Instrument Serif + Geist), 4-tab shell, **Brief** (window chips incl. custom, Act/Noted/Routine tiers, results/management/move cards, Dig in / Mute type / Done, alert banner), **Portfolio** (heat map, sort, stock sheet), **Research** (any-ticker search, RELIANCE sample dossier with citation chips, promised-vs-delivered layout), **Alerts** (volume and %-move sliders, category toggles, live hit count, simulate, saved in localStorage). All mock data labelled in-UI (`lib/mock.ts`); Reliance results and 5-quarter series are real from the Stage 0 snapshot | lint, typecheck, build pass; no console errors; checked at 375px: navigation, tier filtering by window, sheet, dossier, threshold change 9→6 alerts and persistence |
| **1b. Ingest & snapshot** ✅ DONE | 2.5 | All 22 tickers (18 portfolio, 4 research) ingested with 0 source failures; `npm run validate` and 129 tests pass. Brief, Portfolio, Alerts and Research now read the snapshots. Decisions applied: primary Revenue = reported Revenue from Operations (filing), screener's net-of-excise revenue kept separately; PAT incl. NCI primary with owners' profit separate; operating profit never labelled EBITDA. See `docs/DATA_COVERAGE.md` and `docs/DATA_VERIFICATION.md` | RELIANCE results verified against the filing; others use screener figures under labels that say so. Known gaps listed in the coverage doc (TATAELXSI standalone fallback, ETERNAL results not identifiable by rules, HAL/ITC/TITAN pre-results) |
| **3. Push intelligence** ✅ DONE (this stage absorbs the old "Push core" and "Triggers & alerts" rows) | 4 | Subject extraction; classifier v2 with evidence on every label; page-1 PDF excerpts for 60 ambiguous filings; strict event grouping; additive explainable materiality score (weights in `docs/PUSH_INTELLIGENCE.md`); unusual-move statistics; template digest with 6h/24h/3d/7d/custom/Unseen windows; persisted Done/Mute/seen; merged price-and-volume alerts; results trend lines. No LLM. | Unclassified non-routine filings 44 → 9; review flags 55 → 9; 15 results cards with numbers; 200 tests, validator, lint, typecheck and build pass; mobile-width browser pass. Before/after in `docs/DATA_COVERAGE.md` |
| **4. Pull core** | 4.5 | Doc pipeline, facts extraction, synthesis, dossier UI with citations; promised-vs-delivered | New ticker produces a dossier end-to-end; every statement has a working citation; demo tickers pre-warmed |
| **5. P1 & polish** | 3 | Mgmt-change card + bio, Portfolio tab, Ask bar (if time), motion, empty/error states | 390px pass on real phone; no console errors; Lighthouse sane |
| **6. Ship** | 2 | Vercel deploy, smoke test, README, writeup, export AI build history | Fresh-device test of deployed URL; submission email sent before EOD |
Buffer: ~3h. Deploy a thin version at end of Stage 2 and redeploy after each stage.

## 7a. Environment notes
- Node v26.13 / npm 11.20 at `C:\Program Files\nodejs`. Already-open shells/sessions may need `$env:Path += ";C:\Program Files\nodejs\"` until restarted.
- Scaffold's experimental `cacheComponents`/`partialPrefetching` flags were removed from `next.config.ts` (they force Suspense on all dynamic data; not worth the risk).
- Next 16 docs ship in `node_modules/next/dist/docs/`; see `AGENTS.md`.
- Dev-server tip: `localhost` may resolve to IPv6 for curl; use `127.0.0.1`.

## 7b. Stage 1 notes (frontend)
- Routes: `/` Brief, `/portfolio`, `/research`, `/research/[sym]?from=`, `/alerts`. Tab bar is fixed; shell is a 430px column (centred on desktop).
- Data is behind `lib/mock.ts`; swapping to snapshots means replacing `HOLDINGS`, `FEED`, `RELIANCE_DOSSIER` with loaders of the same shape (`lib/types.ts`).
- Rules engine (`lib/rules.ts: evaluate`) is already pure and shared by Brief banner and Alerts screen.
- Honest gaps: only RELIANCE has a dossier; other tickers show a pipeline preview then a "not connected" state. Balance sheet, cash quality, guidance sections are placeholders. Promise text and quote excerpts in the dossier are placeholders; delivered figures are real.
- Not built: mgmt-change bio is sample text; Ask bar; Business snapshot; PWA manifest; real push notifications.

## 7c. Stage 2 notes (data wiring)
- Pipeline: `scripts/ingest.ts` → `data/{prices,announcements,fundamentals}` + `data/filings/RELIANCE.json` (hand-transcribed, verified) + `data/manifest.json`. `lib/data/view.ts` builds the Brief feed and holdings; `lib/data/results.ts` builds results cards; `lib/data/score.ts` tiers; `lib/data/classify.ts` classifies (NSE structured labels are authoritative; free-text labels use keyword rules).
- The demo clock is `manifest.ingestedAt`. Windows are relative to it.
- Results cards need a stated reporting period in the filing text and a matching screener quarter; otherwise numbers are withheld with a reason.
- Repeated filings with the same NSE label within 72h fold into one card; results follow-ups (press release, deck, call material) fold into the results card.
- Still sample: the KPITTECH management-change card (bio needs the LLM stage); portfolio weights are illustrative; dossier "promised" text and placeholder excerpts.
- Still missing (needs LLM): reported-figure extraction for companies other than RELIANCE, owners' profit for them, management bios, summaries, concall/AR analysis.

## 7d. Stage 3 notes (push intelligence)
- Scoring is deterministic and independent of the illustrative portfolio weights; thresholds Act ≥ 55, Noted ≥ 30. A test keeps `docs/PUSH_INTELLIGENCE.md` in step with `lib/data/materiality.ts`.
- Grouping merges only on the same attachment, a specific subject, near-identical text, or a stated reporting period. Every original filing stays reachable with the reason it was grouped.
- PDFs live in gitignored `data/raw/`; snapshots keep only a short excerpt, URL and time. A failed read never makes a filing routine.
- New commands: `npm run enrich` (reads page 1 of ambiguous attachments, then re-classifies).
- Remaining gaps: 9 filings are still unclassified (they stay Noted); results numbers for non-RELIANCE companies are screener's, not filing-verified; no interpretation of results by design; real push notifications, bios and summaries wait for the LLM stage.

## 8. Risks and mitigations
| Risk | Mitigation |
|---|---|
| BSE/NSE blocks or changes API | BSE primary, snapshot fallback, ingest ahead of time; never depend on live at demo |
| screener.in markup/rate limits/login-gated links | Cache HTML; parse defensively; low concurrency; fallback snapshots; skip doc with visible notice |
| PDF text quality (scanned/odd tables) | Prefer screener tables for numbers; LLM extraction only for text/guidance; flag low-confidence |
| LLM hallucination or outside knowledge on pull | Facts-with-quotes pipeline, citation validator, "sources only" prompt, numbers from code |
| Free-tier rate limits/latency | Prewarm demo set; cache by hash; batch calls; stream progress for new tickers; serverless timeout → run pipeline in stages across requests |
| Weekend/holiday → empty 24h digest | Configurable `asOf` demo clock anchored to latest ingest |
| Vercel serverless limits (timeout, no writable FS) | Committed cache read-only + Upstash/in-memory write; chunk pipeline into resumable steps |
| Scope creep / over-polish | Cut line in §3; P2 is off-limits |
| Unverified ticker symbols (renames/demergers) | Validate in spike; swap freely |

## 9. Out of scope (state this in the writeup)
Auth, multi-user, real push notifications, intraday data, LinkedIn scraping, news/broker data, valuation modelling, trading, backtesting.

## 10. Submission checklist
- [ ] Deployed URL works on a phone, cold start included
- [ ] Repo public/shared, README with run steps and architecture sketch
- [ ] AI build history exported (Claude Code sessions + any chat links)
- [ ] Covering note: what built, key decisions/trade-offs (snapshot-first, code-computed numbers, cited facts, routing), what's left out, next steps (live alerts, portfolio-aware ranking learning from dismissals, voice, more doc types)
- [ ] Email to assessment@enam.com, subject `ENAM - IIT screening - 2027`
