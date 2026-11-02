# Push intelligence

How FINN decides what to show, in what order, and why. Everything here is deterministic, rule-based and
reproducible from the committed snapshots. There is no LLM, and nothing interprets a filing: the product states
what arrived, how big a number changed, and which source says so.

`tests/materiality.test.ts` fails if the tables below drift from `lib/data/materiality.ts`.

## Pipeline

```
NSE filing ─► subject extraction ─► classify (label → keywords → page-1 excerpt) ─► event grouping ─► score ─► tier
 Yahoo prices ─► move statistics ───────────────────────────────────────────────────────────────► move card ─► score
```

1. **Subject extraction** (`lib/data/enrich.ts`). NSE often quotes the event subject in its text. It is stored as `subject`.
2. **Classification** (`lib/data/classify.ts`). NSE's structured labels such as "Acquisition" or "Cessation" are authoritative.
   Free-text labels use keyword rules on label, text and subject. Every result records its **evidence**: the matched phrase and
   where it came from (`label`, `subject`, `text` or `pdf`).
3. **PDF page-1 excerpt** (`scripts/enrich.ts`, `lib/sources/pdf.ts`). Only for filings still unclassified or weakly classified,
   most urgent first. Two concurrent downloads, 45 s timeout, retry with back-off. PDFs stay in the gitignored `data/raw/`; only a
   normalised excerpt (at most 1,500 characters), its URL and the extraction time are committed. The excerpt can add or confirm a
   category with medium confidence. It can never make a filing routine, and a failed read leaves the filing exactly as it was.
4. **Grouping** (`lib/data/group.ts`). See below.
5. **Scoring** (`lib/data/materiality.ts`). See below.

## Grouping: only on strong evidence

Two filings merge only when one of these holds. Sharing a symbol, a category and a time window is never enough.

| Kind | Evidence required |
|---|---|
| `same_attachment` | The very same attached document. |
| `same_subject` | The same specific subject within 72 hours. A subject is specific only if it is not generic, not NSE's own label, and not a filing type that recurs 3 or more times across the data (such as "Schedule of meet"). |
| `same_text` | Near-identical informative text (Jaccard similarity at least 0.85 over at least 8 words), the same NSE label, within 72 hours. Uninformative boilerplate never counts. |
| `same_period` | A follow-up to a results board outcome (press release, presentation, call material) that states the same reporting period in its own text or its PDF excerpt, from 1 hour before to 7 days after the outcome. |

The primary filing of a cluster is the highest-ranked one (a results outcome first). Every other filing stays reachable from the
card with its own link and the reason it was merged. A test checks that every original filing appears exactly once.

## Materiality score

Starts from the category, then adds itemised adjustments. The score is clamped to 0–100. The portfolio weights are
illustrative and are **never** an input. User thresholds and the clock are not inputs either.

### Category weights

| Category | Weight |
|---|---|
| `results` | 65 |
| `management_change` | 60 |
| `litigation` | 60 |
| `M&A` | 60 |
| `pledging` | 60 |
| `bonus_split` | 55 |
| `fund_raise` | 35 |
| `credit_rating` | 35 |
| `dividend` | 35 |
| `capex` | 35 |
| `insider_trading` | 35 |
| `press_release` | 35 |
| `postal_ballot` | 35 |
| `agm_egm` | 35 |
| `unclassified` | 30 |
| `earnings_call` | 10 |
| `investor_meetings` | 10 |

### Classifier confidence

| Confidence | Adjustment |
|---|---|
| `confidence.high` | 0 |
| `confidence.medium` | -3 |
| `confidence.low` | -15 |

### Modifiers

