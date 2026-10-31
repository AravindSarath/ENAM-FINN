import { describe, expect, it } from "vitest";
import { loadFundamentals } from "../lib/data/load";
import type { ScreenerSnapshot } from "../lib/data/types";
import { evaluateFacts } from "../lib/research/guidance";
import { buildMetrics, type Metric } from "../lib/research/metrics";
import { buildItems, validatePoints } from "../lib/research/synthesize";
import type { Fact, Quantified } from "../lib/research/types";

const snap = loadFundamentals("RELIANCE") as ScreenerSnapshot;
const metrics = buildMetrics(snap);
const m = (id: string) => metrics.find((x) => x.id === id)!;
const at = (id: string, period: string) => m(id).values.find((v) => v.period === period)!.value as number;

/** A raw screener cell by section, row key and period end, so expectations never depend on retyped numbers. */
const cell = (section: "profit-loss" | "balance-sheet" | "cash-flow" | "quarters", key: string, end: string): number => {
  const t = snap.tables[section]!;
  const i = t.periods.findIndex((p) => p.end === end);
  return t.rows.find((r) => r.key === key)!.values[i] as number;
};
const FY26 = "2026-03-31";
const FY25 = "2025-03-31";

describe("deterministic metrics from the screener tables (RELIANCE, consolidated)", () => {
  it("computes growth, margins and cover exactly from the table values", () => {
    expect(at("M:revenue_growth_yoy", "FY26")).toBeCloseTo((cell("profit-loss", "revenue", FY26) / cell("profit-loss", "revenue", FY25) - 1) * 100, 9);
    expect(at("M:operating_margin", "FY26")).toBeCloseTo((cell("profit-loss", "operating_profit", FY26) / cell("profit-loss", "revenue", FY26)) * 100, 9);
    expect(at("M:interest_cover", "FY26")).toBeCloseTo(cell("profit-loss", "operating_profit", FY26) / cell("profit-loss", "interest", FY26), 9);
    expect(at("M:pat_margin", "FY26")).toBeCloseTo((cell("profit-loss", "pat", FY26) / cell("profit-loss", "revenue", FY26)) * 100, 9);
  });

  it("computes balance-sheet and cash metrics with the stated formulas", () => {
    const nw = cell("balance-sheet", "equity_capital", FY26) + cell("balance-sheet", "reserves", FY26);
    expect(at("M:net_worth", "FY26")).toBe(nw);
    expect(at("M:debt_to_equity", "FY26")).toBeCloseTo(cell("balance-sheet", "borrowings", FY26) / nw, 9);
    expect(at("M:implied_capex", "FY26")).toBe(cell("cash-flow", "cfo", FY26) - cell("cash-flow", "fcf", FY26));
    expect(at("M:cfo_to_pat", "FY26")).toBeCloseTo(cell("cash-flow", "cfo", FY26) / cell("profit-loss", "pat", FY26), 9);
    expect(at("M:cfo_to_operating_profit", "FY26")).toBeCloseTo(cell("cash-flow", "cfo", FY26) / cell("profit-loss", "operating_profit", FY26), 9);
  });

  it("uses the March 2026 column for FY26, not the trailing-twelve-months column", () => {
    expect(m("M:revenue_growth_yoy").values.map((v) => v.periodEnd).every((e) => e.endsWith("-03-31"))).toBe(true);
    expect(at("M:revenue_growth_yoy", "FY26")).toBeCloseTo((1055780 / 962820 - 1) * 100, 6);
  });

  it("computes quarterly year-on-year growth against the same quarter a year earlier", () => {
    const q = snap.tables.quarters!;
    const pat = q.rows.find((r) => r.key === "pat")!.values;
    const i = q.periods.findIndex((p) => p.end === "2026-06-30");
    const j = q.periods.findIndex((p) => p.end === "2025-06-30");
    expect(at("M:pat_growth_yoy_q", "Q1 FY27")).toBeCloseTo(((pat[i] as number) / (pat[j] as number) - 1) * 100, 9);
  });

  it("carries a formula, input rows and source URL on every metric, and never says EBITDA without 'not'", () => {
    for (const x of metrics) {
      expect(x.formula.length).toBeGreaterThan(5);
      expect(x.inputs.length).toBeGreaterThan(0);
      expect(x.sourceUrl).toContain("screener.in");
      expect(`${x.label} ${x.formula}`).not.toMatch(/ebitda/i);
      if (/ebitda/i.test(x.note ?? "")) expect(x.note).toMatch(/not (EBIT|EBITDA)/i);
    }
  });

  it("leaves a metric out, rather than inventing it, when an input row is missing", () => {
    const stripped = JSON.parse(JSON.stringify(snap)) as ScreenerSnapshot;
    stripped.tables["balance-sheet"]!.rows = stripped.tables["balance-sheet"]!.rows.filter((r) => r.key !== "borrowings");
    const ids = buildMetrics(stripped).map((x) => x.id);
    expect(ids).not.toContain("M:debt_to_equity");
    expect(ids).not.toContain("M:borrowings");
    expect(ids).toContain("M:operating_margin");
  });

  it("gives a null value with a reason when one year's input is missing", () => {
    const stripped = JSON.parse(JSON.stringify(snap)) as ScreenerSnapshot;
    const row = stripped.tables["cash-flow"]!.rows.find((r) => r.key === "fcf")!;
    row.values[row.values.length - 1] = null;
    const v = buildMetrics(stripped).find((x) => x.id === "M:implied_capex")!.values.at(-1)!;
    expect(v.value).toBeNull();
    expect(v.reason).toMatch(/missing/);
  });
});

