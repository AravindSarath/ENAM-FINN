# RELIANCE research dossier: verification

## 1. Automated (in `npm test`, tests/research-dossier.test.ts and siblings)
- Every fact: verbatim quote (≤400 chars, no ellipsis) contained in its stored context; page within the document; HTTPS source URL; document kind matches.
- Every call statement: management speaker identified from the transcript header; none attributed to an analyst; annual-report facts have no speaker.
- Every structured claim re-validated from scratch against its quote.
- Metrics and guidance verdicts equal a fresh recomputation from committed data. EBITDA/topline are never compared with differently-defined series.
- Synthesis: all cited IDs exist; whole synthesis re-passes today's validator with zero drops.
- Usage totals add up; secrets scan (key from `.env.local` and `AIza…` patterns) over all tracked-type files; usage log contains only counts and timings.

## 2. Independent check against the PDFs
Each of the 138 quotes was searched in the cited page of the source PDF using `pdftotext -raw` (a different extractor from the one used in the pipeline): **138/138 found on the cited page** (FY26 51/51, Apr-2026 32/32, Jan-2026 24/24, Jul-2026 31/31). Default `pdftotext -layout` found 122/144 in an earlier pass; the misses were two-column reading-order differences, not content differences, which is why `-raw` is the reference.

## 3. Manual inspection
A stratified sample of 12 facts (all kinds, both calls and annual report) and every synthesis point were read against their sources.
Confirmed correct: e.g. auditor p133 JDFPL preference shares ₹77,852 crore; business p41 "524 Mn+ digital subscribers"; Apr call (Anshuman Thakur) "revenue for the year at Rs.1,46,085 Crores, which was up 14.6% year-on-year"; Jan call dark-store "less than 30%" stored as `at_most`.

Problems found, and what was done:
- Restatements occasionally invented figures or terms ("Rs. 1,17,000 Crores" for "Rs.17,000 Crores"; "EBITDA"; "RCPL"). Added restatement guard; 49 restatements are now withheld and the quote alone is shown.
- Comparator misapplied ("more than 54,000 … up 10%" tagged at_least on 10). Comparator is now derived from adjacent words; mismatches drop the claim.
- Synthesis v1 mixed periods (quarter margin described as FY26), added causal glue, and used unsupported "increased"/"EBITDA … year-on-year". Added period labels, causal-word, term and direction guards; reran.
- Some annual-report quotes are garbled table rows (e.g. "EBITDA ₹19,050 Crore 10.1%"). They are verbatim from the PDF text layer, so they pass; their restatement is withheld.

## 4. Known gaps (not hidden in the UI)
- Auditor (7) and contingent-liability (8) coverage is thin; related-party facts not extracted.
- Extraction recall is capped per call; not every figure on a call is captured.
- Only one tested guidance verdict: growth basis is often unstated, revenue/EBITDA definitions differ from screener's, segment data is absent. Everything else is explicitly "not compared" or "not measurable".
- The synthesis validator checks citations, numbers, terms, periods, direction and causal words; it does not guarantee semantic correctness. Points are labelled model-written.
- Annual report read on selected pages only (36 of 187).
