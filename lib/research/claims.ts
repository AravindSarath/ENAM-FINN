/**
 * Strict checks on a statement's structured numbers. The model proposes a structure; code accepts it only if the
 * quote itself supports every part. Anything that cannot be tied to the quote is dropped, never repaired:
 * a management statement's numerical meaning is not inferred.
 */
import type { GuidanceMetric, Quantified } from "./types";

export interface RawQuantified {
  metric: GuidanceMetric;
  direction: "increase" | "decrease" | "maintain" | null;
  value: number | null;
  valueHigh: number | null;
  unit: "percent" | "inr_crore" | "x" | "bps" | "other" | null;
  comparator: "approx" | "at_least" | "at_most" | "range" | null;
  period: string | null;
  horizon: string | null;
}

export type Basis = "yoy" | "qoq" | null;

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const toNum = (s: string) => Number(s.replace(/,/g, "").replace(/\.$/, ""));

interface Occurrence {
  start: number;
  end: number;
  value: number;
}

export function numberOccurrences(text: string): Occurrence[] {
  return [...text.matchAll(NUM)].map((m) => ({ start: m.index!, end: m.index! + m[0].length, value: toNum(m[0]) })).filter((o) => Number.isFinite(o.value));
}

const CUR = String.raw`(?:rs\.?|inr|₹|us\$|\$)?\s*`;
const PRE_AT_LEAST = new RegExp(String.raw`(?:more than|greater than|over|above|at least|upwards? of|in excess of|exceed(?:s|ing)?|north of)\s*${CUR}$`, "i");
const PRE_AT_MOST = new RegExp(String.raw`(?:less than|lower than|under|below|up to|upto|at most|no more than|not more than|maximum of|capped at)\s*${CUR}$`, "i");
const PRE_APPROX = new RegExp(String.raw`(?:approximately|approx\.?|about|around|almost|close to|nearly|roughly|circa|~)\s*${CUR}$`, "i");
const POST_AT_LEAST = /^\s*(?:%|percent|crores?|cr|bps|x)?\s*(?:or more|or higher|or above|plus|and above|\+)/i;
const POST_AT_MOST = /^\s*(?:%|percent|crores?|cr|bps|x)?\s*(?:or less|or lower|or below|and below)/i;

/** The comparison word that qualifies the number at `occ`, read from the words right before or after it. */
export function comparatorAt(text: string, occ: Occurrence): "approx" | "at_least" | "at_most" | null {
  const before = text.slice(Math.max(0, occ.start - 32), occ.start);
  const after = text.slice(occ.end, occ.end + 20);
  if (PRE_AT_LEAST.test(before) || POST_AT_LEAST.test(after)) return "at_least";
  if (PRE_AT_MOST.test(before) || POST_AT_MOST.test(after)) return "at_most";
  if (PRE_APPROX.test(before)) return "approx";
  return null;
}

/** Growth-rate basis stated in the text, or null when it is missing or both bases appear. */
export function basisFromText(text: string): Basis {
  const yoy = /\b(y-?o-?y|year[- ]on[- ]year|year over year|over (?:the )?last year|compared to (?:the )?same quarter|same quarter last year|versus last year)\b/i.test(text);
  const qoq = /\b(q-?o-?q|quarter[- ]on[- ]quarter|sequential(?:ly)?|over (?:the )?(?:last|previous) quarter)\b/i.test(text);
  return yoy && !qoq ? "yoy" : qoq && !yoy ? "qoq" : null;
}

const METRIC_WORDS: Record<string, RegExp> = {
  revenue_growth_yoy: /\b(revenue|topline|top line|turnover|sales)\b/i,
  ebitda_growth_yoy: /\bebitda\b/i,
  operating_margin: /\bmargin/i,
  pat_growth_yoy: /\b(net profit|pat|profit after tax|bottom line|net income|earnings)\b/i,
  pat_amount: /\b(net profit|pat|profit after tax)\b/i,
  capex: /\b(capex|capital expenditure|capital spend|investment)/i,
  borrowings: /\b(debt|borrowing|leverage|gearing)/i,
  segment_revenue_growth_yoy: /\b(revenue|topline|top line|turnover|sales)\b/i,
  segment_ebitda_growth_yoy: /\bebitda\b/i,
};

const UNIT_NEAR: Record<string, RegExp> = {
  percent: /^\s*(?:%|per ?cent|percent)/i,
  inr_crore: /^\s*(?:crores?|cr\b)/i,
  bps: /^\s*(?:bps|basis points?)/i,
  x: /^\s*(?:x\b|times)/i,
};