let n = 0;
function fact(over: { kind?: Fact["kind"]; scope?: string; q: Partial<Quantified> & Pick<Quantified, "metric"> }): Fact {
  n++;
  return {
    id: `F${n}`, docId: "D", docKind: "transcript", kind: over.kind ?? "commentary", scope: over.scope ?? "Group", statement: null, quote: "q", page: 1,
    speaker: { name: "S", role: "management", designation: "CFO", header: "h" }, context: "c",
    quantified: { direction: "increase", value: 6, valueHigh: null, unit: "percent", comparator: null, period: "Q1 FY27", horizon: null, basis: "yoy", basisSource: "quote", ...over.q },
    verification: { quoteVerbatim: true, pageCorrected: false, speakerSource: "code", adjustments: [] }, extractedBy: { model: "m", promptVersion: "p" },
  };
}
const run = (f: Fact) => evaluateFacts([f], metrics, () => "2026-06-30")[0];
const actual = at("M:pat_growth_yoy_q", "Q1 FY27");

describe("guidance and claim verdicts are computed in code", () => {
  it("net-profit growth claim: consistent when it matches the same quarter on the same basis", () => {
    const r = run(fact({ q: { metric: "pat_growth_yoy", value: Math.round(actual), comparator: "approx" } }));
    expect(r.verdict).toBe("consistent");
    expect(r.actual?.metricId).toBe("M:pat_growth_yoy_q");
    expect(r.actual?.value).toBeCloseTo(actual, 9);
  });

  it("diverges when the stated figure is far from the calculated one", () => {
    expect(run(fact({ q: { metric: "pat_growth_yoy", value: actual + 10 } })).verdict).toBe("diverges");
  });

  it("honours the comparator: 'at least' passes when the actual is higher", () => {
    expect(run(fact({ q: { metric: "pat_growth_yoy", value: actual - 5, comparator: "at_least" } })).verdict).toBe("consistent");
    expect(run(fact({ q: { metric: "pat_growth_yoy", value: actual + 5, comparator: "at_least" } })).verdict).toBe("diverges");
    expect(run(fact({ q: { metric: "pat_growth_yoy", value: actual + 5, comparator: "at_most" } })).verdict).toBe("consistent");
  });

  it("does not compare when the growth basis is unstated", () => {
    const r = run(fact({ q: { metric: "pat_growth_yoy", value: 6, basis: null, basisSource: null } }));
    expect(r.verdict).toBe("not_compared");
    expect(r.reason).toMatch(/basis/);
    expect(r.actual).toBeNull();
  });

  it("does not compare revenue growth: the definitions differ. It shows the net-of-excise figure as reference only", () => {
    const r = run(fact({ q: { metric: "revenue_growth_yoy", value: 25 } }));
    expect(r.verdict).toBe("not_compared");
    expect(r.reason).toMatch(/excise/);
    expect(r.reference?.metricId).toBe("M:revenue_growth_yoy_q");
    expect(r.reference?.caveat).toMatch(/do not match/);
  });

  it("does not compare management EBITDA with screener's operating profit", () => {
    const r = run(fact({ q: { metric: "ebitda_growth_yoy", value: 10 } }));
    expect(r.verdict).toBe("not_compared");
    expect(r.reason).toMatch(/EBITDA is not screener's operating profit/);
  });

  it("segment statements are not measurable from the sources", () => {
    expect(run(fact({ scope: "Jio", q: { metric: "segment_revenue_growth_yoy", value: 12 } })).verdict).toBe("not_measurable");
  });

  it("forward statements whose horizon has not ended are 'too early', and without a horizon 'not measurable'", () => {
    expect(run(fact({ kind: "guidance", q: { metric: "pat_growth_yoy", value: 10, horizon: "this year" } })).verdict).toBe("too_early");
    expect(run(fact({ kind: "guidance", q: { metric: "pat_growth_yoy", value: 10, horizon: null } })).verdict).toBe("not_measurable");
  });

  it("a 'next quarter' target is tested against the following quarter's calculated figure", () => {
    const next = at("M:pat_growth_yoy_q", "Q2 FY27");
    const ok = run(fact({ kind: "guidance", q: { metric: "pat_growth_yoy", value: Math.round(next), comparator: "approx", horizon: "next quarter" } }));
    expect(ok.verdict).toBe("delivered");
    expect(ok.actual?.period).toBe("Q2 FY27");
    expect(run(fact({ kind: "guidance", q: { metric: "pat_growth_yoy", value: next + 20, horizon: "next quarter" } })).verdict).toBe("missed");
  });
});

describe("synthesis points are kept only if every claim is backed", () => {
  const f1 = fact({ q: { metric: "pat_growth_yoy", value: 6 } });
  f1.quote = "Net profit at almost close to 23,200, again up 6%.";
  const items = buildItems([f1], metrics.filter((x) => x.id === "M:debt_to_equity"), () => ({ title: "Call", period: "Q1 FY27" }));
  const alias = items[0].alias;

  it("keeps a point whose numbers all appear in its cited items and maps aliases back to real ids", () => {
    const { kept, dropped } = validatePoints("bull", [{ text: "Management said net profit was close to 23,200, up 6% (Q1 FY27).", cites: [alias] }], items);
    expect(dropped).toEqual([]);
    expect(kept[0].cites).toEqual([f1.id]);
  });

  it("accepts a metric figure at any sensible rounding", () => {
    const de = at("M:debt_to_equity", "FY26");
    expect(validatePoints("bear", [{ text: `Borrowings were ${de.toFixed(2)} times net worth in FY26.`, cites: ["M:debt_to_equity"] }], items).kept).toHaveLength(1);
  });

  it("drops a point that cites nothing, an unknown id, or contains a number its sources lack", () => {
    const r = validatePoints("bull", [{ text: "Good.", cites: [] }, { text: "Fine.", cites: ["F99"] }, { text: "Net profit rose 9%.", cites: [alias] }], items);
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["cites nothing", "cites an id it was not given: F99", "contains the number 9, which is not in its cited items"]);
  });
});