| Modifier | Points |
|---|---|
| `pdfInferred` | -5 |
| `seniorRole` | 10 |
| `scheduledTerm` | -25 |
| `resultsNotice` | -25 |
| `resultsRelated` | -15 |
| `resultsNumbersWithheld` | -5 |
| `changeLarge` | 15 |
| `changeNotable` | 8 |
| `volume3x` | 15 |
| `volume2x` | 10 |
| `move7` | 15 |
| `move4` | 10 |
| `reactionCap` | 25 |
| `moveCardBase` | 55 |
| `sigma3` | 10 |
| `consecutive` | 5 |

- `pdfInferred`: the category came only from page 1 of the attachment.
- `seniorRole`: a management filing naming a CEO, CFO, COO, CTO, CIO, CHRO, any "Chief … Officer", Managing Director, Chairman, Whole-time Director or Company Secretary.
- `scheduledTerm`: a director completing a scheduled term ("completed his 2nd term").
- `resultsNotice`: a board-meeting date notice rather than the outcome.
- `resultsRelated`: a results-related filing that is not the outcome and states no period.
- `resultsNumbersWithheld`: a results outcome whose numbers could not be shown (period mismatch or missing data).
- `changeLarge` / `changeNotable`: the largest absolute change among Operating profit, PBT and PAT, quarter on quarter or year on year, is at least 30% / 15%. **Size only: it says nothing about good or bad.**
- `volume3x` / `volume2x` / `move7` / `move4`: market reaction in the session that could reflect the filing (a filing in the 36 hours before the close). Only for categories that can move a stock. Total capped at `reactionCap`.
- `moveCardBase`, `sigma3`, `consecutive`: unusual-move cards. The base applies when no non-routine filing precedes the session. `sigma3` applies when the move is at least 3 times the stock's own typical daily move. `consecutive` applies when the previous session was also unusual.

### Thresholds and floors

| Threshold | Value |
|---|---|
| `act` | 55 |
| `noted` | 30 |
| `routineCeiling` | 20 |
| `visibilityFloor` | 30 |
| `changeLargePct` | 30 |
| `changeNotablePct` | 15 |
| `volume2x` | 2 |
| `volume3x` | 3 |
| `move4Pct` | 4 |
| `move7Pct` | 7 |
| `sigma3` | 3 |

- **Act** at 55 or more, **Noted** at 30 to 54, **Routine** below 30.
- **Routine ceiling:** a filing positively identified as routine paperwork (trading window, newspaper clipping, ESOP, compliance certificate, auditor appointment, ESG report, share-certificate loss, monitoring-agency report) never scores above 20.
- **Visibility floor:** every other filing, except call material and investor-meeting notices, never scores below 30. Unrecognised and weakly evidenced filings therefore stay visible. A failed PDF read cannot lower anything.
- Floors and ceilings appear as their own line in the breakdown, so the points always sum to the score.

## Unusual moves

`lib/data/moves.ts` computes, from the price snapshot only: the move as a multiple of the stock's own typical daily move (standard
deviation of up to the 60 prior sessions), how many sessions the move is the largest in its direction, and how many earlier
sessions in a row were also unusual. A card appears when volume or price crosses the default thresholds (2× volume, ±4%) and no
non-routine filing precedes the session. Volume and price merge into one card or alert per stock per session. Your own thresholds
live on the Alerts tab.

## Digest

`lib/data/digest.ts` builds a headline from counts and ticker names only ("2 results filings (RELIANCE, DIXON), 1 unusual move
(SUZLON)."), a "N filings → M cards" line, and the three highest-scoring cards. The windows are 6h, 24h, 3d, 7d, a custom length, and
**Unseen** (cards you have not marked as seen). Done, Mute type and seen are kept on the device and can be restored on the Alerts tab.

## What this does not do

- It does not say whether results are good or bad, beat or missed anything, or what management meant. There is no consensus data and no interpretation.
- It does not use the illustrative portfolio weights.
- It does not read full PDFs, only page 1 of those that need it.
- Rule-based classification is coarse. Filings no rule recognises stay Noted rather than hidden.

## Measured effect

See the before/after table in `docs/DATA_COVERAGE.md`.
