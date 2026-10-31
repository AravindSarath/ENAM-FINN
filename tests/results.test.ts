import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildResultsCard, fiscalQuarter } from "../lib/data/results";
import { periodEndFromText } from "../lib/data/view";
import type { FilingFacts } from "../lib/data/types";
import { parseScreenerHtml } from "../lib/sources/screener";

const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n), "utf8");
const ctx = { symbol: "RELIANCE", url: "u", fetchedAt: "2026-10-31T00:00:00Z" };
const fund = parseScreenerHtml(fx("screener_reliance.html"), ctx);
const facts = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "filings", "RELIANCE.json"), "utf8")) as FilingFacts;
const row = (card: NonNullable<ReturnType<typeof buildResultsCard>>, label: string) => card.rows.find((r) => r.label.startsWith(label))!;

describe("fiscal quarter labels", () => {
  it("maps period ends to Indian fiscal quarters", () => {
    expect(fiscalQuarter("2026-09-30")).toBe("Q2 FY27");
    expect(fiscalQuarter("2026-06-30")).toBe("Q1 FY27");
    expect(fiscalQuarter("2026-12-31")).toBe("Q3 FY27");
    expect(fiscalQuarter("2027-03-31")).toBe("Q4 FY27");
  });
});

describe("period parsing from filing text", () => {
  it("reads the period end from NSE subject text", () => {
    expect(periodEndFromText("approved the unaudited Financial Results for the quarter and half year ended September 30, 2026")).toBe("2026-09-30");
    expect(periodEndFromText("results for the quarter ended June 30, 2026")).toBe("2026-06-30");
  });
  it("returns null rather than guessing when there is no period", () => {
    expect(periodEndFromText("Reliance Industries Limited has informed the Exchange about Investor Presentation")).toBeNull();
  });
});

describe("results card with verified filing facts (RELIANCE Sep 2026)", () => {
  const card = buildResultsCard(fund, facts)!;

  it("uses Revenue from operations from the filing as the primary revenue, with consistent QoQ/YoY columns", () => {
    const r = row(card, "Revenue from operations");
    expect([r.cur, r.prevQ, r.yearAgo]).toEqual([332861, 311850, 258898]);
  });

  it("preserves screener's revenue net of excise separately", () => {
    const x = card.extras.find((e) => e.label === "Revenue net of excise duty")!;
    expect([x.cur, x.prevQ, x.yearAgo]).toEqual([330601, 309468, 254623]);
  });

  it("shows total PAT including NCI as primary and owners' profit separately", () => {
    const pat = row(card, "PAT (incl. non-controlling interest)");
    expect([pat.cur, pat.prevQ, pat.yearAgo]).toEqual([29550, 23196, 22092]);
    const owners = card.extras.find((e) => e.label === "Profit attributable to owners")!;
    expect([owners.cur, owners.prevQ, owners.yearAgo]).toEqual([25548, 20946, 18165]);
  });

  it("labels operating profit as operating profit and says it is not EBITDA", () => {
    const op = row(card, "Operating profit");
    expect(op.cur).toBe(56616);
    expect(op.defn).toMatch(/Not EBITDA/);
    expect(JSON.stringify(card.rows.map((r) => r.label))).not.toMatch(/ebitda/i);
  });

  it("computes margin from screener revenue so numerator and denominator share a definition", () => {
    expect(card.margin!.cur).toBeCloseTo((56616 / 330601) * 100, 9);
    expect(card.margin!.prevQ).toBeCloseTo((47517 / 309468) * 100, 9);
  });

  it("labels the period and basis and keeps source links", () => {
    expect(card.periodLabel).toBe("Q2 FY27 · Sep 2026");
    expect(card.basis).toBe("consolidated");
    expect(card.sourceUrls.some((u) => u.includes("nsearchives.nseindia.com"))).toBe(true);
    expect(card.sourceUrls.some((u) => u.includes("/company/source/quarter/2726/9/2026/"))).toBe(true);
  });
});

describe("results card without verified filing facts", () => {
  it("falls back to screener figures under labels that say so, and marks owners' profit unavailable", () => {
    const card = buildResultsCard(fund, null)!;
    expect(row(card, "Revenue").label).toBe("Revenue");
    expect(row(card, "Revenue").cur).toBe(330601);
    expect(row(card, "Net profit").defn).toMatch(/not verified/i);
    const owners = card.extras.find((e) => e.label === "Profit attributable to owners")!;
    expect(owners.cur).toBeNull();
    expect(owners.reason).toMatch(/Unavailable/);
  });

  it("does not apply facts whose periods or basis differ from the table", () => {
    const shifted = { ...facts, periods: facts.periods.map((p, i) => (i === 0 ? { ...p, end: "2026-12-31" } : p)) };
    expect(row(buildResultsCard(fund, shifted)!, "Revenue").label).toBe("Revenue");
    const standalone = { ...facts, basis: "standalone" as const };
    expect(row(buildResultsCard(fund, standalone)!, "Revenue").label).toBe("Revenue");
  });

  it("marks bank operating profit unavailable with a reason", () => {
    const bank = parseScreenerHtml(fx("screener_hdfcbank_quarters.html"), { ...ctx, symbol: "HDFCBANK" });
    const card = buildResultsCard(bank, null)!;
    const op = row(card, "Operating profit");
    expect(op.cur).toBeNull();
    expect(op.reason).toMatch(/Financing Profit/);
    expect(card.margin).toBeNull();
  });
});
