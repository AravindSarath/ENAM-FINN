import type { Period } from "./types";

/** Parses figures as printed by screener: "1,23,456", "−12", "(1,234)", "18%", "" (blank) and "-" (nil). */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let t = raw.replace(/ /g, " ").replace(/[₹,%\s]/g, "").replace(/[−–]/g, "-");
  if (t === "" || t === "-" || t === "—") return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return neg ? -n : n;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const monthIndex = (m: string) => MONTHS.indexOf(m.slice(0, 3).toLowerCase());

/** Last calendar day of a month as YYYY-MM-DD. */
export function monthEnd(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0 + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** Builds a Period from a column header like "Sep 2026" and an optional data-date-key (YYYY-MM-DD). */
export function parsePeriod(label: string, dateKey: string | null, defaultKind: "quarter" | "year"): Period {
  const clean = label.replace(/\s+/g, " ").trim();
  if (/^ttm$/i.test(clean)) return { label: "TTM", end: null, kind: "ttm" };
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { label: clean, end: dateKey, kind: defaultKind };
  const m = clean.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m && monthIndex(m[1]) >= 0) return { label: clean, end: monthEnd(Number(m[2]), monthIndex(m[1])), kind: defaultKind };
  return { label: clean, end: null, kind: defaultKind };
}

/**
 * NSE timestamps look like "31-Oct-2026 17:34:03" and are in IST (UTC+05:30).
 * Returns an ISO string in UTC, or null if the string is not in that format.
 */
export function istToIso(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const mi = monthIndex(m[2]);
  if (mi < 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(`${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** dd-mm-yyyy, as NSE's query parameters expect. */
export function nseDate(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(ist.getUTCDate())}-${pad(ist.getUTCMonth() + 1)}-${ist.getUTCFullYear()}`;
}

/** Canonical keys for the statement rows we rely on. Labels differ for banks/NBFCs. */
export function rowKey(label: string): string | null {
  const l = label.toLowerCase().replace(/\s+/g, " ").trim();
  const map: Record<string, string> = {
    sales: "revenue",
    revenue: "revenue",
    expenses: "expenses",
    "operating profit": "operating_profit",
    "opm %": "operating_margin_pct",
    "financing profit": "financing_profit",
    "financing margin %": "financing_margin_pct",
    "other income": "other_income",
    interest: "interest",
    depreciation: "depreciation",
    "profit before tax": "pbt",
    "tax %": "tax_pct",
    "net profit": "pat",
    "eps in rs": "eps",
    "gross npa %": "gross_npa_pct",
    "net npa %": "net_npa_pct",
    "equity capital": "equity_capital",
    reserves: "reserves",
    borrowings: "borrowings",
    borrowing: "borrowings",
    deposits: "deposits",
    "total liabilities": "total_liabilities",
    "total assets": "total_assets",
    "cash from operating activity": "cfo",
    "cash from investing activity": "cfi",
    "cash from financing activity": "cff",
    "free cash flow": "fcf",
  };
  return map[l] ?? null;
}

export function rowUnit(label: string): "INR_crore" | "INR" | "percent" | "ratio" | "days" {
  const l = label.toLowerCase();
  if (l.includes("%")) return "percent";
  if (l.startsWith("eps")) return "INR";
  if (l.includes("days")) return "days";
  if (l.includes("ratio") || l === "roce %") return "ratio";
  return "INR_crore";
}
