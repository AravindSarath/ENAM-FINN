import type { ResultsCard, ResultsRow } from "../types";
import { headlineResults } from "./derive";
import type { FilingFacts, ScreenerSnapshot } from "./types";

/** Indian fiscal quarter label for a period end date: 2026-09-30 → "Q2 FY27". */
export function fiscalQuarter(end: string): string {
  const y = Number(end.slice(0, 4));
  const m = Number(end.slice(5, 7));
  const q = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
  const fy = m >= 4 ? y + 1 : y;
  return `Q${q} FY${String(fy).slice(2)}`;
}

const OP_DEFN = "screener.in definition: revenue less operating costs, excludes other income. Not EBITDA.";

/**
 * Latest-quarter results with QoQ and YoY comparatives. Every row uses one definition across its three
 * columns. Verified filing figures are used for Revenue, PBT and PAT when they exist for the same period and
 * basis; otherwise screener's figures are shown under labels that say so. Definitions are never mixed in a row.
 */
export function buildResultsCard(fund: ScreenerSnapshot, facts: FilingFacts | null): ResultsCard | null {
  const q = fund.tables.quarters;
  if (!q) return null;
  const h = headlineResults(q);
  if (!h || !h.periodEnds.cur) return null;

  const applies =
    !!facts &&
    facts.basis === fund.basis &&
    facts.periods[0]?.end === h.periodEnds.cur &&
    facts.periods[1]?.end === h.periodEnds.prevQ &&
    facts.periods[2]?.end === h.periodEnds.yearAgo;
  const f = applies ? facts : null;

  const scr = (key: "revenue" | "operating_profit" | "pbt" | "pat") => h.rows.find((r) => r.key === key)!;
  const fromFiling = (arr: number[]) => ({ cur: arr[0], prevQ: arr[1], yearAgo: arr[2] });
  const notes: string[] = [];

  const rev = scr("revenue");
  const revenueRow: ResultsRow = f
    ? { label: "Revenue from operations", defn: "As reported in the filing, net of GST", ...fromFiling(f.revenueFromOperations) }
    : {
        label: "Revenue",
        defn: "screener.in standardised figure (net of excise duty). The reported figure is not yet extracted from the filing.",
        cur: rev.cur,
        prevQ: rev.prevQ,
        yearAgo: rev.yearAgo,
        reason: rev.reason,
      };

  const op = scr("operating_profit");
  const opRow: ResultsRow = { label: "Operating profit", defn: OP_DEFN, cur: op.cur, prevQ: op.prevQ, yearAgo: op.yearAgo, reason: op.reason };

  const pbt = scr("pbt");
  const pbtRow: ResultsRow = f
    ? { label: "PBT", defn: "Profit before tax, per the filing", ...fromFiling(f.pbt) }
    : { label: "PBT", defn: "Profit before tax, screener.in", cur: pbt.cur, prevQ: pbt.prevQ, yearAgo: pbt.yearAgo, reason: pbt.reason };

  const pat = scr("pat");
  const patRow: ResultsRow = f
    ? { label: "PAT (incl. non-controlling interest)", defn: "Total profit after tax, per the filing", ...fromFiling(f.patInclNci) }
    : {
        label: "Net profit",
        defn: "screener.in. Whether it includes non-controlling interest is not verified for this company.",
        cur: pat.cur,
        prevQ: pat.prevQ,
        yearAgo: pat.yearAgo,
        reason: pat.reason,
      };

  const extras: ResultsRow[] = [];
  if (f) {
    extras.push({ label: "Profit attributable to owners", defn: "Per the filing; excludes non-controlling interest", ...fromFiling(f.patOwners) });
    extras.push({ label: "Revenue net of excise duty", defn: "screener.in figure, kept separately", cur: rev.cur, prevQ: rev.prevQ, yearAgo: rev.yearAgo });
  } else {
    extras.push({
      label: "Profit attributable to owners",
      cur: null,
      prevQ: null,
      yearAgo: null,
      reason: "Unavailable: needs extraction from the filing",
    });
  }

  if (f) notes.push("Revenue, PBT and PAT are transcribed from the filing and verified. Operating profit is screener.in's.");
  else notes.push("Figures are screener.in's standardised numbers, not yet reconciled to the filing.");
  if (op.reason) notes.push(op.reason);

  // Margin uses screener's own revenue so numerator and denominator share one definition.
  const margin =
    op.cur != null && rev.cur
      ? { cur: (op.cur / rev.cur) * 100, prevQ: op.prevQ != null && rev.prevQ ? (op.prevQ / rev.prevQ) * 100 : null }
      : null;

  const urls = [f?.source.url, f?.source.altUrl, h.sourceUrls.cur].filter((u): u is string => !!u);

  return {
    periodLabel: `${fiscalQuarter(h.periodEnds.cur)} · ${h.periods.cur}`,
    basis: fund.basis,
    rows: [revenueRow, opRow, pbtRow, patRow],
    extras,
    margin,
    notes,
    sourceUrls: [...new Set(urls)],
  };
}
