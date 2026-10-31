import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSnapshots } from "../lib/data/validate";

const report = validateSnapshots();

describe("committed snapshots", () => {
  it("pass every integrity check", () => {
    expect(report.errors).toEqual([]);
  });

  it("cover all 22 tickers with prices, announcements and fundamentals", () => {
    expect(report.coverage).toHaveLength(22);
    expect(report.coverage.filter((c) => c.group === "portfolio")).toHaveLength(18);
    expect(report.coverage.filter((c) => c.group === "research")).toHaveLength(4);
    for (const c of report.coverage) {
      expect(["ok", "partial"]).toContain(c.prices);
      expect(["ok", "partial"]).toContain(c.announcements);
      expect(["ok", "partial"]).toContain(c.fundamentals);
    }
  });

  it("records banks and NBFCs as financing-profit layouts, not operating profit", () => {
    const fin = report.coverage.filter((c) => c.layout === "financing-profit").map((c) => c.symbol).sort();
    expect(fin).toEqual(["BAJFINANCE", "HDFCBANK", "ICICIBANK"]);
  });

  it("records the TATAELXSI consolidated-series gap explicitly", () => {
    const t = report.coverage.find((c) => c.symbol === "TATAELXSI")!;
    expect(t.fundamentals).toBe("partial");
    expect(t.basis).toBe("standalone");
    expect(t.notes.join(" ")).toMatch(/Consolidated series ended/);
  });

  it("has verified filing facts for RELIANCE only", () => {
    expect(report.coverage.filter((c) => c.filingFacts).map((c) => c.symbol)).toEqual(["RELIANCE"]);
  });
});

describe("raw cache and secrets hygiene", () => {
  it("never commits raw responses or env files", () => {
    const gi = readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8");
    expect(gi).toMatch(/^data\/raw\/$/m);
    expect(gi).toMatch(/^\.env\*?/m);
  });
});

describe("EBITDA labelling in the UI", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) ? [p] : [];
    });
  const root = path.join(__dirname, "..");

  it("only mentions EBITDA to say a figure is not EBITDA", () => {
    const offenders: string[] = [];
    for (const f of [...walk(path.join(root, "components")), ...walk(path.join(root, "app"))]) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/ebitda/i.test(line) && !/not ebitda/i.test(line)) offenders.push(`${path.relative(root, f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
