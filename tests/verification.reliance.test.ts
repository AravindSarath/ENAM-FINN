/**
 * Independent verification of screener.in's RELIANCE quarterly figures against the original results filing.
 *
 * Source: "Unaudited Consolidated Financial Results for the quarter / half year ended 30th September 2026",
 * board outcome filed on NSE 30-Oct-2026 19:40 IST:
 *   https://nsearchives.nseindia.com/corporate/kavinavora_30102026193935_SE_30102026_Results.pdf
 * The same file (identical MD5) is what screener.in's "Raw PDF" link for Sep 2026 redirects to:
 *   https://www.bseindia.com/xml-data/corpfiling/AttachLive/880087f6-7ecc-40a9-8cac-de48d4616b25.pdf
 * Figures are in ₹ crore. The PDF's text layer is column-scrambled, so each column below was transcribed by
 * hand and then proven by the arithmetic identities asserted first. A mis-transcribed number would break them.
 * Columns: [Quarter ended 30 Sep 2026, 30 Jun 2026, 30 Sep 2025].
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { headlineResults } from "../lib/data/derive";
import { parseScreenerHtml } from "../lib/sources/screener";

const filing = {
  consolidated: {
    revenueFromOps: [332861, 311850, 258898], // net of GST, includes excise duty
    otherIncome: [5793, 6550, 4482],
    totalIncome: [338654, 318400, 263380],
    materials: [149628, 129857, 106488],
    purchases: [93594, 82833, 65276],
    inventoryChange: [-17539, -1326, -8421],
    excise: [2260, 2382, 4275],
    employee: [7474, 7717, 7491],
    finance: [8481, 8337, 6827],
    depreciation: [15315, 15100, 14416],
    otherExpenses: [40828, 42870, 37904],
    totalExpenses: [300041, 287770, 234256],
    pbt: [38613, 30630, 29124],
    currentTax: [5250, 4671, 2762],
    deferredTax: [4113, 2958, 4216],
    pat: [29250, 23001, 22146],
    associates: [300, 195, -54],
    patIncludingAssociates: [29550, 23196, 22092],
    owners: [25548, 20946, 18165],
    nci: [4002, 2250, 3927],
  },
  standalone: { pbtSep26: 20339, patSep26: 15354 },
};

const c = filing.consolidated;
const col = [0, 1, 2];

describe("filing transcription is internally consistent", () => {
  it("total income = revenue from operations + other income", () => {
    for (const i of col) expect(c.revenueFromOps[i] + c.otherIncome[i]).toBe(c.totalIncome[i]);
  });
  it("total expenses = sum of expense lines", () => {
    for (const i of col) {
      const sum = c.materials[i] + c.purchases[i] + c.inventoryChange[i] + c.excise[i] + c.employee[i] + c.finance[i] + c.depreciation[i] + c.otherExpenses[i];
      expect(sum).toBe(c.totalExpenses[i]);
    }
  });
  it("PBT = total income − total expenses", () => {
    for (const i of col) expect(c.totalIncome[i] - c.totalExpenses[i]).toBe(c.pbt[i]);
  });
  it("PAT = PBT − current tax − deferred tax; PAT incl. associates adds their share", () => {
    for (const i of col) {
      expect(c.pbt[i] - c.currentTax[i] - c.deferredTax[i]).toBe(c.pat[i]);
      expect(c.pat[i] + c.associates[i]).toBe(c.patIncludingAssociates[i]);
    }
  });
  it("owners + non-controlling interest = PAT incl. associates", () => {
    for (const i of col) expect(c.owners[i] + c.nci[i]).toBe(c.patIncludingAssociates[i]);
  });
});

describe("screener snapshot vs the filing (consolidated)", () => {
  const html = readFileSync(path.join(__dirname, "fixtures", "screener_reliance.html"), "utf8");
  const snap = parseScreenerHtml(html, { symbol: "RELIANCE", url: "u", fetchedAt: "t" });
  const h = headlineResults(snap.tables.quarters!)!;
  const row = (k: string) => h.rows.find((r) => r.key === k)!;
  const cmp = (r: { cur: number | null; prevQ: number | null; yearAgo: number | null }) => [r.cur, r.prevQ, r.yearAgo];

  it("covers exactly the filing's three quarters", () => {
    expect(h.periods).toEqual({ cur: "Sep 2026", prevQ: "Jun 2026", yearAgo: "Sep 2025" });
    expect(h.periodEnds).toEqual({ cur: "2026-09-30", prevQ: "2026-06-30", yearAgo: "2025-09-30" });
  });

  it("is the consolidated basis, not standalone", () => {
    expect(snap.basis).toBe("consolidated");
    expect(row("pbt").cur).not.toBe(filing.standalone.pbtSep26);
    expect(row("pat").cur).not.toBe(filing.standalone.patSep26);
  });

  it("PBT matches the filing exactly", () => {
    expect(cmp(row("pbt"))).toEqual(c.pbt);
  });

  it("PAT matches the filing's 'PAT and share of associates/JVs' (including non-controlling interest, NOT owners' share)", () => {
    expect(cmp(row("pat"))).toEqual(c.patIncludingAssociates);
    expect(row("pat").cur).not.toBe(c.owners[0]);
  });

  it("Revenue is the filing's revenue from operations NET of excise duty, not the reported headline", () => {
    const net = col.map((i) => c.revenueFromOps[i] - c.excise[i]);
    expect(cmp(row("revenue"))).toEqual(net);
    expect(row("revenue").cur).not.toBe(c.revenueFromOps[0]);
  });

  it("Operating profit is reproducible from filing lines (revenue and expenses both ex-excise; before finance cost and depreciation)", () => {
    const op = col.map((i) => {
      const revExExcise = c.revenueFromOps[i] - c.excise[i];
      const opexExExcise = c.totalExpenses[i] - c.finance[i] - c.depreciation[i] - c.excise[i];
      return revExExcise - opexExExcise;
    });
    expect(cmp(row("operating_profit"))).toEqual(op);
  });

  it("screener's interest, depreciation and other income equal the filing's finance cost, depreciation and other income", () => {
    const get = (k: string) => snap.tables.quarters!.rows.find((r) => r.key === k)!.values;
    const last3 = (v: (number | null)[]) => [v.at(-1), v.at(-2), v.at(-5)];
    expect(last3(get("interest"))).toEqual(c.finance);
    expect(last3(get("depreciation"))).toEqual(c.depreciation);
    expect(last3(get("other_income"))).toEqual(c.otherIncome);
  });
});
