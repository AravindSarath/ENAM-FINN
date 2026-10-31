/**
 * Materiality scoring. Additive, deterministic, and itemised: every point has a label and the evidence behind it.
 * It never reads portfolio weights (they are illustrative), user thresholds or the clock.
 * The exact weights and thresholds are exported here and documented in docs/PUSH_INTELLIGENCE.md;
 * a test keeps the two in step.
 */
import type { Category, EvidenceRef, Reason, Tier } from "../types";
import { CATEGORY_LABEL } from "../format";
import type { Classification } from "./types";

/** Starting score by category. Reflects how often the category changes an investment case. */
export const CATEGORY_BASE: Record<Category, number> = {
  results: 65,
  management_change: 60,
  litigation: 60,
  "M&A": 60,
  pledging: 60,
  bonus_split: 55,
  fund_raise: 35,
  credit_rating: 35,
  dividend: 35,
  capex: 35,
  insider_trading: 35,
  press_release: 35,
  postal_ballot: 35,
  agm_egm: 35,
  unclassified: 30,
  earnings_call: 10,
  investor_meetings: 10,
};

/** Adjustment for how sure the classifier is. */
export const CONFIDENCE_ADJUSTMENT = { high: 0, medium: -3, low: -15 } as const;

export const MODIFIERS = {
  /** Category inferred only from page 1 of the attachment (indirect evidence). */
  pdfInferred: -5,
  /** Management filing names a CEO, CFO, MD, Chairman or other chief officer. */
  seniorRole: 10,
  /** Director completing a scheduled term. */
  scheduledTerm: -25,
  /** Board-meeting date notice: the numbers arrive with the outcome. */
  resultsNotice: -25,
  /** Results-related filing that is not the board outcome and states no period. */
  resultsRelated: -15,
  /** Results outcome whose numbers could not be shown. */
  resultsNumbersWithheld: -5,
  /** Largest absolute change among Operating profit, PBT and PAT, QoQ or YoY, at least 30%. */
  changeLarge: 15,
  /** ... at least 15%. */
  changeNotable: 8,
  /** Volume at least 3× its 20-day average. */
  volume3x: 15,
  /** ... at least 2×. */
  volume2x: 10,
  /** Price move at least 7% in the session. */
  move7: 15,
  /** ... at least 4%. */
  move4: 10,
  /** Maximum total from market reaction. */
  reactionCap: 25,
  /** Unexplained-move card: starting score. */
  moveCardBase: 55,
  /** Move card: move at least 3× its own typical daily move. */
  sigma3: 10,
  /** Move card: second or later consecutive unusual session. */
  consecutive: 5,
} as const;

export const THRESHOLDS = {
  /** Score at or above this is Act. */
  act: 55,
  /** Score at or above this is Noted. Below it is Routine. */
  noted: 30,
  /** Positively identified routine paperwork can never score above this. */
  routineCeiling: 20,
  /**
   * Any filing that is not positively routine paperwork and not call/meeting material never scores below this,
   * so unrecognised or weakly-evidenced filings are never buried. Failed PDF reads change nothing.
   */
  visibilityFloor: 30,
  /** Change size cut-offs, in percent. */
  changeLargePct: 30,
  changeNotablePct: 15,
  volume2x: 2,
  volume3x: 3,
  move4Pct: 4,
  move7Pct: 7,
  sigma3: 3,
} as const;

/** Call material and investor-meeting notices: context rather than news, so they may score as Routine. */
const LOW_VALUE = new Set<Category>(["earnings_call", "investor_meetings"]);

/** Market reaction only adds to categories that can move a stock. */
const REACTION_MIN_BASE = 30;

const SENIOR = /\b(CEO|CFO|COO|CTO|CIO|CHRO|Chief [A-Z][A-Za-z]+ Officer|Managing Director|Chairman|Chairperson|Whole[- ]time Director|Company Secretary)\b/i;
const SCHEDULED_TERM = /completed (?:his|her|their|the) .{0,60}term|end of (?:his|her|their) term|term of (?:appointment )?(?:has )?(?:ended|expired|completed)/i;

