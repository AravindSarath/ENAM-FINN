/**
 * Management statements versus reported numbers. Verdicts are computed here, in code, and only where the statement's
 * metric, definition, period and growth basis all match a calculated metric. Everything else is shown as
 * "not compared" with the exact reason, next to a reference figure when one exists.
 */
import { fiscalQuarter } from "../data/results";
import { comparatorAt } from "./claims";
import type { Metric } from "./metrics";
import type { Fact, GuidanceMetric } from "./types";

export type Verdict = "consistent" | "diverges" | "delivered" | "partly" | "missed" | "too_early" | "not_compared" | "not_measurable";

export interface Reference {
  metricId: string;
  label: string;
  period: string;
  value: number;
  unit: string;
  /** Why this is shown for reference only, not as a verdict. */
  caveat: string;
}

export interface GuidanceItem {
  id: string;
  factId: string;
  type: "claim_check" | "guidance";
  metric: GuidanceMetric;
  scope: string;
  stated: { value: number | null; valueHigh: number | null; unit: string | null; comparator: string | null; direction: string | null; basis: string | null };
  /** The quarter a claim describes, or the horizon a target refers to. */
  period: string | null;
  horizon: string | null;
  /** The calculated figure the statement is tested against, when one matches. */
  actual: { metricId: string; period: string; periodEnd: string; value: number; unit: string } | null;
  verdict: Verdict;
  reason: string;
  /** A related figure on a different definition, labelled and never turned into a verdict. */
  reference: Reference | null;
}

const MATCHING: Partial<Record<GuidanceMetric, { metricId: string; label: string }>> = {
  pat_growth_yoy: { metricId: "M:pat_growth_yoy_q", label: "net profit" },
};

/** Metrics with a related, but different, calculated figure: shown for reference only. */
const REFERENCE_ONLY: Partial<Record<GuidanceMetric, { metricId: string; why: string }>> = {
  revenue_growth_yoy: { metricId: "M:revenue_growth_yoy_q", why: "screener's revenue is net of excise duty, which management's \"topline\" is not stated to be, so the definitions do not match" },
  ebitda_growth_yoy: { metricId: "M:operating_profit_growth_yoy_q", why: "management's EBITDA is not screener's operating profit (which excludes other income), so the definitions do not match" },
};

const PROFIT_AMOUNT = new RegExp(String.raw`\b(?:net profit|PAT|profit after tax)\b[^0-9.%]{0,40}?(\d[\d,]*(?:\.\d+)?)`, "i");

/** A net-profit amount stated in the quote, with the unit and comparator exactly as worded. Percent figures are skipped. */
export function literalProfitAmount(quote: string): { value: number; unit: "inr_crore" | null; comparator: "approx" | "at_least" | "at_most" | null } | null {
  const m = PROFIT_AMOUNT.exec(quote);
  if (!m) return null;
  const start = m.index + m[0].length - m[1].length;
  const end = start + m[1].length;
  if (/^\s*%/.test(quote.slice(end, end + 3)) || /^\s*per ?cent/i.test(quote.slice(end, end + 10))) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = /^\s*(?:crores?|cr\b)/i.test(quote.slice(end, end + 12)) ? "inr_crore" : null;
  return { value, unit, comparator: comparatorAt(quote, { start, end, value }) as "approx" | "at_least" | "at_most" | null };
}

const tol = (comparator: string | null) => (comparator === "approx" ? 1.5 : 1.0);

function compare(stated: number, high: number | null, comparator: string | null, actual: number): boolean {
  if (comparator === "at_least") return actual >= stated - 0.5;
  if (comparator === "at_most") return actual <= stated + 0.5;
  if (comparator === "range" && high != null) return actual >= stated - 0.5 && actual <= high + 0.5;
  return Math.abs(actual - stated) <= tol(comparator);
}

const addMonths = (end: string, m: number) => {
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m + 1, 0);
  return d.toISOString().slice(0, 10);
};

const valueAt = (m: Metric | undefined, end: string) => m?.values.find((v) => v.periodEnd === end && v.value != null) ?? null;

