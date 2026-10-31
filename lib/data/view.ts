/**
 * Turns committed snapshots into the props the Brief, Portfolio and Alerts screens render.
 * `buildBrief` is pure (testable); `loadBrief` reads data/ and calls it.
 */
import { CATEGORY_LABEL, pct } from "../format";
import { SAMPLE_ITEMS } from "../mock";
import type { FeedItem, Holding } from "../types";
import { pctChange, priceMetrics } from "./derive";
import { buildResultsCard, fiscalQuarter } from "./results";
import { reactsTo, sessionCloseMs, tierFor } from "./score";
import type { Announcement, AnnouncementSnapshot, FilingFacts, PriceSnapshot, ScreenerSnapshot, UniverseEntry } from "./types";
import { loadAnnouncements, loadFilingFacts, loadFundamentals, loadManifest, loadPrices, loadUniverse } from "./load";

/** Default "unusual" thresholds used to decide which moves become cards. Alerts lets the user change theirs. */
export const DEFAULT_VOL_X = 2;
export const DEFAULT_MOVE_PCT = 4;

export interface BriefInput {
  universe: UniverseEntry[];
  asOf: string;
  prices: Record<string, PriceSnapshot | null>;
  announcements: Record<string, AnnouncementSnapshot | null>;
  fundamentals: Record<string, ScreenerSnapshot | null>;
  facts: Record<string, FilingFacts | null>;
}

export interface BriefData {
  asOf: string;
  asOfLabel: string;
  holdings: Holding[];
  feed: FeedItem[];
}

