import type { Category } from "./types";

export const inr = (n: number) => n.toLocaleString("en-IN");
export const cr = (n: number) => `₹${inr(Math.round(n))} cr`;
export const price = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const pct = (n: number, d = 1) =>
  Number.isFinite(n) ? `${n > 0 ? "+" : ""}${n.toFixed(d)}%` : "n/a";

export const change = (cur: number, base: number) =>
  base ? ((cur - base) / Math.abs(base)) * 100 : NaN;

export const ago = (h: number) =>
  h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;

export const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-mute");

export const CATEGORY_LABEL: Record<Category, string> = {
  results: "Results",
  "M&A": "M&A",
  fund_raise: "Fund raise",
  management_change: "Management",
  litigation: "Litigation",
  insider_trading: "Insider trading",
  earnings_call: "Earnings call",
  investor_meetings: "Investor meets",
  credit_rating: "Credit rating",
  dividend: "Dividend",
  bonus_split: "Bonus / split",
  capex: "Capex",
  press_release: "Press release",
  postal_ballot: "Postal ballot",
  agm_egm: "AGM / EGM",
  pledging: "Pledging",
  unclassified: "Routine",
};

/** Deterministic series ending near `last`, so sample charts are stable across renders. */
export function sampleSeries(seed: string, last: number, n = 30): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 1000) / 1000;
  const out: number[] = [last];
  for (let i = 1; i < n; i++) out.unshift(out[0] * (1 + (rnd() - 0.5) * 0.03));
  return out;
}