const DIRECTION_CUES: Record<string, RegExp> = {
  increase: /\b(up|increase[ds]?|increasing|higher|growth|grew|grow(?:ing)?|rose|rise|rising|improv\w*|expand\w*|upside|gain\w*|double[ds]?|ramp\w*)\b/i,
  decrease: /\b(down|decrease[ds]?|lower|decline[ds]?|fell|fall(?:ing)?|drop\w*|reduc\w*|contract\w*|compress\w*|slightly lower)\b/i,
  maintain: /\b(maintain\w*|steady|stable|flat|unchanged|sustain\w*)\b/i,
};

const GROUP_METRICS = new Set(["revenue_growth_yoy", "ebitda_growth_yoy", "operating_margin", "pat_growth_yoy", "pat_amount", "capex", "borrowings"]);
const GROUP_SCOPE = /^(group|company|overall|consolidated|standalone|ril|reliance( industries)?)$/i;

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const NUMBER_WORDS: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
const normWords = (s: string) => new Set([...words(s)].map((w) => NUMBER_WORDS[w] ?? w));

export interface ValidatedQuantified {
  quantified: Quantified | null;
  basis: Basis;
  basisSource: "quote" | "context" | null;
  adjustments: string[];
}

/**
 * Validates and normalises a structured claim against its quote (and, for the growth basis only, the surrounding
 * page text). `period` is set by the caller from the document, never taken from the model.
 */
export function validateQuantified(q: RawQuantified | null, quote: string, scope: string, context: string, docPeriod: string | null): ValidatedQuantified {
  const none = (issue: string): ValidatedQuantified => ({ quantified: null, basis: null, basisSource: null, adjustments: [`quantified_dropped: ${issue}`] });
  if (!q) return { quantified: null, basis: null, basisSource: null, adjustments: [] };

  const occ = numberOccurrences(quote);
  const valueOcc = q.value != null ? occ.filter((o) => o.value === q.value) : [];
  if (q.value != null && valueOcc.length === 0) return none(`value ${q.value} is not in the quote`);
  if (q.valueHigh != null && !occ.some((o) => o.value === q.valueHigh)) return none(`value ${q.valueHigh} is not in the quote`);

  // Comparator: read from the wording next to the number. A mismatch drops the claim rather than choosing a side.
  if (q.value != null) {
    const derived = q.valueHigh != null ? "range" : (new Set(valueOcc.map((o) => comparatorAt(quote, o) ?? "exact")).size === 1 ? (comparatorAt(quote, valueOcc[0]) ?? "exact") : "ambiguous");
    if (derived === "ambiguous") return none("the same number appears with different qualifiers");
    const claimed = q.comparator ?? "exact";
    if (claimed !== derived) return none(`comparator "${claimed}" does not match the wording ("${derived}")`);
  }

  // Unit: must be evidenced right after the number.
  if (q.value != null && q.unit && q.unit !== "other") {
    const o = valueOcc[0];
    if (!UNIT_NEAR[q.unit].test(quote.slice(o.end, o.end + 20))) return none(`unit "${q.unit}" is not stated next to ${q.value}`);
  }

  // Metric: the quote must use the metric's own words.
  const mw = METRIC_WORDS[q.metric];
  if (mw && !mw.test(quote)) return none(`metric ${q.metric} is not named in the quote`);
  const isGroup = GROUP_SCOPE.test(scope.trim());
  if (GROUP_METRICS.has(q.metric) && !isGroup) return none(`company-wide metric ${q.metric} used for scope "${scope}"`);
  if (q.metric.startsWith("segment_") && isGroup) return none(`segment metric ${q.metric} used for the whole company`);

  // Direction: the quote must carry a matching cue.
  if (q.direction && !DIRECTION_CUES[q.direction].test(quote)) return none(`direction "${q.direction}" has no matching wording in the quote`);

  // Growth basis: stated in the quote, else in the page text around it. A conflicting basis drops the claim.
  let basis: Basis = null;
  let basisSource: "quote" | "context" | null = null;
  if (q.metric.endsWith("_yoy")) {
    const inQuote = basisFromText(quote);
    const inContext = inQuote ? null : basisFromText(context);
    basis = inQuote ?? inContext;
    basisSource = inQuote ? "quote" : inContext ? "context" : null;
    if (basis === "qoq") return none("the stated growth basis is quarter-on-quarter, not year-on-year");
  }

  // Horizon: every word must appear in the quote ("next two years" → "next 2 years" allowed).
  let horizon = q.horizon;
  const adjustments: string[] = [];
  if (horizon) {
    const qw = normWords(quote);
    if (![...normWords(horizon)].every((w) => qw.has(w))) {
      adjustments.push(`horizon_dropped: "${horizon}" is not worded in the quote`);
      horizon = null;
    }
  }

  return {
    quantified: { ...q, period: q.period ? docPeriod : null, horizon, basis, basisSource },
    basis,
    basisSource,
    adjustments,
  };
}
