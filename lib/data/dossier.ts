import type { ScreenerSnapshot, UniverseEntry } from "./types";

export interface DossierView {
  sym: string;
  name: string;
  basis: "consolidated" | "standalone" | null;
  /** snapshot status; "partial" carries a reason the UI must show */
  status: "ok" | "partial";
  reason?: string;
  fetchedAt: string;
  sourceUrl: string;
  /** Newest quarter in the series (YYYY-MM-DD). */
  asOf: string | null;
  quarters: string[];
  quarterEnds: (string | null)[];
  /** screener.in revenue ("Sales"/"Revenue"), ₹ crore. */
  revenue: (number | null)[];
  /** Null for banks and NBFCs, which report Financing Profit instead. */
  operatingProfit: (number | null)[] | null;
  financingProfit: (number | null)[] | null;
  /**
   * Operating profit ÷ revenue × 100 for corporates. Banks and NBFCs have no operating profit, and screener's
   * "Financing Profit" can be negative for a profitable bank, so they get net profit ÷ revenue instead.
   */
  margin: (number | null)[];
  marginLabel: string;
  pat: (number | null)[];
  interest: (number | null)[] | null;
  latestQuarterSourceUrl: string | null;
  topRatios: { name: string; text: string }[];
}

const KEEP_RATIOS = ["Market Cap", "Current Price", "Stock P/E", "ROCE", "ROE", "Dividend Yield"];

/** Last five quarters of the screener snapshot, ready to render. Null when no quarterly table exists. */
export function buildDossierView(u: UniverseEntry, fund: ScreenerSnapshot): DossierView | null {
  const q = fund.tables.quarters;
  if (!q || fund.source.status === "unavailable") return null;
  const n = q.periods.length;
  const from = Math.max(0, n - 5);
  const slice = <T,>(a: T[]) => a.slice(from);
  const row = (key: string) => q.rows.find((r) => r.key === key)?.values ?? null;

  const revenue = row("revenue");
  const op = row("operating_profit");
  const fin = row("financing_profit");
  const patRow = row("pat");
  const numer = op ?? patRow;
  const margin = numer && revenue ? numer.map((v, i) => (v != null && revenue[i] ? (v / (revenue[i] as number)) * 100 : null)) : [];

  return {
    sym: u.symbol,
    name: u.name,
    basis: fund.basis,
    status: fund.source.status === "partial" ? "partial" : "ok",
    reason: fund.source.reason,
    fetchedAt: fund.source.fetchedAt,
    sourceUrl: fund.source.url,
    asOf: fund.source.asOf,
    quarters: slice(q.periods.map((p) => p.label)),
    quarterEnds: slice(q.periods.map((p) => p.end)),
    revenue: slice(revenue ?? q.periods.map(() => null)),
    operatingProfit: op ? slice(op) : null,
    financingProfit: !op && fin ? slice(fin) : null,
    margin: slice(margin.length ? margin : q.periods.map(() => null)),
    marginLabel: op ? "Operating margin" : "Net profit margin",
    pat: slice(row("pat") ?? q.periods.map(() => null)),
    interest: row("interest") ? slice(row("interest")!) : null,
    latestQuarterSourceUrl: q.periodSourceUrls[n - 1] ?? null,
    topRatios: fund.topRatios.filter((r) => KEEP_RATIOS.includes(r.name)).map((r) => ({ name: r.name, text: r.text })),
  };
}
