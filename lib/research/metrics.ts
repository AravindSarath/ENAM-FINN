/**
 * Deterministic financial metrics from the screener.in tables. Pure arithmetic over committed snapshots: no model,
 * no estimates. Each metric carries its formula, the screener rows it reads, and its source URL. If any input is
 * missing the value is null with a reason, never zero. Operating profit is never called EBITDA.
 */
import type { ScreenerSnapshot, StatementTable } from "../data/types";
import { fiscalQuarter } from "../data/results";

export interface MetricValue {
  /** "FY26" for annual values, "Q2 FY27" for quarterly ones. */
  period: string;
  periodEnd: string;
  value: number | null;
  reason?: string;
}

export type MetricGroup = "growth" | "profitability" | "balance_sheet" | "cash" | "efficiency";

export interface Metric {
  /** Stable id, cited by synthesis as "M:<key>". */
  id: string;
  label: string;
  group: MetricGroup;
  unit: "percent" | "x" | "INR_crore" | "days";
  /** Plain-words formula. */
  formula: string;
  /** The screener rows read: "<section> / <row label>". */
  inputs: string[];
  frequency: "annual" | "quarterly";
  values: MetricValue[];
  sourceUrl: string;
  /** Definition caveats a reader should see next to the number. */
  note?: string;
}

type Series = Map<string, number | null>;

function seriesOf(t: StatementTable | undefined, key: string): { s: Series; label: string } | null {
  const row = t?.rows.find((r) => r.key === key);
  if (!t || !row) return null;
  const s: Series = new Map();
  t.periods.forEach((p, i) => {
    if (p.end) s.set(p.end, row.values[i] ?? null);
  });
  return { s, label: row.label };
}

