/**
 * Facts about a stock's latest session relative to its own history. Everything here is computed from the price
 * snapshot; nothing is interpreted. Returns null (never zero) when the history is too short.
 */
import { priceMetrics } from "./derive";
import type { PriceBar } from "./types";

export interface MoveStats {
  /** Standard deviation (percent) of daily returns over the sessions before the latest one. */
  sigmaPct: number | null;
  /** |latest return| ÷ sigma. */
  sigmaMultiple: number | null;
  /** Sessions in the history used for sigma. */
  sigmaSessions: number;
  /**
   * How long the latest move has been the largest in its direction: the number of sessions back to the previous
   * move at least as large (same sign), or the whole history if there is none.
   */
  largest: { direction: "fall" | "rise"; sessions: number; wholeHistory: boolean } | null;
  /** Earlier consecutive sessions that were also beyond the default thresholds. */
  consecutive: number;
}

const MIN_SESSIONS = 20;
const MAX_SIGMA_SESSIONS = 60;

export function dailyReturns(bars: PriceBar[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < bars.length; i++) r.push((bars[i].close / bars[i - 1].close - 1) * 100);
  return r;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function moveStats(bars: PriceBar[], thresholds = { volX: 2, movePct: 4 }): MoveStats | null {
  const rets = dailyReturns(bars);
  if (rets.length < 2) return null;
  const latest = rets[rets.length - 1];
  const prior = rets.slice(0, -1);
  const window = prior.slice(-MAX_SIGMA_SESSIONS);
  const sigma = window.length >= MIN_SESSIONS ? stdev(window) : null;

  let largest: MoveStats["largest"] = null;
  if (latest !== 0) {
    const sign = Math.sign(latest);
    let sessions = prior.length;
    let whole = true;
    for (let i = prior.length - 1; i >= 0; i--) {
      if (Math.sign(prior[i]) === sign && Math.abs(prior[i]) >= Math.abs(latest)) {
        sessions = prior.length - 1 - i;
        whole = false;
        break;
      }
    }
    largest = { direction: latest < 0 ? "fall" : "rise", sessions, wholeHistory: whole };
  }

  // Earlier sessions that were also unusual, counted backwards from the session before the latest.
  let consecutive = 0;
  for (let end = bars.length - 1; end >= 2; end--) {
    const m = priceMetrics(bars.slice(0, end));
    if (!m) break;
    const unusual = (m.volumeMultiple != null && m.volumeMultiple >= thresholds.volX) || Math.abs(m.dayPct) >= thresholds.movePct;
    if (!unusual) break;
    consecutive++;
  }

  return {
    sigmaPct: sigma,
    sigmaMultiple: sigma ? Math.abs(latest) / sigma : null,
    sigmaSessions: window.length,
    largest,
    consecutive,
  };
}

/** Plain-language facts for a move card. Only statements the numbers support. */
export function moveFacts(s: MoveStats): string[] {
  const out: string[] = [];
  if (s.sigmaMultiple != null && s.sigmaPct != null) out.push(`${s.sigmaMultiple.toFixed(1)}× its own typical daily move (±${s.sigmaPct.toFixed(1)}% over ${s.sigmaSessions} sessions)`);
  if (s.largest && s.largest.sessions >= 20) out.push(`Largest ${s.largest.direction} in ${s.largest.wholeHistory ? `the ${s.largest.sessions} sessions on record` : `${s.largest.sessions} sessions`}`);
  if (s.consecutive >= 1) out.push(`${s.consecutive + 1} unusual sessions in a row`);
  return out;
}
