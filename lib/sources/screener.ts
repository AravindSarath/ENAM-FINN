import * as cheerio from "cheerio";
import { parseNumber, parsePeriod, rowKey, rowUnit } from "../data/normalize";
import type { Basis, DocLink, ScreenerSnapshot, StatementRow, StatementTable } from "../data/types";
import { request } from "./http";

const ORIGIN = "https://www.screener.in";

export const screenerUrl = (slug: string, basis: "consolidated" | "standalone" = "consolidated") =>
  basis === "consolidated" ? `${ORIGIN}/company/${encodeURIComponent(slug)}/consolidated/` : `${ORIGIN}/company/${encodeURIComponent(slug)}/`;

const SECTIONS: { id: StatementTable["section"]; kind: "quarter" | "year" }[] = [
  { id: "quarters", kind: "quarter" },
  { id: "profit-loss", kind: "year" },
  { id: "balance-sheet", kind: "year" },
  { id: "cash-flow", kind: "year" },
  { id: "ratios", kind: "year" },
];

const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
/** Row labels carry a trailing "+" expander and sometimes a tooltip; keep only the visible label. */
const cleanLabel = (s: string) => clean(s).replace(/\s*\+$/, "").replace(/\s+(Share of operating profit|Cash from operations).*$/i, "");

/**
 * Pure parser for a screener.in company page. Never throws on a missing section: the table is simply absent
 * and `source.status` becomes "partial". Values it cannot parse become null.
 */
export function parseScreenerHtml(html: string, ctx: { symbol: string; url: string; fetchedAt: string }): ScreenerSnapshot {
  const $ = cheerio.load(html);
  const tables: ScreenerSnapshot["tables"] = {};
  let basis: Basis | null = null;
  const missing: string[] = [];

  for (const { id, kind } of SECTIONS) {
    const sec = $(`section#${id}`);
    if (sec.length === 0) {
      missing.push(id);
      continue;
    }
    const sub = clean(sec.find("p.sub").first().text());
    // The sub-heading starts with the basis shown ("Consolidated Figures in Rs. Crores / View Standalone"),
    // so only the leading word counts; the "View ..." link names the other basis.
    const lead = sub.match(/^(consolidated|standalone)\b/i)?.[1].toLowerCase();
    const b = lead === "standalone" || lead === "consolidated" ? lead : null;
    if (b && !basis) basis = b;

    const table = sec.find("[data-result-table] table.data-table, table.data-table").first();
    if (table.length === 0) {
      missing.push(id);
      continue;
    }

    const periods = table
      .find("thead th")
      .toArray()
      .slice(1)
      .map((th) => parsePeriod($(th).text(), $(th).attr("data-date-key") ?? null, kind));

    const rows: StatementRow[] = [];
    let periodSourceUrls: (string | null)[] = periods.map(() => null);
    table.find("tbody tr").each((_, tr) => {
      const cells = $(tr).find("td").toArray();
      if (cells.length < 2) return;
      const label = cleanLabel($(cells[0]).text());
      if (!label) return;
      if (/^raw pdf$/i.test(label)) {
        periodSourceUrls = cells.slice(1).map((c) => {
          const href = $(c).find("a").attr("href");
          return href ? new URL(href, ORIGIN).toString() : null;
        });
        return;
      }
      rows.push({
        label,
        key: rowKey(label),
        unit: rowUnit(label),
        values: cells.slice(1).map((c) => parseNumber($(c).text())),
      });
    });

    tables[id] = { section: id, title: clean(sec.find("h2").first().text()), unitNote: sub, periods, rows, periodSourceUrls };
  }

  const topRatios = $("#top-ratios li")
    .toArray()
    .map((li) => {
      const name = clean($(li).find(".name").text());
      const val = $(li).find(".value");
      return { name, text: clean(val.text()), value: parseNumber(val.find(".number").first().text()) };
    })
    .filter((r) => r.name);

  const documents: DocLink[] = [];
  $("section#documents .documents").each((_, block) => {
    const group = clean($(block).find("h3").first().text());
    $(block)
      .find("ul.list-links li")
      .each((__, li) => {
        const label = clean($(li).children("div").first().text());
        const links = $(li)
          .find("a[href]")
          .toArray()
          .map((a) => ({ text: clean($(a).text()), url: new URL($(a).attr("href")!, ORIGIN).toString() }))
          .filter((l) => l.text);
        if (links.length) documents.push({ group, label: label || links[0].text, links });
      });
  });

  const quarters = tables.quarters;
  const lastEnd = quarters?.periods.filter((p) => p.end).map((p) => p.end as string).sort().pop() ?? null;
  const companyId =
    html.match(/\/company\/source\/quarter\/(\d+)\//)?.[1] ?? html.match(/data-warehouse-id="(\d+)"/)?.[1] ?? null;

  const hasData = Object.keys(tables).length > 0;
  const status = !hasData ? "unavailable" : missing.length > 0 ? "partial" : "ok";

  return {
    schema: 1,
    symbol: ctx.symbol,
    source: {
      name: "screener.in company page",
      url: ctx.url,
      fetchedAt: ctx.fetchedAt,
      asOf: lastEnd,
      status,
      reason: status === "ok" ? undefined : hasData ? `Sections not found: ${missing.join(", ")}` : "No statement tables found on the page",
    },
    basis,
    companyName: clean($("h1").first().text()) || null,
    companyId,
    topRatios,
    tables,
    documents,
  };
}

const STALE_DAYS = 200;

/** A quarterly series whose newest quarter is older than this at fetch time is treated as stale. */
export function isStale(snap: ScreenerSnapshot): boolean {
  const asOf = snap.source.asOf;
  if (!asOf) return false;
  return (new Date(snap.source.fetchedAt).getTime() - new Date(asOf).getTime()) / 86400_000 > STALE_DAYS;
}

async function fetchOne(symbol: string, url: string, refresh: boolean) {
  const res = await request(url, { cacheTtlMs: refresh ? 0 : 24 * 3600_000 });
  const ctx = { symbol, url, fetchedAt: res.fetchedAt };
  if (res.status !== 200) {
    const snap = parseScreenerHtml("", ctx);
    snap.source.reason = `HTTP ${res.status}`;
    return snap;
  }
  return parseScreenerHtml(res.body.toString("utf8"), ctx);
}

/**
 * Fetches the consolidated page. If its quarterly series is stale (some companies stopped publishing a
 * consolidated series), the standalone page is tried and used only if it is fresher. Staleness is always recorded.
 */
export async function fetchScreener(symbol: string, slug: string, opts: { refresh?: boolean } = {}) {
  const refresh = !!opts.refresh;
  const cons = await fetchOne(symbol, screenerUrl(slug, "consolidated"), refresh);
  if (!isStale(cons)) return cons;

  const stand = await fetchOne(symbol, screenerUrl(slug, "standalone"), refresh);
  if (!isStale(stand) && stand.source.status !== "unavailable") {
    stand.source.status = "partial";
    stand.source.reason = `Consolidated series ended ${cons.source.asOf}; using the standalone page instead`;
    return stand;
  }
  cons.source.status = "partial";
  cons.source.reason = `Stale: newest quarter is ${cons.source.asOf}${stand.source.asOf ? ` (standalone: ${stand.source.asOf})` : ""}`;
  return cons;
}
