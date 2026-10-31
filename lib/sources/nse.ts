import { classify } from "../data/classify";
import { istToIso, nseDate } from "../data/normalize";
import type { Announcement, AnnouncementSnapshot } from "../data/types";
import { request } from "./http";

export const nseAnnouncementsUrl = (symbol: string, from: Date, to: Date) =>
  `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}&from_date=${nseDate(from)}&to_date=${nseDate(to)}`;

interface RawAnnouncement {
  symbol?: string;
  sm_name?: string;
  sm_isin?: string;
  desc?: string;
  attchmntText?: string;
  attchmntFile?: string | null;
  attFileSize?: string | null;
  an_dt?: string;
  seq_id?: string;
  hasXbrl?: boolean;
}

/** Pure parser. Records without an id or a parseable timestamp are skipped and counted in `reason`. */
export function parseNseAnnouncements(
  json: unknown,
  ctx: { symbol: string; url: string; fetchedAt: string; from: string; to: string },
): AnnouncementSnapshot {
  const window = { from: ctx.from, to: ctx.to };
  const mk = (items: Announcement[], status: "ok" | "partial" | "unavailable", reason?: string): AnnouncementSnapshot => ({
    schema: 1,
    symbol: ctx.symbol,
    source: {
      name: "NSE corporate announcements API",
      url: ctx.url,
      fetchedAt: ctx.fetchedAt,
      asOf: items[0]?.announcedAt ?? null,
      status,
      reason,
    },
    window,
    count: items.length,
    items,
  });

  if (!Array.isArray(json)) return mk([], "unavailable", "Response was not a list");

  const seen = new Set<string>();
  const items: Announcement[] = [];
  let skipped = 0;
  for (const r of json as RawAnnouncement[]) {
    const id = r.seq_id?.trim();
    const at = r.an_dt ? istToIso(r.an_dt) : null;
    if (!id || !at || (r.symbol && r.symbol.toUpperCase() !== ctx.symbol.toUpperCase())) {
      skipped++;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const text = (r.attchmntText ?? "").replace(/\s+/g, " ").trim();
    const nseDesc = (r.desc ?? "").trim();
    items.push({
      id,
      symbol: ctx.symbol,
      company: r.sm_name ?? null,
      isin: r.sm_isin ?? null,
      nseDesc,
      text,
      attachmentUrl: r.attchmntFile?.trim() || null,
      attachmentSize: r.attFileSize ?? null,
      announcedAt: at,
      announcedAtRaw: r.an_dt!,
      hasXbrl: !!r.hasXbrl,
      classification: classify(nseDesc, text),
    });
  }
  items.sort((a, b) => b.announcedAt.localeCompare(a.announcedAt));
  return skipped > 0
    ? mk(items, "partial", `${skipped} record(s) skipped (missing id, unparseable time or symbol mismatch)`)
    : mk(items, "ok");
}

export async function fetchAnnouncements(symbol: string, days = 30, opts: { refresh?: boolean; now?: Date } = {}) {
  const to = opts.now ?? new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const url = nseAnnouncementsUrl(symbol, from, to);
  const res = await request(url, {
    headers: { Referer: "https://www.nseindia.com/", Accept: "application/json" },
    cacheTtlMs: opts.refresh ? 0 : 6 * 3600_000,
  });
  const ctx = { symbol, url, fetchedAt: res.fetchedAt, from: nseDate(from), to: nseDate(to) };
  if (res.status !== 200) return parseNseAnnouncements({ error: res.status }, ctx);
  try {
    return parseNseAnnouncements(JSON.parse(res.body.toString("utf8")), ctx);
  } catch {
    return parseNseAnnouncements(null, ctx);
  }
}
