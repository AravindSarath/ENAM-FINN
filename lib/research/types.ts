/**
 * Research data model. Four kinds of content stay distinct everywhere they are stored or shown:
 *   calculated metric   code over screener.in tables
 *   extracted fact      a verbatim quote from a filing, with document and page
 *   management statement a fact spoken by a named company speaker (never an analyst)
 *   model synthesis     bull/bear text written from cited ids only
 * Anything missing is `unavailable` with a reason; nothing is filled in.
 */

export interface DocRef {
  id: string;
  kind: "transcript" | "annual_report" | "results";
  title: string;
  /** Month of the call or the report year, as the source prints it ("Jul 2026"). */
  label: string;
  url: string;
  /** The reporting period the document covers, e.g. "Q1 FY27" for the call held in Jul 2026. Set by code from the call date. */
  periodLabel: string | null;
  /** End date of that period (YYYY-MM-DD). */
  periodEnd: string | null;
}

export type SpeakerRole = "management" | "analyst" | "moderator" | "unknown";

export interface Speaker {
  name: string;
  role: SpeakerRole;
  /** From the call's participant list, e.g. "CFO, Reliance Industries Limited". Null when not listed. */
  designation: string | null;
  /** The turn header the speaker was identified from, verbatim. */
  header: string;
}

/** Transcript kinds are statements by named management speakers; annual-report kinds are statements by the company in print. */
export type FactKind =
  | "guidance"
  | "forward_looking"
  | "target"
  | "commentary"
  | "business"
  | "segment"
  | "outlook"
  | "debt"
  | "contingent_liability"
  | "related_party"
  | "auditor_remark"
  | "risk";

/** Metrics a management statement can be mapped to, so code can compare it with reported numbers. */
export const GUIDANCE_METRICS = [
  "revenue_growth_yoy",
  "ebitda_growth_yoy",
  "operating_margin",
  "pat_growth_yoy",
  "pat_amount",
  "capex",
  "borrowings",
  "segment_revenue_growth_yoy",
  "segment_ebitda_growth_yoy",
  "other",
] as const;
export type GuidanceMetric = (typeof GUIDANCE_METRICS)[number];

export interface Quantified {
  metric: GuidanceMetric;
  direction: "increase" | "decrease" | "maintain" | null;
  value: number | null;
  valueHigh: number | null;
  unit: "percent" | "inr_crore" | "x" | "bps" | "other" | null;
  comparator: "approx" | "at_least" | "at_most" | "range" | null;
  /** The period a claim describes. Set by code from the document's reporting period, never by the model. */
  period: string | null;
  /** The period a target refers to, only if the quote words it (e.g. "this year", "next 2 years"). */
  horizon: string | null;
  /** Growth basis stated in the quote or the page text around it. Null when unstated: such claims are never compared. */
  basis?: "yoy" | "qoq" | null;
  basisSource?: "quote" | "context" | null;
}

export interface Fact {
  id: string;
  docId: string;
  docKind: DocRef["kind"];
  kind: FactKind;
  /** Segment or scope the statement is about, e.g. "Group", "Jio". */
  scope: string;
  /**
   * Short neutral restatement written by the model, or null when code found it added numbers or names that the
   * quote does not contain. The quote below is always the authority.
   */
  statement: string | null;
  /** Verbatim text from the cited page. Verified in code. */
  quote: string;
  /** Page of the PDF (1-based) on which the quote starts. */
  page: number;
  /** The named speaker for transcript facts; null for annual-report text, which has no speaker. */
  speaker: Speaker | null;
  /** Up to ~300 characters either side of the quote, from the page text, so the citation opens offline. */
  context: string;
  quantified: Quantified | null;
  verification: {
    quoteVerbatim: true;
    /** The model cited a different page; code found the quote on this one. */
    pageCorrected: boolean;
    speakerSource: "code";
    /** Corrections code made to the model's output, e.g. "statement_dropped:adds_terms". Empty when none. */
    adjustments: string[];
  };
  extractedBy: { model: string; promptVersion: string };
}

export type DropReason =
  | "schema_invalid"
  | "quote_not_found"
  | "quote_too_long"
  | "quote_has_ellipsis"
  | "quote_spans_turns"
  | "in_analyst_turn"
  | "in_moderator_turn"
  | "speaker_unknown"
  | "duplicate";

export interface DroppedFact {
  reason: DropReason;
  quote: string;
  page: number | null;
  detail?: string;
}

export interface Usage {
  model: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  latencyMs: number;
  attempts: number;
  /** HTTP statuses of failed attempts before success (e.g. 429, 503). */
  retriedStatuses: number[];
}