describe("no metric is typed by hand", () => {
  it("every metric value is null or finite", () => {
    for (const x of metrics as Metric[]) for (const v of x.values) expect(v.value === null || Number.isFinite(v.value)).toBe(true);
  });
});

describe("net-profit amounts spoken in a quote are read literally and tested", () => {
  const callFact = (quote: string) => ({ ...fact({ q: { metric: "other", value: null, unit: null, direction: null, basis: null } }), quote, quantified: null });
  const run2 = (quote: string) => evaluateFacts([callFact(quote) as Fact], metrics, () => "2026-06-30").find((x) => x.metric === "pat_amount");
  const actualPat = at("M:pat_q", "Q1 FY27");

  it("reads amount, unit and comparator exactly as worded", async () => {
    const { literalProfitAmount } = await import("../lib/research/guidance");
    expect(literalProfitAmount("And overall, PAT at 22,290 crores, which was also up about 1.6%.")).toEqual({ value: 22290, unit: "inr_crore", comparator: null });
    expect(literalProfitAmount("Net profit at almost close to 23,200, again up 6%.")).toEqual({ value: 23200, unit: null, comparator: "approx" });
    expect(literalProfitAmount("net profit of more than Rs 5,000 crore")?.comparator).toBe("at_least");
    expect(literalProfitAmount("EBITDA is up 18% and PAT 28%.")).toBeNull();
    expect(literalProfitAmount("topline up 25%")).toBeNull();
  });

  it("is consistent when the stated amount matches the quarter's net profit within rounding", () => {
    const r = run2(`overall PAT at ${Math.round(actualPat).toLocaleString("en-IN")} crores`)!;
    expect(r.verdict).toBe("consistent");
    expect(r.actual?.metricId).toBe("M:pat_q");
    expect(r.actual?.value).toBe(actualPat);
  });

  it("diverges when it does not", () => {
    expect(run2(`overall PAT at ${Math.round(actualPat * 1.1)} crores`)!.verdict).toBe("diverges");
  });

  it("does not assume the unit when 'crore' is not in the quote", () => {
    const r = run2(`Net profit at almost close to ${Math.round(actualPat)}`)!;
    expect(r.verdict).toBe("not_compared");
    expect(r.reason).toMatch(/unit/);
  });
});

