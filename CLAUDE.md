# FINN — Project Instructions

ENAM Holdings AI Engineer Build Challenge. Deadline: **Sun 1 Nov 2026, EOD**. Specs in `specs/` (challenge.pdf, reference.pdf). Plan in `IMPLEMENTATION_PLAN.md`.

## What we are building
FINN: a mobile-first investment-intelligence product for a public-markets investor. **Push** (what changed and why you care) and **Pull** (on-demand, primary-source research). The scarce skill is *filtering*, not aggregating. Graded on product sense, judgment, architecture, cost efficiency. **Not** on completeness. A demo that doesn't run is the worst outcome.

> Next.js here is v16 (newer than most model knowledge): read `AGENTS.md` and `node_modules/next/dist/docs/` before using framework APIs.

## Non-negotiables
1. **Always runnable.** `main` must always deploy and demo. Every external dependency (Yahoo, BSE/NSE, screener, LLM) has a committed snapshot fallback. The UI never shows a raw error or spinner-forever.
2. **Thin and working beats broad and broken.** Cut features before cutting stability. Scope cut-line is in the plan.
3. **Pull is primary-source only.** Inputs to pull analysis: annual reports, concall transcripts, screener.in standardised financials. No news, broker notes, or model "knowledge" of the company. Every claim in a pull output carries a citation (doc, page, quote). Uncited claims are dropped in code, not by prompt alone.
4. **Generalise.** Research works for any NSE ticker with data. Nothing hard-wired to the demo set; demo tickers only get a pre-warmed cache.
5. **Numbers come from code, narrative from the LLM.** Never let an LLM compute growth rates or ratios. Extract → verify/reconcile against screener tables → compute deterministically.
6. **Cost discipline.** Rules before LLM. Cheap model for bulk extraction/classification, strong model only for reasoning (narrative-vs-numbers, bull/bear). Cache every LLM call by content hash. Batch small items. Target: whole demo runs on free tiers.
7. **No AI slop.** Concise, dense, designed. No generic chatbot, no walls of prose, no emoji decoration, no placeholder copy. Every screen answers "what matters, and what do I do?"

## Stack (decided)
- Next.js (App Router) + TypeScript, single repo, deployed on Vercel. Tailwind, framer-motion, hand-rolled SVG sparklines. PWA manifest (installable on phone).
- Data: committed JSON snapshots in `data/` (prices, announcements, fundamentals, enriched). Optional Upstash Redis for runtime cache; falls back to in-memory + committed cache.
- Ingestion scripts in `scripts/` (TypeScript, run with `tsx`). Same code is reused by runtime routes for ad-hoc tickers.
- LLM behind one interface `lib/llm.ts` with two tiers: `fast` and `smart`. Default provider Gemini free tier (long context suits transcripts); provider/model chosen via env, swappable. Structured output via JSON schema + zod validation.
- Secrets in `.env.local` only (`GEMINI_API_KEY`, optional `UPSTASH_*`). Never commit. Keep `.env.example` current.

## Layout
```
app/            routes + API route handlers (app/api/*)
components/     UI (mobile-first, bottom-tab shell)
lib/            llm.ts, classify.ts, score.ts, triggers.ts, sources/{yahoo,bse,nse,screener}.ts, pdf.ts, cache.ts
scripts/        ingest-*.ts, prewarm.ts
data/           committed snapshots; data/cache/ keyed by content hash
specs/          the brief (read-only)
```

## Engineering rules
- TypeScript strict. Validate all external/LLM data with zod at the boundary.
- Every source adapter returns `{data, source: "live"|"snapshot", asOf}`; the UI surfaces `asOf` subtly.
- Network calls: timeout 8s, one retry, then snapshot. Be polite to BSE/NSE/screener (UA header, small concurrency, cache aggressively). Do not scrape LinkedIn directly.
- Dates: store ISO UTC; display IST. Money: ₹ crore with Indian grouping; tabular numerals.
- Demo clock: all "last 24h" windows are relative to a configurable `asOf` (default = latest ingest), so the digest is never empty on a weekend/holiday.
- Keep files small and boring. No premature abstraction, no auth, no DB, no state libraries beyond React.
- Commit small, working steps. Run `next build` + a smoke test before every deploy.
- Record prompts and decisions as we go; the AI build history is a submission artifact. Keep conversation exports/links.

## Definition of done (per feature)
Works on a 390px-wide viewport, works offline-from-APIs via snapshot, has a loading + empty + error state, numbers verified against a source, no console errors.

## Commands (fill in as scaffolded)
Working: `npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint`. Planned (Stage 1+): `npm run ingest` · `npm run prewarm` · `npm run smoke`.
