# Stage 4 — Pull research pipeline (RELIANCE)

Scope: RELIANCE only. Arbitrary-ticker research API is deferred. Sources are primary only: the FY26 annual report PDF and the concall transcripts (Jan, Apr, Jul 2026; the Oct 2026 transcript is not linked on screener.in and is listed as unavailable). No news, broker notes or model knowledge.

## Principle: the model proposes, code disposes

| Step | Who | What |
|---|---|---|
| 1. Fetch + page split | code | `lib/research/pdfText.ts` (unpdf, 30-day cache in gitignored `data/raw`) |
| 2. Page selection (AR) | code | `arPages.ts`: 36 of 187 pages (MD&A, debt, contingent liabilities, auditor) |
| 3. Extraction | `gemini-3.5-flash-lite` | JSON schema output; transcripts split into presentation and Q&A; AR by topic. 10 calls |
| 4. Verification | code | verbatim quote located on a page (typography/hyphenation normalised); page corrected if the model cited the wrong one; speaker taken from the transcript turn header, never from the model; analyst turns excluded; restatement may not add numbers/acronyms absent from the quote; structured claim (value, comparator, unit, metric words, direction, yoy/qoq basis, horizon) re-derived from the quote, dropped if any part disagrees; period set by code from the document |
| 5. Metrics | code | `metrics.ts` from committed screener tables (FY = March column, not TTM). Operating profit is never labelled EBITDA |
| 6. Guidance vs actual | code | `guidance.ts`: a verdict only if metric, scope, period and growth basis match; otherwise `not_compared` (with reference figure and the definition mismatch) or `not_measurable` |
| 7. Synthesis (last) | `gemini-3.5-flash`, `thinkingLevel: low` | bull/bear/business points; every point must cite existing fact/metric IDs; points whose numbers, terms, periods, rise/fall wording or causal words are not in the cited items are discarded |
| 8. Assembly | code | `dossier.json` with coverage, drops, usage, limitations |

Four content kinds are kept distinct in data and UI: calculated metrics, extracted facts (quote + page), management statements (speaker + designation + page), model synthesis (badged "model-written").

## Comparator rule (user requirement)
Comparators ("more than", "at least", "approximately", "up to", "less than") are derived in code from the words adjacent to the number in the quote. If the model's comparator disagrees, or the number cannot be confidently mapped, the structured claim is dropped (the quote stays, unquantified). Management meaning is never repaired or inferred.

## Commands
```
npm run research:extract -- [--refresh] [--only transcripts|business_mdna|debt|contingent|auditor]   # API calls
npm run research:reverify      # offline re-verification of saved raw model output
npm run research:build -- [--refresh]   # metrics + guidance + dossier; --refresh redoes the synthesis call
```
Extraction files in `data/research/RELIANCE/extractions/` hold the raw proposals and the verified output, so verification can be re-run without tokens. `data/research/usage.jsonl` logs only token counts and timings.

## Actual usage (RELIANCE, all calls ever, incl. pilot and re-runs)
29 calls: 341,751 prompt tokens, 63,282 output tokens, 0 thinking tokens. Final persisted extraction set: 10 calls, 133,484 prompt / 26,356 output; synthesis: 6,464 / 764. Retried statuses: three 503 "high demand" (all recovered); no 429 quota errors. Models: extraction `gemini-3.5-flash-lite`, synthesis `gemini-3.5-flash`.

## Final coverage
160 proposed, 138 verified, 22 dropped (15 duplicate, 4 quote not found, 2 quote too long, 1 analyst turn). Facts: Jul-2026 call 31, Apr-2026 call 32, Jan-2026 call 24, FY26 annual report 51. 51 facts carry a verified structured claim; 49 have the model's restatement withheld (shown as quote only). 29 metrics. 42 guidance/claim items: 1 consistent, 6 not compared, 35 not measurable. Synthesis: business 3, bull 2, bear 3 (3 points discarded by guards).
