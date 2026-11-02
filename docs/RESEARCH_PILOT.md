# Research pilot: one transcript, one model (31 Oct 2026)

One real extraction: RELIANCE Q1 FY27 media and analyst call transcript (17 Jul 2026, 32 pages), using `gemini-3.5-flash-lite`.
Source: the BSE-hosted PDF linked from screener.in. Output: `data/research/pilot/RELIANCE-concall-2026-07.json`.
The raw model output is in gitignored `data/raw/research/`. No API key appears anywhere in the repo.

## Model access

| Model | Result |
|---|---|
| `gemini-2.5-flash-lite`, `gemini-2.5-flash` | HTTP 404 "no longer available to new users" for this key |
| `gemini-3.5-flash-lite` | Works. Structured output valid. Used for extraction |
| `gemini-3.8-flash` | 40 s with hidden thinking, then 503 "high demand". Not used |
| `gemini-3.5-flash`, `gemini-3.6-flash` | Work for synthesis only with `thinkingLevel: "low"` (see below) |

## Measured usage

| Call | Prompt tokens | Output tokens | Thinking tokens | Latency | Attempts | Errors |
|---|---|---|---|---|---|---|
| Pilot extraction, 3.5-flash-lite | 22,906 | 6,602 | 0 | 13.5 s | 1 | none |
| Probe, 3.5-flash, default thinking | 202 | 14 | 670 | 5.1 s | 1 | truncated: thinking used the whole 700-token budget |
| Probe, 3.5-flash, thinking low | 202 | 114 | 0 | 1.7 s | 1 | none |
| Probe, 3.6-flash, default thinking | 202 | 14 | 670 | 4.8 s | 1 | truncated, as above |
| Probe, 3.6-flash, thinking low | 202 | 118 | 0 | 1.6 s | 1 | none |

No 429 (rate limit) was seen. At paid prices ($0.30 per 1M input, $2.50 per 1M output) the pilot call is about $0.023; on the free tier it cost nothing.

## Verification

- 38 statements proposed; 32 kept; 6 dropped (4 schema-invalid because a required field was missing, 2 duplicates). 0 quotes failed to match.
- All 32 quotes were found **on the cited page** by a second, independent PDF extractor (`pdftotext`).
- Speakers are derived in code from the transcript's own headers; all 32 are management turns with a designation from the call's participant list. No analyst text was attributed to management.
- Guardrails added after manual inspection (applied offline to the saved output, no new API call): a restatement may not add numbers or acronyms the quote lacks (caught "Rs. 1,17,000 Crores" where the speaker said "Rs.17,000 Crores", an invented "EBITDA", "RCPL", "RJIL"); structured numbers must be spoken in the quote; company-wide metrics may not be attached to a segment. 6 restatements and 4 structured fields were dropped; the quotes were kept.

## Gap found, and how it was addressed

All 32 facts come from pages 3–20 (the presentation). None come from the Q&A (pages 21–32), where most forward-looking answers are. The model stopped at its own item cap. The full RELIANCE run therefore extracts the presentation and the Q&A in separate calls, each with its own cap (see `RESEARCH_PIPELINE.md`).
