import { request } from "./http";
import type { PriceBar, PriceSnapshot } from "../data/types";

export const yahooUrl = (yahooSymbol: string, range = "6mo", interval = "1d") =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`;

interface ChartResult {
  meta?: {
    currency?: string;
    exchangeTimezoneName?: string;
    gmtoffset?: number;
    regularMarketTime?: number;
    currentTradingPeriod?: { regular?: { start: number; end: number } };
  };
  timestamp?: number[];
  indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
}

/**
 * Pure parser. Bars with no close are dropped (Yahoo emits nulls for non-trading placeholders).
 * Dates are the exchange-local trading date, derived from the response's own UTC offset.
 */
export function parseYahooChart(
  json: unknown,
  ctx: { symbol: string; yahooSymbol: string; url: string; fetchedAt: string; range: string; interval: string; nowSec?: number },
): PriceSnapshot {
  const base = { schema: 1 as const, symbol: ctx.symbol, yahooSymbol: ctx.yahooSymbol, range: ctx.range, interval: ctx.interval };
  const unavailable = (reason: string): PriceSnapshot => ({
    ...base,
    source: { name: "Yahoo Finance chart API", url: ctx.url, fetchedAt: ctx.fetchedAt, asOf: null, status: "unavailable", reason },
    currency: null,
    exchangeTimezone: null,
    lastBarPartial: false,
    regularMarketTime: null,
    bars: [],
  });

  const chart = (json as { chart?: { result?: ChartResult[] | null; error?: { description?: string } | null } })?.chart;
  const r = chart?.result?.[0];
  if (!r) return unavailable(chart?.error?.description ?? "No chart result in response");

  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0];
  if (!q || ts.length === 0) return unavailable("Response contained no price series");

  const offset = r.meta?.gmtoffset ?? 0;
  const bars: PriceBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    bars.push({
      date: new Date((ts[i] + offset) * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close,
      volume: q.volume?.[i] ?? null,
    });
  }
  if (bars.length === 0) return unavailable("All bars were empty");

  // One bar per date: if Yahoo appends a live quote for a date already present, the later entry wins.
  const byDate = new Map<string, PriceBar>();
  for (const b of bars) byDate.set(b.date, b);
  const dedup = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  const now = ctx.nowSec ?? Date.now() / 1000;
  const reg = r.meta?.currentTradingPeriod?.regular;
  const partial = !!reg && now >= reg.start && now < reg.end;
  const rmt = r.meta?.regularMarketTime;

  return {
    ...base,
    source: {
      name: "Yahoo Finance chart API",
      url: ctx.url,
      fetchedAt: ctx.fetchedAt,
      asOf: dedup[dedup.length - 1].date,
      status: "ok",
    },
    currency: r.meta?.currency ?? null,
    exchangeTimezone: r.meta?.exchangeTimezoneName ?? null,
    lastBarPartial: partial,
    regularMarketTime: rmt ? new Date(rmt * 1000).toISOString() : null,
    bars: dedup,
  };
}

export async function fetchPrices(symbol: string, yahooSymbol: string, opts: { refresh?: boolean; range?: string } = {}) {
  const range = opts.range ?? "6mo";
  const url = yahooUrl(yahooSymbol, range);
  const res = await request(url, { cacheTtlMs: opts.refresh ? 0 : 6 * 3600_000 });
  const ctx = { symbol, yahooSymbol, url, fetchedAt: res.fetchedAt, range, interval: "1d" };
  if (res.status !== 200) {
    return parseYahooChart({ chart: { error: { description: `HTTP ${res.status}` } } }, ctx);
  }
  return parseYahooChart(JSON.parse(res.body.toString("utf8")), ctx);
}
