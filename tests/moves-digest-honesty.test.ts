import { describe, expect, it } from "vitest";
import { buildDigest } from "../lib/data/digest";
import { moveFacts, moveStats, stdev } from "../lib/data/moves";
import type { PriceBar } from "../lib/data/types";
import { loadAnnouncements, loadUniverse } from "../lib/data/load";
import { loadBrief } from "../lib/data/view";
import { parseTriage } from "../lib/triage";
import type { FeedItem } from "../lib/types";

const bar = (i: number, close: number, volume: number | null = 1000): PriceBar => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, open: close, high: close, low: close, close, volume });

/** A calm series (±0.5% zig-zag) followed by the given final moves. */
function series(finals: number[], calm = 70): PriceBar[] {
  const bars: PriceBar[] = [bar(0, 100)];
  for (let i = 1; i < calm; i++) bars.push(bar(i, bars[i - 1].close * (1 + (i % 2 ? 0.005 : -0.005))));
  for (const f of finals) bars.push(bar(bars.length, bars[bars.length - 1].close * (1 + f / 100), 5000));
  return bars;
}

describe("move statistics", () => {
  it("expresses the move as a multiple of the stock's own typical move", () => {
    const s = moveStats(series([-6]))!;
    expect(s.sigmaPct).toBeCloseTo(0.5, 1);
    expect(s.sigmaMultiple!).toBeGreaterThan(8);
    expect(s.sigmaSessions).toBe(60);
  });

  it("reports the largest fall over the whole history when nothing earlier compares", () => {
    const s = moveStats(series([-6]))!;
    expect(s.largest).toEqual({ direction: "fall", sessions: 69, wholeHistory: true });
  });

  it("reports how long ago a larger move happened", () => {
    const s = moveStats(series([-8, 0.4, 0.4, 0.4, -5]))!;
    expect(s.largest!.wholeHistory).toBe(false);
    expect(s.largest!.sessions).toBe(3);
  });

  it("counts earlier consecutive unusual sessions", () => {
    expect(moveStats(series([-6, -5]))!.consecutive).toBe(1);
    expect(moveStats(series([-6]))!.consecutive).toBe(0);
  });

  it("returns a null multiple, not zero, when history is too short", () => {
    const s = moveStats(series([-6], 12))!;
    expect(s.sigmaMultiple).toBeNull();
    expect(moveStats([bar(0, 100)])).toBeNull();
  });

  it("states only facts the numbers support", () => {
    const facts = moveFacts(moveStats(series([-6]))!).join(" | ");
    expect(facts).toMatch(/× its own typical daily move/);
    expect(facts).toMatch(/Largest fall in the 69 sessions on record/);
    expect(stdev([1])).toBeNull();
  });
});

const item = (o: Partial<FeedItem>): FeedItem => ({
  id: "i",
  sym: "AAA",
  cat: "results",
  title: "t",
  hoursAgo: 1,
  tier: "act",
  score: 70,
  reasons: [{ label: "Category: Results", points: 65, evidence: { kind: "rule", text: "x" } }],
  evidence: [],
  why: "",
  soWhat: "",
  kind: "generic",
  sample: false,
  ...o,
});

describe("digest", () => {
  it("builds the headline from counts and names only", () => {
    const d = buildDigest([
      item({ id: "1", sym: "RELIANCE", kind: "results" }),
      item({ id: "2", sym: "DIXON", kind: "results", related: [{ title: "a", url: null, hoursAgo: 1, reason: "r" }] }),
      item({ id: "3", sym: "SUZLON", kind: "move", cat: "unclassified", label: "Market move" }),
      item({ id: "4", sym: "TCS", tier: "routine", score: 10 }),
    ]);
    expect(d.headline).toBe("2 results filings (RELIANCE, DIXON), 1 unusual move (SUZLON).");
    expect(d.counts).toEqual({ act: 3, note: 0, routine: 1 });
    expect(d.rawFilings).toBe(4); // 1 + (1+1) + 1 (move cards are not filings): RELIANCE, DIXON+1 related, TCS
    expect(d.cards).toBe(4);
    expect(d.routineCollapsed).toBe(1);
  });

  it("says plainly when nothing needs attention", () => {
    expect(buildDigest([item({ tier: "routine", score: 5 })]).headline).toBe("Nothing needs you in this window.");
    expect(buildDigest([]).headline).toBe("Nothing needs you in this window.");
  });

  it("lists the top three by score with their biggest reason", () => {
    const items = [10, 90, 50, 70].map((s, i) => item({ id: String(i), score: s, sym: `S${i}` }));
    expect(buildDigest(items).top.map((t) => t.score)).toEqual([90, 70, 50]);
    expect(buildDigest(items).top[0].reason).toBe("Results");
  });

  it("excludes sample items from every figure, the headline and the top list", () => {
    const d = buildDigest([item({ id: "a", sym: "REAL" }), item({ id: "b", sym: "FAKE", sample: true, score: 0 })]);
    expect(d.rawFilings).toBe(1);
    expect(d.cards).toBe(1);
    expect(d.counts.act).toBe(1);
    expect(d.headline).toContain("REAL");
    expect(d.headline).not.toContain("FAKE");
    expect(d.top.map((t) => t.sym)).toEqual(["REAL"]);
    expect(d.sampleExcluded).toBe(1);
  });
});

