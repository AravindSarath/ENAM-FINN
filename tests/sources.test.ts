import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { priceMetrics } from "../lib/data/derive";
import { parseNseAnnouncements } from "../lib/sources/nse";
import { parseYahooChart } from "../lib/sources/yahoo";

const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n), "utf8");

describe("NSE announcements parser", () => {
  const ctx = { symbol: "RELIANCE", url: "https://example/nse", fetchedAt: "2026-10-31T15:41:00Z", from: "01-08-2026", to: "31-10-2026" };
  const snap = parseNseAnnouncements(JSON.parse(fx("nse_RELIANCE.json")), ctx);

  it("keeps every record with unique ids, newest first", () => {
    expect(snap.source.status).toBe("ok");
    expect(snap.count).toBe(60);
    expect(new Set(snap.items.map((i) => i.id)).size).toBe(60);
    const times = snap.items.map((i) => i.announcedAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("converts the IST timestamp to UTC and keeps the raw string", () => {
    const first = snap.items[0];
    expect(first.announcedAtRaw).toBe("31-Oct-2026 17:34:03");
    expect(first.announcedAt).toBe("2026-10-31T12:04:03.000Z");
    expect(snap.source.asOf).toBe(first.announcedAt);
  });

  it("preserves NSE's own label, text and attachment URL verbatim", () => {
    const first = snap.items[0];
    expect(first.nseDesc).toBe("Analysts/Institutional Investor Meet/Con. Call Updates");
    expect(first.attachmentUrl).toBe("https://nsearchives.nseindia.com/corporate/kavinavora_31102026173331_SE_31102026_AR.pdf");
    expect(first.isin).toBe("INE002A01018");
  });

  it("skips malformed records and reports partial status instead of guessing", () => {
    const bad = [
      { symbol: "RELIANCE", seq_id: "1", an_dt: "not a date", desc: "x", attchmntText: "y" },
      { symbol: "RELIANCE", an_dt: "31-Oct-2026 10:00:00", desc: "x", attchmntText: "y" },
      { symbol: "OTHER", seq_id: "3", an_dt: "31-Oct-2026 10:00:00", desc: "x", attchmntText: "y" },
      { symbol: "RELIANCE", seq_id: "4", an_dt: "31-Oct-2026 10:00:00", desc: "Credit Rating", attchmntText: "z" },
    ];
    const s = parseNseAnnouncements(bad, ctx);
    expect(s.count).toBe(1);
    expect(s.source.status).toBe("partial");
    expect(s.source.reason).toContain("3 record(s) skipped");
  });

  it("marks a non-list response unavailable", () => {
    const s = parseNseAnnouncements({ error: 403 }, ctx);
    expect(s.source.status).toBe("unavailable");
    expect(s.items).toEqual([]);
  });

  it("treats a missing attachment as null", () => {
    const s = parseNseAnnouncements([{ symbol: "RELIANCE", seq_id: "9", an_dt: "31-Oct-2026 10:00:00", desc: "x", attchmntText: "", attchmntFile: "" }], ctx);
    expect(s.items[0].attachmentUrl).toBeNull();
  });
});

describe("Yahoo chart parser", () => {
  const ctx = { symbol: "RELIANCE", yahooSymbol: "RELIANCE.NS", url: "https://example/y", fetchedAt: "2026-10-31T15:41:00Z", range: "3mo", interval: "1d" };

  it("parses the real RELIANCE fixture", () => {
    const s = parseYahooChart(JSON.parse(fx("yahoo_RELIANCE.NS.json")), { ...ctx, nowSec: 1793400000 });
    expect(s.source.status).toBe("ok");
    expect(s.bars.length).toBeGreaterThan(50);
    expect(s.bars.every((b) => Number.isFinite(b.close))).toBe(true);
    const dates = s.bars.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    expect(s.currency).toBe("INR");
    expect(s.source.asOf).toBe(dates[dates.length - 1]);
  });

  it("drops null closes and dates bars in exchange-local time", () => {
    // 2026-10-30 03:45 UTC = 09:15 IST on 30 Oct
    const json = {
      chart: {
        result: [
          {
            meta: { currency: "INR", gmtoffset: 19800, exchangeTimezoneName: "Asia/Kolkata" },
            timestamp: [1793331900, 1793418300, 1793504700],
            indicators: { quote: [{ open: [1, 2, 3], high: [1, 2, 3], low: [1, 2, 3], close: [10, null, 12], volume: [100, 200, 300] }] },
          },
        ],
        error: null,
      },
    };
    const s = parseYahooChart(json, ctx);
    expect(s.bars.map((b) => b.close)).toEqual([10, 12]);
    expect(s.bars[0].date).toBe("2026-10-30");
  });

  it("flags a partial last bar only while the session is open", () => {
    const base = {
      chart: { result: [{ meta: { currentTradingPeriod: { regular: { start: 1000, end: 2000 } } }, timestamp: [1500], indicators: { quote: [{ close: [5], volume: [1] }] } }], error: null },
    };
    expect(parseYahooChart(base, { ...ctx, nowSec: 1500 }).lastBarPartial).toBe(true);
    expect(parseYahooChart(base, { ...ctx, nowSec: 2500 }).lastBarPartial).toBe(false);
  });

  it("reports unavailable for errors and empty series, with no bars invented", () => {
    const err = parseYahooChart({ chart: { result: null, error: { description: "Not Found" } } }, ctx);
    expect(err.source.status).toBe("unavailable");
    expect(err.source.reason).toBe("Not Found");
    expect(err.bars).toEqual([]);
    const empty = parseYahooChart({ chart: { result: [{ timestamp: [], indicators: { quote: [{}] } }], error: null } }, ctx);
    expect(empty.source.status).toBe("unavailable");
  });
});

describe("price metrics", () => {
  const bar = (i: number, close: number, volume: number | null) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: close, high: close, low: close, close, volume });

  it("computes day move and the volume multiple against the 20 prior sessions", () => {
    const bars = [...Array.from({ length: 20 }, (_, i) => bar(i, 100, 1000)), bar(20, 110, 2500)];
    const m = priceMetrics(bars)!;
    expect(m.dayPct).toBeCloseTo(10, 6);
    expect(m.avgVolume20).toBe(1000);
    expect(m.volumeMultiple).toBeCloseTo(2.5, 6);
    expect(m.prevClose).toBe(100);
  });

  it("excludes the latest day from its own average", () => {
    const bars = [...Array.from({ length: 20 }, (_, i) => bar(i, 100, 1000)), bar(20, 100, 21000)];
    expect(priceMetrics(bars)!.avgVolume20).toBe(1000);
  });

  it("returns a null multiple rather than guessing when history is short or volume is missing", () => {
    const short = Array.from({ length: 10 }, (_, i) => bar(i, 100, 1000));
    expect(priceMetrics(short)!.volumeMultiple).toBeNull();
    const gap = [...Array.from({ length: 20 }, (_, i) => bar(i, 100, i === 5 ? null : 1000)), bar(20, 100, 1000)];
    expect(priceMetrics(gap)!.volumeMultiple).toBeNull();
    expect(priceMetrics([bar(0, 100, 1)])).toBeNull();
  });

  it("matches a hand-checked slice of real RELIANCE data", () => {
    const s = parseYahooChart(JSON.parse(fx("yahoo_RELIANCE.NS.json")), { symbol: "RELIANCE", yahooSymbol: "RELIANCE.NS", url: "u", fetchedAt: "t", range: "3mo", interval: "1d" });
    const m = priceMetrics(s.bars)!;
    const b = s.bars;
    const prior = b.slice(-21, -1).map((x) => x.volume as number);
    const avg = prior.reduce((a, c) => a + c, 0) / 20;
    expect(m.avgVolume20).toBeCloseTo(avg, 6);
    expect(m.volumeMultiple).toBeCloseTo((b[b.length - 1].volume as number) / avg, 9);
    expect(m.dayPct).toBeCloseTo((b[b.length - 1].close / b[b.length - 2].close - 1) * 100, 9);
  });
});