describe("literal amount checks only apply to the whole company", () => {
  it("skips a segment's profit even when the quote says PAT and a number", () => {
    const f = { ...fact({ scope: "Jio", q: { metric: "other", value: null, unit: null, direction: null, basis: null } }), quote: "JPL PAT at Rs.7,935 Crores for the quarter", quantified: null } as Fact;
    expect(evaluateFacts([f], metrics, () => "2026-06-30").some((x) => x.metric === "pat_amount")).toBe(false);
  });
});

describe("synthesis guards on periods and causal wording", () => {
  const g = fact({ q: { metric: "other", value: null, unit: null, direction: null, basis: null } });
  g.quote = "EBITDA margin improving to 56.2% in the last quarter";
  const its = buildItems([g], [], () => ({ title: "Call", period: "Q4 FY26" }));
  const a = its[0].alias;

  it("drops a point that names a period its cited items do not carry", () => {
    const r = validatePoints("bull", [{ text: "EBITDA margin reached 56.2% in FY25.", cites: [a] }], its);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/names the period FY25/);
  });

  it("keeps a point that names the period its source carries", () => {
    expect(validatePoints("bull", [{ text: "Management said EBITDA margin improved to 56.2% in Q4 FY26.", cites: [a] }], its).kept).toHaveLength(1);
  });

  it("drops a causal link the sources do not make", () => {
    const r = validatePoints("bear", [{ text: "EBITDA margin was 56.2% because of cost cuts.", cites: [a] }], its);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/causal/);
  });

  it("shows the period beside each item the model sees", () => {
    expect(its[0].line).toContain("period Q4 FY26");
  });
});

describe("synthesis guards on terms and direction", () => {
  const f = fact({ q: { metric: "other", value: null, unit: null, direction: null, basis: null } });
  f.quote = "and more specifically on Oil-to-Chemicals down 4% and actually the 4% does not bring the overall context";
  f.context = "O2C up 10% despite everything. and more specifically on Oil-to-Chemicals down 4%";
  const table = fact({ q: { metric: "other", value: null, unit: null, direction: null, basis: null } });
  table.quote = "Total 3,47,530 2,819 24,072 3,74,421";
  table.context = "Gross debt as on March 31, 2026 was H 3,74,421 crore";
  const its = buildItems([f, table], [], () => ({ title: "Doc", period: "Q4 FY26" }));
  const [a, b] = [its[0].alias, its[1].alias];

  it("drops a term the cited quote and its context do not contain (EBITDA, year-on-year)", () => {
    const r = validatePoints("bear", [{ text: "Oil-to-Chemicals EBITDA declined 4% year-on-year.", cites: [a] }], its);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/uses a term its cited items do not contain/);
  });

  it("keeps a point that states only what the quote states", () => {
    expect(validatePoints("bear", [{ text: "Management said Oil-to-Chemicals was down 4% (Q4 FY26).", cites: [a] }], its).kept).toHaveLength(1);
  });

  it("drops a rise or fall that no cited quote states, even if the number is right", () => {
    const r = validatePoints("bear", [{ text: "Gross debt increased to 3,74,421 crore.", cites: [b] }], its);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/states a rise/);
    expect(validatePoints("bear", [{ text: "Gross debt was 3,74,421 crore.", cites: [b] }], its).kept).toHaveLength(1);
  });

  it("allows a rise or fall when a cited metric series carries it", () => {
    const its2 = buildItems([], metrics.filter((x) => x.id === "M:debt_to_equity"), () => ({ title: "x", period: null }));
    const v = at("M:debt_to_equity", "FY26");
    expect(validatePoints("bear", [{ text: `Borrowings ÷ net worth rose to ${v.toFixed(2)} times in FY26.`, cites: ["M:debt_to_equity"] }], its2).dropped.map((d) => d.reason)).not.toContain("states a rise that no cited quote states");
  });
});