export function fmtIst(iso: string, withYear = true): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${parts.replace(",", withYear ? "," : "")} IST`.replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
}

const truncate = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const informative = (t: string) => t.length >= 25 && !/has informed the exchange/i.test(t);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Reads "quarter and half year ended September 30, 2026" and "ended 30th September 2026" style phrases into
 * YYYY-MM-DD. Returns null rather than guessing when the text states no period.
 */
export function periodEndFromText(text: string): string | null {
  const lead = String.raw`(?:quarter|half[- ]year|year|period)(?: and (?:half[- ]year|six months|year|nine months|twelve months))? ended (?:on )?(?:the )?`;
  const mdy = text.match(new RegExp(String.raw`${lead}([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})`, "i"));
  const dmy = text.match(new RegExp(String.raw`${lead}(\d{1,2})(?:st|nd|rd|th)?,? ([A-Za-z]+),? (\d{4})`, "i"));
  let mon: string | undefined, day: string | undefined, year: string | undefined;
  if (dmy && MONTHS.includes(dmy[2].toLowerCase())) [, day, mon, year] = dmy;
  else if (mdy && MONTHS.includes(mdy[1].toLowerCase())) [, mon, day, year] = mdy;
  if (!mon || !day || !year) return null;
  return `${year}-${String(MONTHS.indexOf(mon.toLowerCase()) + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function holdingFrom(u: UniverseEntry, snap: PriceSnapshot | null, asOfMs: number): Holding {
  const base = { sym: u.symbol, name: u.name, sector: u.sector, weight: u.weight ?? 0 };
  const m = snap && snap.source.status !== "unavailable" ? priceMetrics(snap.bars) : null;
  if (!snap || !m) {
    return { ...base, price: null, dayPct: null, volX: null, priceAsOf: null, closeHoursAgo: null, series: [], reason: snap?.source.reason ?? "Price snapshot not available" };
  }
  return {
    ...base,
    price: m.last,
    dayPct: m.dayPct,
    volX: m.volumeMultiple,
    priceAsOf: m.asOf,
    closeHoursAgo: (asOfMs - sessionCloseMs(m.asOf)) / 3_600_000,
    series: snap.bars.slice(-30).map((b) => b.close),
    reason: m.volumeMultiple == null ? "Volume multiple unavailable: fewer than 20 prior sessions with volume" : undefined,
  };
}

function titleFor(a: Announcement): string {
  return informative(a.text) ? truncate(a.text, 110) : a.nseDesc || CATEGORY_LABEL[a.classification.category];
}

export function buildBrief(input: BriefInput): BriefData {
  const asOfMs = new Date(input.asOf).getTime();
  const portfolio = input.universe.filter((u) => u.group === "portfolio");
  const holdings = portfolio.map((u) => holdingFrom(u, input.prices[u.symbol] ?? null, asOfMs));
  const feed: FeedItem[] = [];
  const hoursAgo = (iso: string) => Math.max(0, (asOfMs - new Date(iso).getTime()) / 3_600_000);

  for (const u of portfolio) {
    const ann = input.announcements[u.symbol];
    if (!ann || ann.source.status === "unavailable") continue;
    const h = holdings.find((x) => x.sym === u.symbol)!;
    const fund = input.fundamentals[u.symbol] ?? null;
    const facts = input.facts[u.symbol] ?? null;
    const sorted = [...ann.items].sort((a, b) => a.announcedAt.localeCompare(b.announcedAt));
    const used = new Set<string>();

    const reaction = (a: Announcement): string | null => {
      if (!h.priceAsOf || !reactsTo(a.announcedAt, h.priceAsOf)) return null;
      const bits: string[] = [];
      if (h.volX != null && h.volX >= DEFAULT_VOL_X) bits.push(`volume ${h.volX.toFixed(1)}× average`);
      if (h.dayPct != null && Math.abs(h.dayPct) >= DEFAULT_MOVE_PCT) bits.push(`price ${pct(h.dayPct)}`);
      return bits.length ? `${bits.join(" and ")} on the ${h.priceAsOf} session` : null;
    };

    // 1. Results clusters: the board outcome becomes the card; same-day-and-after follow-ups fold into it.
    const outcomes = sorted.filter((a) => a.nseDesc === "Outcome of Board Meeting" && a.classification.category === "results");
    for (const o of outcomes) {
      if (used.has(o.id)) continue;
      const t0 = new Date(o.announcedAt).getTime();
      const group = outcomes.filter((x) => !used.has(x.id) && Math.abs(new Date(x.announcedAt).getTime() - t0) <= 3_600_000);
      const primary = group.find((x) => x.attachmentUrl) ?? group[0];
      // A results card needs a stated reporting period. Without one the filing stays a plain noted item.
      const stated = group.map((x) => periodEndFromText(x.text)).find((d) => d != null) ?? null;
      if (!stated) continue;
      group.forEach((x) => used.add(x.id));
      const related = sorted.filter(
        (a) =>
          !used.has(a.id) &&
          ["results", "earnings_call"].includes(a.classification.category) &&
          (new Date(a.announcedAt).getTime() - t0) / 3_600_000 >= -1 &&
          (new Date(a.announcedAt).getTime() - t0) / 3_600_000 <= 72,
      );
      related.forEach((x) => used.add(x.id));
      const others = [...group.filter((x) => x.id !== primary.id), ...related];

      const textEnd = stated;
      const latestEnd = fund?.source.asOf ?? null;
      let card = null as ReturnType<typeof buildResultsCard>;
      let pending: string | undefined;
      if (!fund || fund.source.status === "unavailable") pending = "Fundamentals snapshot unavailable, so the headline numbers cannot be shown.";
      else if (textEnd !== latestEnd) pending = `screener.in's latest quarter is ${latestEnd ?? "unknown"}, not the ${textEnd} period of this filing. Numbers are withheld rather than guessed.`;
      else card = buildResultsCard(fund, facts);

      const q = textEnd ? fiscalQuarter(textEnd) : null;
      let soWhat = "";
      if (card) {
        const get = (label: string) => card!.rows.find((r) => r.label.startsWith(label));
        const op = get("Operating profit");
        const pat = get("PAT") ?? get("Net profit");
        const bits: string[] = [];
        const opQ = op ? pctChange(op.cur, op.prevQ) : null;
        const patQ = pat ? pctChange(pat.cur, pat.prevQ) : null;
        if (opQ != null) bits.push(`Operating profit ${pct(opQ)} QoQ`);
        if (patQ != null) bits.push(`PAT ${pct(patQ)} QoQ`);
        soWhat = bits.join(", ");
      } else if (pending) soWhat = pending;

      feed.push({
        id: `${u.symbol}-results-${primary.id}`,
        sym: u.symbol,
        cat: "results",
        title: q ? `${q} results filed` : "Results filed",
        hoursAgo: hoursAgo(primary.announcedAt),
        tier: "act",
        why: "Results: quarterly results are the highest-priority category",
        soWhat,
        kind: "results",
        url: primary.attachmentUrl ?? undefined,
        sourceLabel: `NSE · ${fmtIst(primary.announcedAt)}`,
        sample: false,
        related: others.map((x) => ({ title: titleFor(x), url: x.attachmentUrl, hoursAgo: hoursAgo(x.announcedAt) })),
        results: card ?? {
          periodLabel: q && textEnd ? `${q} · ${textEnd}` : "Period unknown",
          basis: fund?.basis ?? null,
          rows: [],
          extras: [],
          margin: null,
          notes: [],
          sourceUrls: [],
          pending,
        },
      });
    }

    // 2. Everything else, tiered by policy. Repeats of the same NSE label within 72h fold into one card.
    const generic: { a: Announcement; item: FeedItem }[] = [];
    for (const a of sorted) {
      if (used.has(a.id)) continue;
      const c = a.classification;
      const isNotice = c.category === "results" && /scheduled|intimation|to consider/i.test(a.text) && !/approved/i.test(a.text);
      const t = isNotice
        ? { tier: "note" as const, why: "Results: board meeting date notice. The numbers come with the outcome" }
        : tierFor({ category: c.category, classification: c, text: a.text, reaction: reaction(a) });
      generic.push({
        a,
        item: {
          id: `${u.symbol}-${a.id}`,
          sym: u.symbol,
          cat: c.category,
          title: isNotice ? "Board meeting on results scheduled" : titleFor(a),
          hoursAgo: hoursAgo(a.announcedAt),
          tier: t.tier,
          why: `${t.why} · classified by rule ${c.rule} (${c.confidence} confidence)`,
          soWhat: !isNotice && informative(a.text) && titleFor(a) !== truncate(a.text, 110) ? truncate(a.text, 240) : isNotice ? truncate(a.text, 240) : "",
          kind: "generic",
          url: a.attachmentUrl ?? undefined,
          sourceLabel: `NSE · ${fmtIst(a.announcedAt)} · ${a.nseDesc}`,
          sample: false,
        },
      });
    }
    const byLabel = new Map<string, { a: Announcement; item: FeedItem }[]>();
    for (const g of generic) byLabel.set(g.a.nseDesc, [...(byLabel.get(g.a.nseDesc) ?? []), g]);
    for (const list of byLabel.values()) {
      let chain: typeof list = [];
      const flush = () => {
        if (chain.length === 0) return;
        const primary = chain[chain.length - 1]; // newest
        const older = chain.slice(0, -1);
        feed.push(
          older.length
            ? { ...primary.item, related: older.reverse().map((o) => ({ title: o.item.title, url: o.item.url ?? null, hoursAgo: o.item.hoursAgo })) }
            : primary.item,
        );
        chain = [];
      };
      for (const g of list) {
        const prev = chain[chain.length - 1];
        if (prev && new Date(g.a.announcedAt).getTime() - new Date(prev.a.announcedAt).getTime() > 72 * 3_600_000) flush();
        chain.push(g);
      }
      flush();
    }

    // 3. Moves with no filing in the preceding 36 hours to explain them.
    if (h.price != null && h.dayPct != null && h.priceAsOf) {
      const unusual = (h.volX != null && h.volX >= DEFAULT_VOL_X) || Math.abs(h.dayPct) >= DEFAULT_MOVE_PCT;
      const explained = sorted.some((a) => !a.classification.routine && reactsTo(a.announcedAt, h.priceAsOf!));
      if (unusual && !explained) {
        const bits = [h.volX != null && h.volX >= DEFAULT_VOL_X ? `volume ${h.volX.toFixed(1)}× the 20-day average` : null, Math.abs(h.dayPct) >= DEFAULT_MOVE_PCT ? `price ${pct(h.dayPct)}` : null].filter(Boolean);
        feed.push({
          id: `${u.symbol}-move-${h.priceAsOf}`,
          sym: u.symbol,
          cat: "unclassified",
          label: "Market move",
          title: `Unusual move: ${bits.join(", ")}`,
          hoursAgo: h.closeHoursAgo ?? 0,
          tier: "act",
          why: `Unusual move: beyond your default thresholds (${DEFAULT_VOL_X}× volume, ±${DEFAULT_MOVE_PCT}%), and no non-routine filing in the 36 hours before the close`,
          soWhat: "No announcement explains it in the data we hold.",
          kind: "move",
          sourceLabel: `Yahoo Finance · ${h.priceAsOf} close`,
          sample: false,
          move: { volX: h.volX, dayPct: h.dayPct, series: h.series.slice(-20), asOfLabel: h.priceAsOf },
        });
      }
    }
  }

  // Sample content with no real equivalent yet, kept clearly labelled.
  feed.push(...SAMPLE_ITEMS);

  feed.sort((a, b) => a.hoursAgo - b.hoursAgo);
  return { asOf: input.asOf, asOfLabel: fmtIst(input.asOf), holdings, feed };
}

export function loadBrief(): BriefData {
  const universe = loadUniverse();
  const manifest = loadManifest();
  const pick = <T,>(fn: (s: string) => T | null) => Object.fromEntries(universe.map((u) => [u.symbol, fn(u.symbol)]));
  return buildBrief({
    universe,
    asOf: manifest?.ingestedAt || new Date().toISOString(),
    prices: pick(loadPrices),
    announcements: pick(loadAnnouncements),
    fundamentals: pick(loadFundamentals),
    facts: pick(loadFilingFacts),
  });
}