export interface ScoreInput {
  category: Category;
  classification: Classification;
  nseDesc: string;
  text: string;
  subject: string | null;
  /** Source URL of the primary filing. */
  url?: string;
  kind: "filing" | "results" | "move";
  /** Board-meeting date notice rather than the outcome. */
  isResultsNotice?: boolean;
  /** For results cards. `maxChangePct` is null when no numbers are available. */
  results?: { withheld: boolean; maxChangePct: number | null; changeEvidence?: string };
  /** The session after the filing, if it falls within 36 hours before that session's close. */
  reaction?: { volX: number | null; dayPct: number | null; session: string } | null;
  /** For move cards. */
  move?: { sigmaMultiple: number | null; consecutive: number; volX: number | null; dayPct: number; session: string };
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  reasons: Reason[];
}

const ev = {
  label: (text: string, url?: string): EvidenceRef => ({ kind: "nse_label", text, url }),
  rule: (text: string): EvidenceRef => ({ kind: "rule", text }),
};

function classEvidence(c: Classification, nseDesc: string, url?: string): EvidenceRef {
  if (!c.evidence) return ev.rule(`No rule matched (NSE label "${nseDesc}")`);
  const kind = c.evidence.source === "pdf" ? "pdf_excerpt" : c.evidence.source === "label" ? "nse_label" : "filing_text";
  return { kind, text: `“${c.evidence.phrase}”`, url };
}

export const tierOf = (score: number): Tier => (score >= THRESHOLDS.act ? "act" : score >= THRESHOLDS.noted ? "note" : "routine");

