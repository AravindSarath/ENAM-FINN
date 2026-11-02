# FINN — Engineering conventions

Conventions for contributors and AI coding assistants working in this repository. For the architecture see `IMPLEMENTATION_PLAN.md`; for the product overview see `README.md`.

> Next.js here is v16, newer than most model knowledge. Read `AGENTS.md` and `node_modules/next/dist/docs/` before using framework APIs.

## Product
FINN is a mobile-first investment-intelligence app for a public-markets investor. **Push** shows what changed and why it matters (ranked, explainable alerts). **Pull** is on-demand research from primary sources only. The product's value is filtering, not aggregating.

## Principles
1. **Always runnable.** The app builds and runs from committed snapshots alone. Every external source (Yahoo, NSE, screener.in, the LLM) has a committed snapshot, and the UI never shows a raw error.
2. **Primary sources only for research.** Annual reports, concall transcripts and screener.in standardised financials. No news, broker notes or model knowledge of a company. Every research claim carries a citation (document, page, verbatim quote); uncited claims are dropped in code, not by prompting alone.
3. **Numbers come from code, narrative from the model.** The model never computes growth rates or ratios. Extract, verify, then calculate deterministically.
4. **Cost discipline.** Rules before models. A cheap model for bulk extraction, a stronger one only for synthesis. Log token counts for every call.
5. **Concise and honest UI.** Dense, designed, no placeholder copy presented as real. Sample, real and unavailable data are always labelled.

## Stack
- Next.js (App Router), React, TypeScript (strict), Tailwind CSS, framer-motion, hand-rolled SVG charts. Deployed on Vercel.
- Data: committed JSON snapshots in `data/`. Raw upstream responses and downloaded PDFs live in gitignored `data/raw/`.
- Ingestion and research scripts in `scripts/` (run with `tsx`).
- LLM: Gemini through `lib/research/llm.ts` (a `fast` and a `smart` model, set by environment variable); structured output via JSON schema, validated with zod.
- Secrets in `.env.local` only (`GEMINI_API_KEY`). Never commit them; keep `.env.example` current. The deployed app needs no secrets.

## Layout
```
app/          routes and API route handlers
components/   UI (mobile-first, bottom tab bar); components/research/ for the dossier
lib/data/     snapshot loaders, classification, grouping, scoring, digest, results, validation
lib/research/ transcript parsing, extraction, verification, metrics, guidance, synthesis
lib/sources/  Yahoo, NSE, screener.in and PDF adapters
scripts/      ingest, enrich, validate, research pipeline
data/         committed snapshots (prices, announcements, fundamentals, research)
docs/         methodology, verification and measurements
tests/        vitest suites and fixtures
```

## Engineering rules
- TypeScript strict. Validate all external and model data with zod at the boundary.
- Source adapters return `{data, source: "live"|"snapshot", asOf}`; the UI shows `asOf` subtly.
- Network calls: timeout and one retry, then snapshot. Be polite to NSE and screener.in (user agent, small concurrency, cache aggressively). Do not scrape LinkedIn.
- Dates: store ISO UTC, display IST. Money: ₹ crore with Indian grouping, tabular numerals.
- Demo clock: time windows are relative to a configurable `asOf` (default: the latest ingest), so the digest is never empty on a weekend.
- Keep files small and plain. No auth, database or state library beyond React.
- Run lint, typecheck, tests, the snapshot validator and a production build before every deploy.

## Data rules
- Revenue means reported Revenue from Operations from the filing. screener.in's revenue (net of excise) is a different definition and must be labelled; never mix definitions inside one row or across companies.
- PAT means total profit after tax including non-controlling interest; owners' profit is a separate field. If unverified, label it "Net profit (screener)".
- Operating profit is never EBITDA. A test fails if the UI says EBITDA without "not".
- Null with a reason, never a substitute. `npm run validate` and `npm test` must pass before a commit.

## Push intelligence rules
- Scores are additive, itemised and deterministic. Never use portfolio weights (illustrative) or the clock. Change a weight in `lib/data/materiality.ts` and `docs/PUSH_INTELLIGENCE.md` together; a test enforces it.
- Group filings only on strong evidence (same attachment, specific subject, near-identical text, same stated period). Keep every original reachable.
- A failed or missing PDF read must never make a filing routine. Routine needs a positive rule.
- Generated text states facts and sizes only: no beat/miss/strong/weak language. A test scans for it.

## Research rules
- Every fact has a verbatim quote and page. Every call statement has its speaker taken from the transcript header in code; analyst questions are never attributed to management.
- Never infer or repair a management statement's numerical meaning. Comparators (more than, at least, approximately, up to) are preserved, or the structured claim is dropped.
- Metrics and guidance verdicts are computed in code, and a verdict is issued only when definition, scope, period and basis match. Synthesis runs last, cites existing fact and metric IDs, is labelled model-written, and unsupported points are discarded.
- Commands: `npm run research:extract | research:reverify | research:build`. The key lives in `.env.local` only; a test fails if it appears in any file. Log only token counts.

## Definition of done
Works at 390px width, works from snapshots alone, has loading, empty and error states, numbers verified against a source, no console errors.

## Commands
`npm run dev` · `npm run build` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run validate` · `npm run ingest [-- --sym X --only prices|ann|fund --refresh]` · `npm run enrich` · `npm run research:extract | research:reverify | research:build`