export function evaluateFacts(facts: Fact[], metrics: Metric[], docPeriodEnd: (docId: string) => string | null): GuidanceItem[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const items: GuidanceItem[] = [];

  for (const f of facts) {
    // A net-profit amount spoken in the quote is read literally by code ("PAT at 22,290 crores") and tested against
    // the same quarter's figure. It needs no growth basis, only the same metric, period and a stated unit.
    // Only for statements about the whole company: a segment's profit is not the group's net profit.
    if (f.docKind === "transcript" && f.kind === "commentary" && /^(group|company|overall|consolidated|ril|reliance( industries)?)$/i.test(f.scope.trim())) {
      const lit = literalProfitAmount(f.quote);
      const end0 = docPeriodEnd(f.docId);
      if (lit && end0) {
        const actual = valueAt(byId.get("M:pat_q"), end0);
        const baseAmount = {
          id: `G:${f.id}:amount`,
          factId: f.id,
          type: "claim_check" as const,
          metric: "pat_amount" as const,
          scope: f.scope,
          stated: { value: lit.value, valueHigh: null, unit: lit.unit, comparator: lit.comparator, direction: null, basis: null },
          period: fiscalQuarter(end0),
          horizon: null,
        };
        if (lit.unit !== "inr_crore") {
          items.push({ ...baseAmount, actual: null, verdict: "not_compared", reason: "The unit (crore) is not stated next to the number in the quote, so it is not assumed.", reference: null });
        } else if (!actual || actual.value == null) {
          items.push({ ...baseAmount, actual: null, verdict: "not_measurable", reason: `No net profit figure for ${fiscalQuarter(end0)} in the quarterly table.`, reference: null });
        } else {
          // Amounts are spoken rounded: allow half a percent.
          const rel = ((lit.value - actual.value) / actual.value) * 100;
          const ok = lit.comparator === "at_least" ? rel >= -0.5 : lit.comparator === "at_most" ? rel <= 0.5 : Math.abs(rel) <= 0.5;
          items.push({ ...baseAmount, actual: { metricId: "M:pat_q", period: actual.period, periodEnd: actual.periodEnd, value: actual.value, unit: "inr_crore" }, verdict: ok ? "consistent" : "diverges", reason: "Same metric (net profit, total), same quarter, same unit. Tolerance 0.5% for rounded speech.", reference: null });
        }
      }
    }

    const q = f.quantified;
    if (!q || q.metric === "pat_amount" || f.docKind !== "transcript" || !["commentary", "guidance", "target"].includes(f.kind)) continue;
    // Only statements that carry a growth rate or margin can be tested against calculated metrics.
    if (q.value == null) continue;

    const isClaim = f.kind === "commentary";
    const end = docPeriodEnd(f.docId);
    const base = {
      id: `G:${f.id}`,
      factId: f.id,
      type: (isClaim ? "claim_check" : "guidance") as GuidanceItem["type"],
      metric: q.metric,
      scope: f.scope,
      stated: { value: q.value, valueHigh: q.valueHigh, unit: q.unit, comparator: q.comparator, direction: q.direction, basis: q.basis ?? null },
      period: isClaim ? q.period : null,
      horizon: q.horizon,
    };
    const none = (verdict: Verdict, reason: string, reference: Reference | null = null): GuidanceItem => ({ ...base, actual: null, verdict, reason, reference });

    if (q.metric.startsWith("segment_")) {
      items.push(none("not_measurable", "A segment figure: the sources hold no segment-level series to compare it with."));
      continue;
    }
    if (q.metric === "other" || q.metric === "operating_margin" || q.metric === "capex" || q.metric === "borrowings") {
      items.push(none("not_measurable", "No calculated metric on the same definition and period is available for this statement."));
      continue;
    }
    if (q.metric.endsWith("_yoy") && q.basis !== "yoy") {
      items.push(none("not_compared", "The growth basis (year-on-year) is not stated in the quote or the page text around it, so it is not assumed."));
      continue;
    }
    if (!isClaim) {
      // Forward statements need a horizon that has already ended.
      const callEnd = end;
      const nextQuarter = callEnd ? addMonths(callEnd, 3) : null;
      if (!q.horizon) {
        items.push(none("not_measurable", "The statement names no period it refers to."));
        continue;
      }
      if (/^next quarter$/i.test(q.horizon) && nextQuarter) {
        const matching = MATCHING[q.metric];
        const actual = matching ? valueAt(byId.get(matching.metricId), nextQuarter) : null;
        if (matching && actual && actual.value != null) {
          const ok = compare(q.value, q.valueHigh, q.comparator, actual.value);
          items.push({ ...base, actual: { metricId: matching.metricId, period: actual.period, periodEnd: actual.periodEnd, value: actual.value, unit: "percent" }, verdict: ok ? "delivered" : "missed", reason: `Compared with ${matching.label} growth for ${fiscalQuarter(nextQuarter)} (next quarter after the call).`, reference: null });
          continue;
        }
      }
      items.push(none("too_early", `The horizon "${q.horizon}" has not ended in the data we hold, or has no matching calculated metric.`));
      continue;
    }

    // Claim about the quarter the call covers.
    if (!end) {
      items.push(none("not_measurable", "The call's reporting period is unknown."));
      continue;
    }
    const matching = MATCHING[q.metric];
    if (matching) {
      const actual = valueAt(byId.get(matching.metricId), end);
      if (!actual || actual.value == null) {
        items.push(none("not_measurable", `No ${matching.label} growth figure for ${fiscalQuarter(end)} in the quarterly table.`));
        continue;
      }
      const ok = compare(q.value, q.valueHigh, q.comparator, actual.value);
      items.push({ ...base, period: fiscalQuarter(end), actual: { metricId: matching.metricId, period: actual.period, periodEnd: actual.periodEnd, value: actual.value, unit: "percent" }, verdict: ok ? "consistent" : "diverges", reason: `Same metric (${matching.label}), same quarter, year-on-year basis (${q.basisSource === "quote" ? "stated in the quote" : "stated in the page text"}).`, reference: null });
      continue;
    }
    const ref = REFERENCE_ONLY[q.metric];
    const refMetric = ref ? byId.get(ref.metricId) : undefined;
    const refVal = valueAt(refMetric, end);
    items.push({ ...base, period: fiscalQuarter(end), actual: null, verdict: "not_compared", reason: ref ? `Not compared: ${ref.why}.` : "No calculated metric on the same definition is available.", reference: ref && refMetric && refVal && refVal.value != null ? { metricId: ref.metricId, label: refMetric.label, period: refVal.period, value: refVal.value, unit: "percent", caveat: ref.why } : null });
  }
  return items;
}
