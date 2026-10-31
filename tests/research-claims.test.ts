import { describe, expect, it } from "vitest";
import { basisFromText, comparatorAt, numberOccurrences, validateQuantified, type RawQuantified } from "../lib/research/claims";

const q = (o: Partial<RawQuantified> = {}): RawQuantified => ({ metric: "other", direction: null, value: null, valueHigh: null, unit: null, comparator: null, period: null, horizon: null, ...o });
const check = (quote: string, o: Partial<RawQuantified>, scope = "Group", context = quote) => validateQuantified(q(o), quote, scope, context, "Q1 FY27");
const dropped = (r: ReturnType<typeof check>) => r.adjustments.find((a) => a.startsWith("quantified_dropped"));

describe("comparators are read from the wording next to the number", () => {
  const at = (text: string, n: number) => comparatorAt(text, numberOccurrences(text).find((o) => o.value === n)!);
  it("maps each qualifier to its operator", () => {
    expect(at("EBITDA is more than Rs.54,000 Crores", 54000)).toBe("at_least");
    expect(at("we expect at least 15% growth", 15)).toBe("at_least");
    expect(at("a growth of 20% or more", 20)).toBe("at_least");
    expect(at("capex of up to Rs 5,000 crore", 5000)).toBe("at_most");
    expect(at("margin below 8%", 8)).toBe("at_most");
    expect(at("Net profit at almost close to 23,200", 23200)).toBe("approx");
    expect(at("approximately 12% higher", 12)).toBe("approx");
    expect(at("revenue up 10%", 10)).toBeNull();
  });
});

describe("validateQuantified: comparator", () => {
  it("accepts a comparator that matches the wording", () => {
    const r = check("EBITDA is more than Rs.54,000 Crores", { metric: "other", value: 54000, unit: "inr_crore", comparator: "at_least" });
    expect(r.quantified?.value).toBe(54000);
    expect(dropped(r)).toBeUndefined();
  });

  it("drops the claim when the model attaches 'at least' to a different number than the one it qualifies", () => {
    const quote = "So, when you look at that, our overall EBITDA is more than Rs.54,000 Crores, so we are up 10%.";
    const r = check(quote, { metric: "ebitda_growth_yoy", direction: "increase", value: 10, unit: "percent", comparator: "at_least" });
    expect(r.quantified).toBeNull();
    expect(dropped(r)).toMatch(/comparator "at_least" does not match the wording \("exact"\)/);
  });

  it("drops the claim when the model omits a qualifier that the quote has", () => {
    const r = check("Net profit at almost close to 23,200", { metric: "other", value: 23200, unit: null, comparator: null });
    expect(dropped(r)).toMatch(/comparator "exact" does not match the wording \("approx"\)/);
  });

  it("drops 'up to' read as an exact figure", () => {
    const r = check("we will spend up to Rs 5,000 crore", { metric: "capex", value: 5000, unit: "inr_crore", comparator: null }, "Group");
    expect(dropped(r)).toMatch(/\("at_most"\)/);
  });

  it("drops a number that appears twice with different qualifiers", () => {
    const r = check("more than 10% in margin and 10% in growth", { metric: "other", value: 10, unit: "percent", comparator: "at_least" });
    expect(dropped(r)).toMatch(/different qualifiers/);
  });

  it("requires both numbers of a range to be spoken, with the range comparator", () => {
    const ok = check("margin between 7% and 9% next year", { metric: "operating_margin", value: 7, valueHigh: 9, unit: "percent", comparator: "range", horizon: "next year" });
    expect(ok.quantified?.valueHigh).toBe(9);
    const bad = check("margin of 7% next year", { metric: "operating_margin", value: 7, valueHigh: 9, unit: "percent", comparator: "range" });
    expect(dropped(bad)).toMatch(/value 9 is not in the quote/);
  });
});

describe("validateQuantified: unit, metric, direction", () => {
  it("requires the unit next to the number", () => {
    expect(dropped(check("revenue up 25 on oil prices", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent" }))).toMatch(/unit "percent" is not stated/);
    expect(dropped(check("topline up 25% on oil", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent" }))).toBeUndefined();
    expect(dropped(check("EBITDA Rs 6,309 crore", { metric: "other", value: 6309, unit: "inr_crore" }))).toBeUndefined();
    expect(dropped(check("down 80 bps", { metric: "other", direction: "decrease", value: 80, unit: "bps" }))).toBeUndefined();
  });

  it("requires the metric's own words in the quote", () => {
    expect(dropped(check("strong performance, by O2C up 17%", { metric: "segment_ebitda_growth_yoy", direction: "increase", value: 17, unit: "percent" }, "O2C"))).toMatch(/not named in the quote/);
    expect(dropped(check("O2C EBITDA up 17% year-on-year", { metric: "segment_ebitda_growth_yoy", direction: "increase", value: 17, unit: "percent" }, "O2C"))).toBeUndefined();
  });

  it("requires a direction cue", () => {
    expect(dropped(check("EBITDA margin is 7.9%", { metric: "operating_margin", direction: "decrease", value: 7.9, unit: "percent" }))).toMatch(/direction "decrease"/);
    expect(dropped(check("EBITDA margin is 7.9%. It is down 80 bps", { metric: "operating_margin", direction: "decrease", value: 7.9, unit: "percent" }))).toBeUndefined();
  });
});

describe("growth basis and horizon", () => {
  it("reads the basis from the quote, else from the context, never when ambiguous", () => {
    expect(basisFromText("up 12% year-on-year")).toBe("yoy");
    expect(basisFromText("grew 3% quarter-on-quarter")).toBe("qoq");
    expect(basisFromText("up 3% YoY and 1% QoQ")).toBeNull();
    expect(basisFromText("up 12%")).toBeNull();
  });

  it("marks a growth claim 'quote' or 'context' sourced, and null when unstated", () => {
    const a = check("topline up 25%", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent" }, "Group", "topline up 25% on a year-on-year basis");
    expect(a.basis).toBe("yoy");
    expect(a.basisSource).toBe("context");
    const b = check("topline up 25% year-on-year", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent" });
    expect(b.basisSource).toBe("quote");
    const c = check("topline up 25%", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent" });
    expect(c.basis).toBeNull();
    expect(c.quantified).not.toBeNull();
  });

  it("drops a year-on-year metric whose stated basis is quarter-on-quarter", () => {
    expect(dropped(check("revenue up 3% quarter-on-quarter", { metric: "revenue_growth_yoy", direction: "increase", value: 3, unit: "percent" }))).toMatch(/quarter-on-quarter/);
  });

  it("keeps a horizon only if the quote words it", () => {
    const ok = check("margins and cash generation over the next two years", { metric: "other", direction: null, horizon: "next 2 years" });
    expect(ok.quantified?.horizon).toBe("next 2 years");
    const bad = check("we expect margins to improve", { metric: "other", direction: "increase", horizon: "FY27" });
    expect(bad.quantified?.horizon).toBeNull();
    expect(bad.adjustments[0]).toMatch(/horizon_dropped/);
  });

  it("sets the period from the document, never from the model", () => {
    const r = check("topline up 25% year-on-year", { metric: "revenue_growth_yoy", direction: "increase", value: 25, unit: "percent", period: "Q3 FY99" });
    expect(r.quantified?.period).toBe("Q1 FY27");
  });
});
