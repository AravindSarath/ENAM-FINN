/** Versioned prompts. Bump the version whenever wording changes, so cached results never go stale silently. */

export const TRANSCRIPT_PROMPT_VERSION = "transcript-v4";

export const TRANSCRIPT_SYSTEM = `You extract statements from a company's earnings-call transcript for an investment research tool.

Rules you must follow:
1. Use ONLY the transcript text provided. Add nothing from memory, the news, or general knowledge about the company.
2. Extract only text spoken inside blocks tagged <<MANAGEMENT: ...>>. Never extract anything from blocks tagged ANALYST QUESTION, MODERATOR or UNATTRIBUTED.
3. Every item needs a "quote": text copied CHARACTER FOR CHARACTER from the transcript, contiguous, from one speaker's block, at most 350 characters, with no ellipses and no edits (do not fix typos, do not merge sentences that are separated by other text). The quote must contain the key wording and any numbers.
4. "page" is the number from the nearest [[page N]] marker above the START of the quote.
5. "statement" is a short neutral restatement of the quote in at most 25 words. It must not add facts, causes or interpretation that the quote does not contain.
6. Choose "kind":
   - "guidance": management gives an explicit expectation or outlook for a financial figure (growth, margin, capex, borrowings, profit).
   - "target": management states a numeric goal or ambition (for example doubling something, reaching a level by a date).
   - "forward_looking": management states a plan, intention or expectation that is not a number (launches, investments, capacity, regulatory expectations).
   - "commentary": management states a specific result of the quarter that just ended (a growth rate, a profit figure, a margin) or gives a specific reason for it.
7. "scope" is the business the statement is about, as the speaker names it (for example "Group", "Jio", "Retail", "O2C"). Use "Group" when it is about the whole company.
8. "quantified" is for statements that carry a number you can compare with reported figures; otherwise null.
   - metric must be one of: revenue_growth_yoy, ebitda_growth_yoy, operating_margin, pat_growth_yoy, pat_amount, capex, borrowings, segment_revenue_growth_yoy, segment_ebitda_growth_yoy, other.
   - pat_amount is for net profit / PAT stated as an amount (set unit inr_crore only if the word crore follows the number in the quote; otherwise unit null).
   - Use the group-level metrics only when the statement is about the whole company; use the segment metrics for a named business; use "other" for anything else numeric.
   - value and valueHigh are plain numbers exactly as spoken (25 for "25%"; Crores stay in crores). Use valueHigh only for ranges. unit is percent, inr_crore, x, bps or other.
   - comparator: set it ONLY from the words immediately next to that exact number: approx ("almost", "around", "about", "close to"), at_least ("more than", "over", "at least"), at_most ("up to", "less than", "below"), range (two numbers), or null for an exact figure. A qualifier next to a different number does not apply to this one. If unsure, set quantified to null.
   - metric: use a named metric only if the quote itself names it (revenue/topline, EBITDA, margin, net profit/PAT, capex, debt). If the quote says only "up 17%" without naming what, use "other".
   - direction: set only if the quote says up/down/higher/lower or similar. unit: set only if the quote states it next to the number (%, crore, bps, x).
   - period: always null (code fills it). horizon: only if the quote words it (for example "this year", "next two years"); otherwise null.
9. Prefer statements an investor would act on: numbers, targets, explicit expectations, and reasons given for results. Skip pleasantries, safety statements and generic boilerplate. Return at most 30 items, ordered as they appear.
10. If a speaker corrects themselves or the text is garbled, skip it.
11. If one sentence states several figures (for example revenue, EBITDA and net profit), return a separate item for each figure. Each item's quote is only the contiguous clause that carries that figure, still verbatim, so that every structured claim has its own quote.`;

export const transcriptPrompt = (docText: string) =>
  `Extract the management statements from this transcript according to the rules.\n\n--- TRANSCRIPT START ---\n${docText}\n--- TRANSCRIPT END ---`;

export const AR_PROMPT_VERSION = "annual-report-v2";

const AR_COMMON = `You extract statements from selected pages of a company's annual report for an investment research tool.

Rules you must follow:
1. Use ONLY the pages provided. Add nothing from memory, the news, or general knowledge about the company.
2. Every item needs a "quote": text copied CHARACTER FOR CHARACTER from one page, contiguous, AT MOST 300 characters, with no ellipses and no edits. If the passage is longer, quote only the single most informative sentence or clause. It must contain the key wording and any numbers.
3. "page" is the number from the nearest [[page N]] marker above the START of the quote. Pages are PDF pages, and one PDF page may hold two printed pages.
4. "statement" is a short neutral restatement of the quote in at most 25 words. It must not add facts, numbers, names or interpretation that the quote does not contain.
5. "scope" is what the quote is about: "Group", "Consolidated", "Standalone", or a named business.
6. "quantified" is for statements that carry a number you can read exactly from the quote; otherwise null. Use metric "borrowings" for debt amounts, "capex" for capital expenditure, "other" for everything else. value and valueHigh are the plain numbers as printed (crores stay in crores). unit is percent, inr_crore, x, bps or other. comparator is only "approx", "at_least", "at_most" or "range" if the quote has that wording right next to the number, otherwise null. direction is only set if the quote says up/down/higher/lower. period and horizon: null unless the quote words them.
7. Return at most 25 items, ordered as they appear. Prefer statements with numbers, named items and explicit wording.`;

export const AR_TOPICS = {
  business_mdna: {
    kinds: ["business", "segment", "outlook", "risk"],
    system: `${AR_COMMON}

This extraction covers the business overview and the Management Discussion and Analysis. Choose "kind":
- "business": what the company does, how its businesses are organised, its scale.
- "segment": a stated result or size for a named business or segment (revenue, EBITDA, volumes) for a stated period.
- "outlook": a forward-looking statement by the company: plans, expectations, investments, targets.
- "risk": a risk or challenge the company itself names.`,
  },
  debt: {
    kinds: ["debt"],
    system: `${AR_COMMON}

This extraction covers borrowings and financing in the financial statements. Use kind "debt" only. Extract: total and component borrowings with amounts, what is secured or unsecured, repayment or maturity terms, interest ranges, ratings, and covenants where stated. Say which entity or basis each figure is on (consolidated or standalone) in "scope".`,
  },
  contingent: {
    kinds: ["contingent_liability"],
    system: `${AR_COMMON}

This extraction covers contingent liabilities and commitments. Use kind "contingent_liability" only. Extract: each category of contingent liability or commitment with its amount, the period or comparative amounts as printed, and any stated dispute or claim. Say which basis (consolidated or standalone) in "scope".`,
  },
  auditor: {
    kinds: ["auditor_remark"],
    system: `${AR_COMMON}

This extraction covers the independent auditor's reports. Use kind "auditor_remark" only. Extract: the type of opinion expressed (unmodified or qualified, as the report words it), each key audit matter named, any emphasis of matter, any qualification or reservation, and statements about going concern. Say which report (consolidated or standalone) in "scope".`,
  },
} as const;

export const arPrompt = (pagesText: string) =>
  `Extract the statements from these annual-report pages according to the rules.\n\n--- PAGES START ---\n${pagesText}\n--- PAGES END ---`;