export function scoreItem(i: ScoreInput): ScoreResult {
  const reasons: Reason[] = [];
  const push = (label: string, points: number, evidence: EvidenceRef) => {
    if (points !== 0) reasons.push({ label, points, evidence });
  };
  const c = i.classification;
  const sum = () => reasons.reduce((s, r) => s + r.points, 0);

  if (i.kind === "move" && i.move) {
    const m = i.move;
    reasons.push({ label: "Unusual move with no non-routine filing in the 36 hours before the close", points: MODIFIERS.moveCardBase, evidence: { kind: "yahoo", text: `${m.session} session` } });
    if (m.sigmaMultiple != null && m.sigmaMultiple >= THRESHOLDS.sigma3) push(`Move is ${m.sigmaMultiple.toFixed(1)}× its own typical daily move`, MODIFIERS.sigma3, { kind: "yahoo", text: `Standard deviation of the prior 60 sessions' daily moves` });
    if (m.consecutive >= 1) push(`${m.consecutive + 1}th consecutive unusual session`.replace(/^2th/, "2nd").replace(/^3th/, "3rd"), MODIFIERS.consecutive, { kind: "yahoo", text: "Prior session also beyond the default thresholds" });
    const score = Math.min(100, Math.max(0, sum()));
    return { score, tier: tierOf(score), reasons };
  }

  push(`Category: ${CATEGORY_LABEL[i.category]}`, CATEGORY_BASE[i.category], classEvidence(c, i.nseDesc, i.url));
  push(`Classifier confidence: ${c.confidence}`, CONFIDENCE_ADJUSTMENT[c.confidence], ev.rule(c.rule));

  if (c.evidence?.source === "pdf") push("Category inferred from page 1 of the attachment", MODIFIERS.pdfInferred, { kind: "pdf_excerpt", text: c.evidence.phrase ? `“${c.evidence.phrase}”` : "Page 1 excerpt", url: i.url });

  const body = `${i.text} ${i.subject ?? ""}`;
  if (i.category === "management_change") {
    if (SCHEDULED_TERM.test(body)) push("Director completing a scheduled term", MODIFIERS.scheduledTerm, { kind: "filing_text", text: `“${body.match(SCHEDULED_TERM)![0]}”`, url: i.url });
    const senior = body.match(SENIOR);
    if (senior) push(`Senior role named: ${senior[0]}`, MODIFIERS.seniorRole, { kind: "filing_text", text: `“${senior[0]}”`, url: i.url });
  }

  if (i.category === "results") {
    if (i.isResultsNotice) push("Board-meeting date notice, not the outcome", MODIFIERS.resultsNotice, ev.rule("The numbers arrive with the outcome"));
    else if (i.kind === "filing") push("Results-related filing, not the board outcome", MODIFIERS.resultsRelated, ev.rule("States no reporting period"));
    if (i.kind === "results" && i.results) {
      if (i.results.withheld) push("Results numbers could not be shown", MODIFIERS.resultsNumbersWithheld, ev.rule("Reporting period did not match the available data"));
      else if (i.results.maxChangePct != null) {
        const x = i.results.maxChangePct;
        const evi: EvidenceRef = { kind: "screener", text: i.results.changeEvidence ?? `Largest change ${x.toFixed(1)}%` };
        if (x >= THRESHOLDS.changeLargePct) push(`Large change in profit lines (${x.toFixed(0)}% largest)`, MODIFIERS.changeLarge, evi);
        else if (x >= THRESHOLDS.changeNotablePct) push(`Notable change in profit lines (${x.toFixed(0)}% largest)`, MODIFIERS.changeNotable, evi);
      }
    }
  }

  // Market reaction: only for categories that can move a stock, and only if the session could reflect the filing.
  if (i.reaction && CATEGORY_BASE[i.category] >= REACTION_MIN_BASE && !c.routine) {
    const r = i.reaction;
    const parts: Reason[] = [];
    if (r.volX != null && r.volX >= THRESHOLDS.volume3x) parts.push({ label: `Volume ${r.volX.toFixed(1)}× the 20-day average on ${r.session}`, points: MODIFIERS.volume3x, evidence: { kind: "yahoo", text: `${r.session} session` } });
    else if (r.volX != null && r.volX >= THRESHOLDS.volume2x) parts.push({ label: `Volume ${r.volX.toFixed(1)}× the 20-day average on ${r.session}`, points: MODIFIERS.volume2x, evidence: { kind: "yahoo", text: `${r.session} session` } });
    if (r.dayPct != null && Math.abs(r.dayPct) >= THRESHOLDS.move7Pct) parts.push({ label: `Price ${r.dayPct > 0 ? "+" : ""}${r.dayPct.toFixed(1)}% on ${r.session}`, points: MODIFIERS.move7, evidence: { kind: "yahoo", text: `${r.session} session` } });
    else if (r.dayPct != null && Math.abs(r.dayPct) >= THRESHOLDS.move4Pct) parts.push({ label: `Price ${r.dayPct > 0 ? "+" : ""}${r.dayPct.toFixed(1)}% on ${r.session}`, points: MODIFIERS.move4, evidence: { kind: "yahoo", text: `${r.session} session` } });
    let budget = MODIFIERS.reactionCap;
    for (const p of parts) {
      const pts = Math.min(p.points, budget);
      budget -= pts;
      push(p.label, pts, p.evidence);
    }
  }

  // Floors and ceilings are their own itemised lines so the points always sum to the score.
  if (c.routine) {
    const cur = sum();
    if (cur > THRESHOLDS.routineCeiling) push(`Positively identified routine paperwork (${(c.routineRule ?? c.rule).replace(/^(routine|desc):/, "")}): capped`, THRESHOLDS.routineCeiling - cur, ev.rule(`Routine ceiling ${THRESHOLDS.routineCeiling}`));
  } else if (!LOW_VALUE.has(i.category)) {
    const cur = sum();
    if (cur < THRESHOLDS.visibilityFloor) {
      push(c.needsReview ? "Not confidently recognised, so kept visible" : "Not routine paperwork, so kept visible", THRESHOLDS.visibilityFloor - cur, ev.rule(`Visibility floor ${THRESHOLDS.visibilityFloor}`));
    }
  }

  const score = Math.min(100, Math.max(0, sum()));
  return { score, tier: tierOf(score), reasons };
}

/** "Management change +60, senior role +10": the top reasons by size, for one-line display. */
export function summariseReasons(reasons: Reason[], n = 3): string {
  return [...reasons]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, n)
    .map((r) => `${r.label.replace(/^Category: /, "")} ${r.points > 0 ? "+" : ""}${r.points}`)
    .join(" · ");
}
