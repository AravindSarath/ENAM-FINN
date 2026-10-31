import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { headlineResults } from "../lib/data/derive";
import { parseScreenerHtml } from "../lib/sources/screener";

const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n), "utf8");
const ctx = { symbol: "RELIANCE", url: "https://www.screener.in/company/RELIANCE/consolidated/", fetchedAt: "2026-10-31T15:41:00Z" };

describe("screener parser: RELIANCE (corporate)", () => {
  const snap = parseScreenerHtml(fx("screener_reliance.html"), ctx);
  const q = snap.tables.quarters!;

  it("parses all five statement tables and flags nothing missing", () => {
    expect(snap.source.status).toBe("ok");
    expect(Object.keys(snap.tables).sort()).toEqual(["balance-sheet", "cash-flow", "profit-loss", "quarters", "ratios"]);
  });

  it("reads the basis from the heading, not from the 'View Standalone' link", () => {
    expect(snap.basis).toBe("consolidated");
    expect(q.unitNote).toContain("Rs. Crores");
  });

  it("builds periods with real end dates", () => {
    expect(q.periods).toHaveLength(13);
    expect(q.periods[q.periods.length - 1]).toEqual({ label: "Sep 2026", end: "2026-09-30", kind: "quarter" });
    expect(snap.source.asOf).toBe("2026-09-30");
  });

  it("keeps a source link per quarter", () => {
    expect(q.periodSourceUrls[q.periods.length - 1]).toBe("https://www.screener.in/company/source/quarter/2726/9/2026/");
    expect(snap.companyId).toBe("2726");
  });

  it("parses the latest-quarter figures as printed", () => {
    const row = (k: string) => q.rows.find((r) => r.key === k)!.values.at(-1);
    expect(row("revenue")).toBe(330601);
    expect(row("operating_profit")).toBe(56616);
    expect(row("pbt")).toBe(38613);
    expect(row("pat")).toBe(29550);
  });

  it("labels operating profit as operating profit", () => {
    const labels = q.rows.map((r) => r.label);
    expect(labels).toContain("Operating Profit");
    expect(labels.join(" ")).not.toMatch(/ebitda/i);
  });

  it("annual table has a TTM column with no end date", () => {
    const pl = snap.tables["profit-loss"]!;
    const ttm = pl.periods.find((p) => p.kind === "ttm");
    expect(ttm).toBeDefined();
    expect(ttm!.end).toBeNull();
  });

  it("extracts top ratios and document links", () => {
    expect(snap.topRatios.find((r) => r.name === "Market Cap")?.value).toBeGreaterThan(0);
    expect(snap.documents.some((d) => d.group === "Concalls" && d.links.some((l) => l.text === "Transcript"))).toBe(true);
    expect(snap.documents.some((d) => d.group === "Annual reports")).toBe(true);
    expect(snap.documents.flatMap((d) => d.links).every((l) => l.url.startsWith("http"))).toBe(true);
  });
});

describe("headline results", () => {
  const q = parseScreenerHtml(fx("screener_reliance.html"), ctx).tables.quarters!;
  const h = headlineResults(q)!;
  const get = (k: string) => h.rows.find((r) => r.key === k)!;

  it("picks the latest quarter, the previous quarter and the same quarter a year earlier", () => {
    expect(h.periods).toEqual({ cur: "Sep 2026", prevQ: "Jun 2026", yearAgo: "Sep 2025" });
    expect(h.periodEnds.yearAgo).toBe("2025-09-30");
  });

  it("returns the four headline rows with comparatives", () => {
    expect(get("revenue")).toMatchObject({ cur: 330601, prevQ: 309468, yearAgo: 254623, label: "Revenue" });
    expect(get("operating_profit")).toMatchObject({ cur: 56616, prevQ: 47517, yearAgo: 45885, label: "Operating profit" });
    expect(get("pbt")).toMatchObject({ cur: 38613, prevQ: 30630, yearAgo: 29124 });
    expect(get("pat")).toMatchObject({ cur: 29550, prevQ: 23196, yearAgo: 22092 });
  });

  it("never labels operating profit as EBITDA", () => {
    expect(h.rows.map((r) => r.label).join(" ")).not.toMatch(/ebitda/i);
  });

  it("carries the source filing link for the quarter", () => {
    expect(h.sourceUrls.cur).toContain("/company/source/quarter/2726/9/2026/");
  });

  it("returns null comparatives when the first column has no previous quarter", () => {
    const first = headlineResults(q, 0)!;
    expect(first.periods.prevQ).toBeNull();
    expect(first.rows.every((r) => r.prevQ === null)).toBe(true);
  });
});

describe("screener parser: HDFCBANK (bank layout)", () => {
  const bank = parseScreenerHtml(fx("screener_hdfcbank_quarters.html"), { ...ctx, symbol: "HDFCBANK" });

  it("recognises the bank row set", () => {
    const keys = bank.tables.quarters!.rows.map((r) => r.key);
    expect(keys).toContain("financing_profit");
    expect(keys).toContain("revenue");
    expect(keys).not.toContain("operating_profit");
    expect(keys).toContain("gross_npa_pct");
  });

  it("reports Operating profit as explicitly unavailable instead of inventing it", () => {
    const h = headlineResults(bank.tables.quarters!)!;
    const op = h.rows.find((r) => r.key === "operating_profit")!;
    expect(op.cur).toBeNull();
    expect(op.sourceRow).toBeNull();
    expect(op.reason).toMatch(/Financing Profit/);
    expect(h.rows.find((r) => r.key === "pat")!.cur).not.toBeNull();
  });

  it("is partial because other sections were not in the fixture", () => {
    expect(bank.source.status).toBe("partial");
    expect(bank.source.reason).toContain("profit-loss");
  });
});

describe("screener parser: failure modes", () => {
  it("returns unavailable for an empty or login page", () => {
    const s = parseScreenerHtml("<html><body>Please log in</body></html>", ctx);
    expect(s.source.status).toBe("unavailable");
    expect(s.tables).toEqual({});
    expect(s.source.reason).toBeTruthy();
  });

  it("a blank cell is null, not zero", () => {
    const html = `<section id="quarters"><p class="sub">Consolidated Figures in Rs. Crores</p><div data-result-table><table class="data-table"><thead><tr><th></th><th data-date-key="2026-06-30">Jun 2026</th><th data-date-key="2026-09-30">Sep 2026</th></tr></thead><tbody><tr><td>Sales</td><td>100</td><td></td></tr></tbody></table></div></section>`;
    const s = parseScreenerHtml(html, ctx);
    expect(s.tables.quarters!.rows[0].values).toEqual([100, null]);
  });
});