describe("triage storage", () => {
  it("parses saved state and survives garbage", () => {
    expect(parseTriage(JSON.stringify({ done: ["a"], muted: ["X:results"], seen: ["b"] }))).toEqual({ done: ["a"], muted: ["X:results"], seen: ["b"] });
    expect(parseTriage("not json")).toEqual({ done: [], muted: [], seen: [] });
    expect(parseTriage("")).toEqual({ done: [], muted: [], seen: [] });
    expect(parseTriage(JSON.stringify({ done: "oops" }))).toEqual({ done: [], muted: [], seen: [] });
  });
});

describe("honesty: generated text never interprets", () => {
  // Words that would pass judgement on a result or a filing. Source text quoted from filings is exempt (it is not ours).
  const INTERPRETIVE = /\b(beat|beats|missed|miss|strong|weak|bullish|bearish|disappoint\w*|impressive|worrying|healthy|poor|robust|outperform\w*|underperform\w*|upside|downside|cheap|expensive|attractive|concerning|encouraging)\b/i;
  const brief = loadBrief();
  const real = brief.feed.filter((f) => !f.sample);

  it("score reasons and the one-line summary contain no judgement", () => {
    for (const f of real) {
      expect(f.why, f.id).not.toMatch(INTERPRETIVE);
      for (const r of f.reasons) expect(r.label, `${f.id}: ${r.label}`).not.toMatch(INTERPRETIVE);
    }
  });

  it("results cards state sizes and definitions, not verdicts", () => {
    for (const f of real.filter((x) => x.kind === "results")) {
      expect(f.soWhat, f.id).not.toMatch(INTERPRETIVE);
      for (const n of f.results?.notes ?? []) expect(n).not.toMatch(INTERPRETIVE);
      for (const r of [...(f.results?.rows ?? []), ...(f.results?.extras ?? [])]) expect(r.defn ?? "").not.toMatch(INTERPRETIVE);
    }
  });

  it("move cards give facts only", () => {
    for (const f of real.filter((x) => x.kind === "move")) expect(f.soWhat, f.id).not.toMatch(INTERPRETIVE);
  });

  it("the digest never judges, for any window", () => {
    for (const h of [6, 24, 72, 168, 720]) expect(buildDigest(brief.feed.filter((f) => f.hoursAgo <= h)).headline).not.toMatch(INTERPRETIVE);
  });

  it("unavailable values stay unavailable through scoring", () => {
    for (const f of real.filter((x) => x.kind === "results" && x.results?.pending)) {
      expect(f.results!.rows).toEqual([]);
      expect(f.reasons.some((r) => r.points === -5 && /could not be shown/i.test(r.label))).toBe(true);
    }
  });
});

describe("noise statistics on the real feed", () => {
  const brief = loadBrief();
  const real = brief.feed.filter((f) => !f.sample);

  it("every filing is represented exactly once across cards and their related lists", () => {
    const filings = real.filter((f) => f.kind !== "move").reduce((s, f) => s + 1 + (f.related?.length ?? 0), 0);
    // Every filing of the 18 portfolio companies, read straight from the snapshots (the 4 research tickers have no feed).
    const portfolio = new Set(loadUniverse().filter((u) => u.group === "portfolio").map((u) => u.symbol));
    const expected = [...portfolio].reduce((s, sym) => s + (loadAnnouncements(sym)?.items.length ?? 0), 0);
    expect(filings).toBe(expected);
  });

  it("has far fewer Act cards than raw filings", () => {
    const act = real.filter((f) => f.tier === "act").length;
    expect(act).toBeLessThan(60);
    expect(act).toBeGreaterThan(10);
  });

  it("keeps results cards with numbers for every company whose quarter matches", () => {
    const withNumbers = real.filter((f) => f.kind === "results" && !f.results?.pending);
    expect(withNumbers.length).toBeGreaterThanOrEqual(14);
  });
});
