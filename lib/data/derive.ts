/** Derived metrics, computed in code from snapshots. Nothing here is typed in by hand. */
import type { PriceBar, StatementTable } from "./types";

export const pctChange = (cur: number | null, base: number | null): number | null =>
  cur == null || base == null || base === 0 ? null : ((cur - base) / Math.abs(base)) * 100;

export interface PriceMetrics {
  asOf: string;
  last: number;
  prevClose: number;
  /** (close / previous close − 1) × 100 */
  dayPct: number;
  volume: number | null;
  /** Mean volume of the 20 sessions before the latest one (the latest is excluded). */
  avgVolume20: number | null;
  /** latest volume ÷ avgVolume20 */
  volumeMultiple: number | null;
}

/** Needs at least two bars for a day move and 21 bars (with volume) for a volume multiple. */
export function priceMetrics(bars: PriceBar[], window = 20): PriceMetrics | null {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const base = bars.slice(-1 - window, -1);
  const vols = base.map((b) => b.volume).filter((v): v is number => v != null && v > 0);
  const avg = base.length === window && vols.length === window ? vols.reduce((s, v) => s + v, 0) / window : null;
  return {
    asOf: last.date,
    last: last.close,
    prevClose: prev.close,
    dayPct: (last.close / prev.close - 1) * 100,
    volume: last.volume,
    avgVolume20: avg,
    volumeMultiple: avg && last.volume != null ? last.volume / avg : null,
  };
}

export interface HeadlineValue {
  cur: number | null;
  prevQ: number | null;
  yearAgo: number | null;
  /** Why a value is null, when it is. */
  reason?: string;
}

export interface HeadlineRow extends HeadlineValue {
  /** Display label. "Operating profit" is never relabelled as EBITDA. */
  label: string;
  key: "revenue" | "operating_profit" | "pbt" | "pat";
  /** The source row this was read from, or null if the company type has no such row. */
  sourceRow: string | null;
}

export interface HeadlineResults {
  periods: { cur: string; prevQ: string | null; yearAgo: string | null };
  periodEnds: { cur: string | null; prevQ: string | null; yearAgo: string | null };
  rows: HeadlineRow[];
  sourceUrls: { cur: string | null; prevQ: string | null; yearAgo: string | null };
}

const LABEL: Record<HeadlineRow["key"], string> = {
  revenue: "Revenue",
  operating_profit: "Operating profit",
  pbt: "PBT",
  pat: "PAT",
};

/** The same calendar month, one year earlier. Matches on period end date. */
function yearAgoIndex(table: StatementTable, i: number): number {
  const end = table.periods[i].end;
  if (!end) return -1;
  const target = `${Number(end.slice(0, 4)) - 1}${end.slice(4)}`;
  const exact = table.periods.findIndex((p) => p.end === target);
  if (exact >= 0) return exact;
  // Month-end dates differ in leap years (29 Feb vs 28 Feb): fall back to same year-month.
  return table.periods.findIndex((p) => p.end?.slice(0, 7) === target.slice(0, 7));
}

/**
 * Latest-quarter headline numbers with QoQ and YoY comparatives, read straight from the quarterly table.
 * `prevQ` is the immediately preceding column; `yearAgo` is the same quarter a year earlier.
 * If the company has no Operating Profit row (banks/NBFCs report Financing Profit), that row is null with a reason.
 */
export function headlineResults(quarters: StatementTable, periodIndex?: number): HeadlineResults | null {
  const real = quarters.periods.map((p, i) => (p.kind === "quarter" ? i : -1)).filter((i) => i >= 0);
  if (real.length === 0) return null;
  const i = periodIndex ?? real[real.length - 1];
  const p = i - 1 >= 0 && quarters.periods[i - 1].kind === "quarter" ? i - 1 : -1;
  const y = yearAgoIndex(quarters, i);

  const rows: HeadlineRow[] = (["revenue", "operating_profit", "pbt", "pat"] as const).map((key) => {
    const row = quarters.rows.find((r) => r.key === key);
    if (!row) {
      const fin = key === "operating_profit" && quarters.rows.some((r) => r.key === "financing_profit");
      return {
        label: LABEL[key],
        key,
        sourceRow: null,
        cur: null,
        prevQ: null,
        yearAgo: null,
        reason: fin
          ? "Not reported for this company type (screener shows Financing Profit instead)"
          : "Row not present in source table",
      };
    }
    return {
      label: LABEL[key],
      key,
      sourceRow: row.label,
      cur: row.values[i] ?? null,
      prevQ: p >= 0 ? (row.values[p] ?? null) : null,
      yearAgo: y >= 0 ? (row.values[y] ?? null) : null,
    };
  });

  const at = (j: number) => (j >= 0 ? quarters.periods[j] : null);
  const url = (j: number) => (j >= 0 ? (quarters.periodSourceUrls[j] ?? null) : null);
  return {
    periods: { cur: quarters.periods[i].label, prevQ: at(p)?.label ?? null, yearAgo: at(y)?.label ?? null },
    periodEnds: { cur: quarters.periods[i].end, prevQ: at(p)?.end ?? null, yearAgo: at(y)?.end ?? null },
    rows,
    sourceUrls: { cur: url(i), prevQ: url(p), yearAgo: url(y) },
  };
}