const isFyEnd = (end: string) => end.slice(5) === "03-31";
export const fyLabel = (end: string) => `FY${end.slice(2, 4)}`;
const priorYear = (end: string) => `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;

const div = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b);

export function buildMetrics(snap: ScreenerSnapshot): Metric[] {
  const t = snap.tables;
  const url = snap.source.url;
  const metrics: Metric[] = [];
  const basisNote = snap.basis === "standalone" ? "Standalone figures: no consolidated series available." : undefined;

  const pl = (k: string) => seriesOf(t["profit-loss"], k);
  const bs = (k: string) => seriesOf(t["balance-sheet"], k);
  const cf = (k: string) => seriesOf(t["cash-flow"], k);
  const ra = (k: string) => seriesOf(t.ratios, k);
  const qt = (k: string) => seriesOf(t.quarters, k);

  const fyEnds = (...ss: (Series | undefined)[]) => {
    const sets = ss.filter((x): x is Series => !!x).map((s) => new Set([...s.keys()].filter(isFyEnd)));
    if (!sets.length) return [];
    return [...sets[0]].filter((e) => sets.every((x) => x.has(e))).sort().slice(-6);
  };

  const add = (m: Omit<Metric, "sourceUrl" | "id"> & { key: string }) => metrics.push({ ...m, id: `M:${m.key}`, sourceUrl: url, note: m.note ?? basisNote });

  /** Annual metric computed from aligned series; null with a reason when an input is missing. */
  const annual = (
    key: string,
    label: string,
    group: MetricGroup,
    unit: Metric["unit"],
    formula: string,
    inputs: { section: string; row: string; s: Series | undefined }[],
    fn: (get: (i: number, end: string) => number | null, end: string) => number | null,
    note?: string,
    lastOnly = 5,
  ) => {
    if (inputs.some((i) => !i.s)) return;
    const ends = fyEnds(...inputs.map((i) => i.s)).slice(-lastOnly);
    if (!ends.length) return;
    add({
      key,
      label,
      group,
      unit,
      formula,
      inputs: inputs.map((i) => `${i.section} / ${i.row}`),
      frequency: "annual",
      values: ends.map((e) => {
        const v = fn((i, end) => inputs[i].s!.get(end) ?? null, e);
        return { period: fyLabel(e), periodEnd: e, value: v, ...(v == null ? { reason: "an input is missing for this year" } : {}) };
      }),
      note,
    });
  };

  const rev = pl("revenue");
  const op = pl("operating_profit");
  const pat = pl("pat");
  const intr = pl("interest");
  const eq = bs("equity_capital");
  const res = bs("reserves");
  const bor = bs("borrowings");
  const cfo = cf("cfo");
  const fcf = cf("fcf");

  // Growth, year on year, from the annual P&L.
  const yoy = (key: string, label: string, row: ReturnType<typeof pl>, section = "profit-loss") => {
    if (!row) return;
    const ends = [...row.s.keys()].filter(isFyEnd).sort().slice(-5);
    add({
      key,
      label,
      group: "growth",
      unit: "percent",
      formula: `(this year ÷ previous year − 1) × 100, from ${row.label}`,
      inputs: [`${section} / ${row.label}`],
      frequency: "annual",
      values: ends.map((e) => {
        const v = div(row.s.get(e), row.s.get(priorYear(e)));
        return { period: fyLabel(e), periodEnd: e, value: v == null ? null : (v - 1) * 100, ...(v == null ? { reason: "previous year not available" } : {}) };
      }),
    });
  };
  yoy("revenue_growth_yoy", "Revenue growth, year on year", rev);
  yoy("operating_profit_growth_yoy", "Operating profit growth, year on year", op);
  yoy("pat_growth_yoy", "Net profit growth, year on year", pat);

  // CAGR over the last three annual intervals.
  const cagr = (key: string, label: string, row: ReturnType<typeof pl>) => {
    if (!row) return;
    const ends = [...row.s.keys()].filter(isFyEnd).sort();
    const last = ends[ends.length - 1];
    const first = ends[ends.length - 4];
    if (!last || !first) return;
    const a = row.s.get(first);
    const b = row.s.get(last);
    const v = a != null && b != null && a > 0 && b > 0 ? (Math.pow(b / a, 1 / 3) - 1) * 100 : null;
    add({
      key,
      label,
      group: "growth",
      unit: "percent",
      formula: `((${fyLabel(last)} ÷ ${fyLabel(first)})^(1/3) − 1) × 100, from ${row.label}`,
      inputs: [`profit-loss / ${row.label}`],
      frequency: "annual",
      values: [{ period: `${fyLabel(first)}–${fyLabel(last)}`, periodEnd: last, value: v, ...(v == null ? { reason: "needs positive values at both ends" } : {}) }],
    });
  };
  cagr("revenue_cagr_3y", "Revenue growth, 3-year compound annual", rev);
  cagr("pat_cagr_3y", "Net profit growth, 3-year compound annual", pat);

  // Profitability.
  annual("operating_margin", "Operating margin", "profitability", "percent", "Operating profit ÷ Sales × 100", [{ section: "profit-loss", row: "Operating Profit", s: op?.s }, { section: "profit-loss", row: "Sales", s: rev?.s }], (g, e) => { const v = div(g(0, e), g(1, e)); return v == null ? null : v * 100; }, "Operating profit is screener's figure (sales less operating costs, before other income). It is not EBITDA.");
  annual("pat_margin", "Net profit margin", "profitability", "percent", "Net profit ÷ Sales × 100", [{ section: "profit-loss", row: "Net Profit", s: pat?.s }, { section: "profit-loss", row: "Sales", s: rev?.s }], (g, e) => { const v = div(g(0, e), g(1, e)); return v == null ? null : v * 100; });
  annual("interest_cover", "Interest cover", "profitability", "x", "Operating profit ÷ Interest", [{ section: "profit-loss", row: "Operating Profit", s: op?.s }, { section: "profit-loss", row: "Interest", s: intr?.s }], (g, e) => div(g(0, e), g(1, e)), "Uses operating profit, which excludes other income and is not EBIT or EBITDA.");
  const roce = ra("roce_pct");
  if (roce) {
    const ends = [...roce.s.keys()].filter(isFyEnd).sort().slice(-5);
    add({ key: "roce", label: "Return on capital employed (screener)", group: "profitability", unit: "percent", formula: "As published by screener.in (rounded to a whole number)", inputs: ["ratios / ROCE %"], frequency: "annual", values: ends.map((e) => ({ period: fyLabel(e), periodEnd: e, value: roce.s.get(e) ?? null })) });
  }

  // Balance sheet.
  annual("net_worth", "Net worth", "balance_sheet", "INR_crore", "Equity capital + Reserves", [{ section: "balance-sheet", row: "Equity Capital", s: eq?.s }, { section: "balance-sheet", row: "Reserves", s: res?.s }], (g, e) => (g(0, e) == null || g(1, e) == null ? null : (g(0, e) as number) + (g(1, e) as number)));
  annual("borrowings", "Borrowings", "balance_sheet", "INR_crore", "As printed by screener.in", [{ section: "balance-sheet", row: "Borrowings", s: bor?.s }], (g, e) => g(0, e));
  annual("debt_to_equity", "Borrowings ÷ net worth", "balance_sheet", "x", "Borrowings ÷ (Equity capital + Reserves)", [{ section: "balance-sheet", row: "Borrowings", s: bor?.s }, { section: "balance-sheet", row: "Equity Capital", s: eq?.s }, { section: "balance-sheet", row: "Reserves", s: res?.s }], (g, e) => (g(1, e) == null || g(2, e) == null ? null : div(g(0, e), (g(1, e) as number) + (g(2, e) as number))), "Gross borrowings; cash and investments are not netted off.");

  // Working capital (screener's published day counts).
  for (const [key, label, row] of [["working_capital_days", "Working-capital days", "Working Capital Days"], ["cash_conversion_cycle", "Cash conversion cycle", "Cash Conversion Cycle"], ["debtor_days", "Debtor days", "Debtor Days"], ["inventory_days", "Inventory days", "Inventory Days"], ["days_payable", "Days payable", "Days Payable"]] as const) {
    const r = ra(key);
    if (!r) continue;
    const ends = [...r.s.keys()].filter(isFyEnd).sort().slice(-5);
    add({ key, label: `${label} (screener)`, group: "efficiency", unit: "days", formula: "As published by screener.in (whole days)", inputs: [`ratios / ${row}`], frequency: "annual", values: ends.map((e) => ({ period: fyLabel(e), periodEnd: e, value: r.s.get(e) ?? null })) });
  }

  // Cash flow and conversion.
  annual("cfo", "Cash from operations", "cash", "INR_crore", "As printed by screener.in", [{ section: "cash-flow", row: "Cash from Operating Activity", s: cfo?.s }], (g, e) => g(0, e));
  annual("fcf", "Free cash flow (screener)", "cash", "INR_crore", "As published by screener.in", [{ section: "cash-flow", row: "Free Cash Flow", s: fcf?.s }], (g, e) => g(0, e));
  annual("implied_capex", "Implied capital spending", "cash", "INR_crore", "Cash from operations − Free cash flow", [{ section: "cash-flow", row: "Cash from Operating Activity", s: cfo?.s }, { section: "cash-flow", row: "Free Cash Flow", s: fcf?.s }], (g, e) => (g(0, e) == null || g(1, e) == null ? null : (g(0, e) as number) - (g(1, e) as number)), "Derived from screener's free-cash-flow definition. It is the gap between the two figures, not a reported capex line.");
  annual("cfo_to_pat", "Cash from operations ÷ net profit", "cash", "x", "Cash from operations ÷ Net profit", [{ section: "cash-flow", row: "Cash from Operating Activity", s: cfo?.s }, { section: "profit-loss", row: "Net Profit", s: pat?.s }], (g, e) => div(g(0, e), g(1, e)));
  annual("cfo_to_operating_profit", "Cash from operations ÷ operating profit", "cash", "x", "Cash from operations ÷ Operating profit", [{ section: "cash-flow", row: "Cash from Operating Activity", s: cfo?.s }, { section: "profit-loss", row: "Operating Profit", s: op?.s }], (g, e) => div(g(0, e), g(1, e)), "Operating profit is screener's figure and is not EBITDA.");
  annual("fcf_margin", "Free cash flow ÷ sales", "cash", "percent", "Free cash flow ÷ Sales × 100", [{ section: "cash-flow", row: "Free Cash Flow", s: fcf?.s }, { section: "profit-loss", row: "Sales", s: rev?.s }], (g, e) => { const v = div(g(0, e), g(1, e)); return v == null ? null : v * 100; });

  // Quarterly, year on year: used to test management's claims about a quarter against the same quarter a year earlier.
  const qrev = qt("revenue");
  const qop = qt("operating_profit");
  const qpat = qt("pat");
  const qyoy = (key: string, label: string, row: ReturnType<typeof qt>) => {
    if (!row) return;
    const ends = [...row.s.keys()].sort();
    const vals = ends
      .map((e) => {
        const prev = row.s.get(priorYear(e)) ?? row.s.get(`${Number(e.slice(0, 4)) - 1}-${e.slice(5, 7)}-${e.slice(5, 7) === "02" ? "28" : e.slice(8)}`);
        const v = div(row.s.get(e), prev ?? null);
        return { period: fiscalQuarter(e), periodEnd: e, value: v == null ? null : (v - 1) * 100, ...(v == null ? { reason: "same quarter a year earlier not available" } : {}) };
      })
      .filter((x) => x.value != null);
    add({ key, label, group: "growth", unit: "percent", formula: `(this quarter ÷ same quarter a year earlier − 1) × 100, from ${row.label}`, inputs: [`quarters / ${row.label}`], frequency: "quarterly", values: vals, note: key === "revenue_growth_yoy_q" ? "screener's Sales is revenue net of excise duty." : key === "operating_profit_growth_yoy_q" ? "Operating profit is screener's figure and is not EBITDA." : basisNote });
  };
  // Quarterly amounts, for testing an absolute figure a speaker quotes ("net profit 23,200 crore") for the quarter of the call.
  const qabs = (key: string, label: string, row: ReturnType<typeof qt>, note?: string) => {
    if (!row) return;
    const vals = [...row.s.keys()].sort().flatMap((e) => (row.s.get(e) == null ? [] : [{ period: fiscalQuarter(e), periodEnd: e, value: row.s.get(e) as number }]));
    add({ key, label, group: "profitability", unit: "INR_crore", formula: `As printed in the quarterly results table (${row.label})`, inputs: [`quarters / ${row.label}`], frequency: "quarterly", values: vals, note: note ?? basisNote });
  };
  qabs("pat_q", "Net profit, quarter", qpat, "screener's Net Profit as printed. For RELIANCE it equals profit after tax including non-controlling interest.");
  qabs("revenue_q", "Revenue, quarter (screener)", qrev, "screener's Sales is revenue net of excise duty.");
  qabs("operating_profit_q", "Operating profit, quarter", qop, "Operating profit is screener's figure and is not EBITDA.");
  qyoy("revenue_growth_yoy_q", "Revenue growth, quarter on same quarter a year earlier", qrev);
  qyoy("operating_profit_growth_yoy_q", "Operating profit growth, quarter on same quarter a year earlier", qop);
  qyoy("pat_growth_yoy_q", "Net profit growth, quarter on same quarter a year earlier", qpat);
  return metrics;
}

export const metricById = (ms: Metric[], id: string) => ms.find((m) => m.id === id) ?? null;
export const valueAt = (m: Metric | null, periodEnd: string) => m?.values.find((v) => v.periodEnd === periodEnd)?.value ?? null;
