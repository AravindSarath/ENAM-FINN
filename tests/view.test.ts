import { describe, expect, it } from "vitest";
import { buildDossierView } from "../lib/data/dossier";
import { loadFundamentals, loadUniverse } from "../lib/data/load";
import { buildBrief, loadBrief, type BriefInput } from "../lib/data/view";
import type { AnnouncementSnapshot, PriceSnapshot, ScreenerSnapshot, UniverseEntry } from "../lib/data/types";
import { classify } from "../lib/data/classify";
import { evaluate, DEFAULT_RULES } from "../lib/rules";

const brief = loadBrief();

describe("Brief built from the committed snapshots", () => {
  it("has the 18 portfolio holdings with real prices", () => {
    expect(brief.holdings).toHaveLength(18);
    const rel = brief.holdings.find((h) => h.sym === "RELIANCE")!;
    expect(rel.price).toBeCloseTo(1164.9, 1);
    expect(rel.dayPct).toBeCloseTo(-0.2142, 3);
    expect(rel.volX).toBeCloseTo(0.9716, 3);
    expect(rel.priceAsOf).toBe("2026-10-30");
    expect(brief.holdings.every((h) => h.series.length > 1)).toBe(true);
  });

  it("builds one RELIANCE results card with verified numbers and related filings folded in", () => {
    const cards = brief.feed.filter((f) => f.sym === "RELIANCE" && f.kind === "results");
    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c.tier).toBe("act");
    expect(c.title).toBe("Q2 FY27 results filed");
    expect(c.url).toContain("nsearchives.nseindia.com");
    expect(c.related!.length).toBeGreaterThanOrEqual(3);
    const r = c.results!;
    expect(r.pending).toBeUndefined();
    expect(r.rows[0]).toMatchObject({ label: "Revenue from operations", cur: 332861 });
    expect(r.rows.find((x) => x.label.startsWith("PAT"))!.cur).toBe(29550);
    expect(r.extras.find((x) => x.label === "Profit attributable to owners")!.cur).toBe(25548);
    expect(r.extras.find((x) => x.label === "Revenue net of excise duty")!.cur).toBe(330601);
  });

  it("never labels anything EBITDA", () => {
    const hits = JSON.stringify(brief.feed).match(/[^."]*ebitda[^."]*/gi) ?? [];
    // The only permitted mention is the explicit disclaimer "Not EBITDA".
    expect(hits.every((h) => /not ebitda/i.test(h))).toBe(true);
  });

  it("every real card carries provenance and a ranking reason", () => {
    for (const f of brief.feed.filter((x) => !x.sample)) {
      expect(f.why.length).toBeGreaterThan(5);
      expect(f.sourceLabel).toBeTruthy();
      expect(f.hoursAgo).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps sample content flagged and separate", () => {
    const samples = brief.feed.filter((f) => f.sample);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.id.startsWith("sample-"))).toBe(true);
  });

  it("never puts a routine-flagged filing above Routine", () => {
    // routine tier assigned from classification.routine: results outcomes excluded by design
    const universe = loadUniverse();
    expect(universe.length).toBe(22);
    for (const f of brief.feed.filter((x) => !x.sample && x.kind === "generic")) {
      if (f.why.startsWith("Routine paperwork")) expect(f.tier).toBe("routine");
    }
  });

  it("withholds results numbers when screener's quarter does not match the filing's period", () => {
    const pending = brief.feed.filter((f) => f.kind === "results" && f.results?.pending);
    for (const p of pending) {
      expect(p.results!.rows).toEqual([]);
      expect(p.soWhat).toMatch(/withheld|unavailable|Could not match/i);
    }
  });
});

describe("buildBrief never substitutes missing data", () => {
  const u: UniverseEntry = { symbol: "XYZ", name: "Xyz Ltd", sector: "Test", group: "portfolio", weight: 5, screenerSlug: "XYZ", yahooSymbol: "XYZ.NS" };
  const unavailablePrices: PriceSnapshot = {
    schema: 1, symbol: "XYZ", yahooSymbol: "XYZ.NS", range: "6mo", interval: "1d", currency: null, exchangeTimezone: null, lastBarPartial: false, regularMarketTime: null, bars: [],
    source: { name: "Yahoo", url: "u", fetchedAt: "t", asOf: null, status: "unavailable", reason: "HTTP 404" },
  };
  const input: BriefInput = { universe: [u], asOf: "2026-10-31T12:00:00Z", prices: { XYZ: unavailablePrices }, announcements: { XYZ: null }, fundamentals: { XYZ: null }, facts: { XYZ: null } };

  it("leaves unavailable prices null with a reason", () => {
    const h = buildBrief(input).holdings[0];
    expect(h.price).toBeNull();
    expect(h.dayPct).toBeNull();
    expect(h.volX).toBeNull();
    expect(h.reason).toBe("HTTP 404");
  });

  it("skips null holdings in alert evaluation instead of treating them as zero", () => {
    const b = buildBrief(input);
    expect(evaluate({ ...DEFAULT_RULES, volX: 0, movePct: 0 }, b.holdings, [], 24)).toEqual([]);
  });

  it("builds a results card with withheld numbers when no fundamentals exist", () => {
    const text = "approved the unaudited Financial Results for the quarter ended September 30, 2026";
    const ann: AnnouncementSnapshot = {
      schema: 1, symbol: "XYZ", window: { from: "a", to: "b" }, count: 1,
      source: { name: "NSE", url: "u", fetchedAt: "t", asOf: null, status: "ok" },
      items: [{ id: "1", symbol: "XYZ", company: null, isin: null, nseDesc: "Outcome of Board Meeting", text, attachmentUrl: "https://x/y.pdf", attachmentSize: null, announcedAt: "2026-10-30T10:00:00Z", announcedAtRaw: "30-Oct-2026 15:30:00", hasXbrl: false, classification: classify("Outcome of Board Meeting", text) }],
    };
    const b = buildBrief({ ...input, announcements: { XYZ: ann } });
    const card = b.feed.find((f) => f.kind === "results")!;
    expect(card.results!.pending).toMatch(/unavailable/i);
    expect(card.results!.rows).toEqual([]);
  });
});

describe("dossier view", () => {
  const u = loadUniverse();
  const view = (s: string) => buildDossierView(u.find((x) => x.symbol === s)!, loadFundamentals(s) as ScreenerSnapshot)!;

  it("corporate: operating profit and margin from rupee values", () => {
    const v = view("RELIANCE");
    expect(v.quarters).toHaveLength(5);
    expect(v.operatingProfit).not.toBeNull();
    expect(v.marginLabel).toBe("Operating margin");
    expect(v.margin[4]).toBeCloseTo((56616 / 330601) * 100, 9);
  });

  it("bank: no operating profit; net profit margin instead, since financing profit can be negative for a profitable bank", () => {
    const v = view("HDFCBANK");
    expect(v.operatingProfit).toBeNull();
    expect(v.financingProfit).not.toBeNull();
    expect(v.marginLabel).toBe("Net profit margin");
    expect(v.margin[4]).toBeCloseTo(((v.pat[4] as number) / (v.revenue[4] as number)) * 100, 9);
    expect(v.margin[4] as number).toBeGreaterThan(0);
  });

  it("carries the standalone fallback reason for TATAELXSI", () => {
    const v = view("TATAELXSI");
    expect(v.basis).toBe("standalone");
    expect(v.status).toBe("partial");
    expect(v.reason).toMatch(/standalone/i);
  });
});
