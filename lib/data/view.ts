/**
 * Turns committed snapshots into the props the Brief, Portfolio and Alerts screens render.
 * `buildBrief` is pure (testable); `loadBrief` reads data/ and calls it.
 *
 * Pipeline per company: announcements → event clusters (strong evidence only) → card (results / filing) →
 * materiality score with itemised reasons → tier. Unusual-move cards are built from prices separately.
 */
import { CATEGORY_LABEL, pct } from "../format";
import { SAMPLE_ITEMS } from "../mock";
import type { EvidenceRef, FeedItem, Holding } from "../types";
import { priceMetrics } from "./derive";
import { isGenericSubject } from "./enrich";
import { commonSubjects, groupAnnouncements, statedPeriod, type Cluster } from "./group";
import { loadAnnouncements, loadFilingFacts, loadFundamentals, loadManifest, loadPrices, loadUniverse } from "./load";
import { CATEGORY_BASE, scoreItem, summariseReasons } from "./materiality";
import { moveFacts, moveStats } from "./moves";
import { fiscalQuarter, buildResultsCard, maxProfitChange } from "./results";
import { reactsTo, sessionCloseMs } from "./score";
import type { Announcement, AnnouncementSnapshot, FilingFacts, PriceSnapshot, ScreenerSnapshot, UniverseEntry } from "./types";

export { periodEndFromText } from "./period";

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

export function titleFor(a: Announcement): string {
  return informative(a.text) ? truncate(a.text, 110) : a.subject && !isGenericSubject(a.subject) ? truncate(a.subject, 110) : a.nseDesc || CATEGORY_LABEL[a.classification.category];
}

/** Which filing leads an event cluster: a results board outcome first, then the highest-base category. */
const rankOf = (a: Announcement) =>
  (a.nseDesc === "Outcome of Board Meeting" && a.classification.category === "results" ? 1000 : 0) +
  CATEGORY_BASE[a.classification.category] +
  (a.classification.needsReview ? 0 : 5) +
  (a.attachmentUrl ? 1 : 0);

function classificationEvidence(a: Announcement): EvidenceRef[] {
  const c = a.classification;
  const out: EvidenceRef[] = [{ kind: "nse_label", text: `NSE label: ${a.nseDesc}`, url: a.attachmentUrl ?? undefined }];
  if (a.subject && !isGenericSubject(a.subject)) out.push({ kind: "filing_text", text: `Subject named by NSE: ${a.subject}` });
  if (c.evidence) {
    out.push({
      kind: c.evidence.source === "pdf" ? "pdf_excerpt" : c.evidence.source === "label" ? "nse_label" : "filing_text",
      text: `Matched “${c.evidence.phrase}” (rule ${c.rule}, ${c.confidence} confidence)`,
      url: a.attachmentUrl ?? undefined,
    });
  }
  if (c.evidence?.source === "pdf" && a.attachmentExcerpt?.status === "ok") {
    out.push({ kind: "pdf_excerpt", text: `Page 1 reads: ${truncate(a.attachmentExcerpt.text, 220)}`, url: a.attachmentExcerpt.url });
  }
  return out;
}

export function buildBrief(input: BriefInput): BriefData {
  const asOfMs = new Date(input.asOf).getTime();
  const portfolio = input.universe.filter((u) => u.group === "portfolio");
  const holdings = portfolio.map((u) => holdingFrom(u, input.prices[u.symbol] ?? null, asOfMs));
  const feed: FeedItem[] = [];
  const common = commonSubjects(Object.values(input.announcements).flatMap((s) => s?.items ?? []));
  const hoursAgo = (iso: string) => Math.max(0, (asOfMs - new Date(iso).getTime()) / 3_600_000);

  for (const u of portfolio) {
    const ann = input.announcements[u.symbol];
    if (!ann || ann.source.status === "unavailable") continue;
    const h = holdings.find((x) => x.sym === u.symbol)!;
    const fund = input.fundamentals[u.symbol] ?? null;
    const facts = input.facts[u.symbol] ?? null;
    const sorted = [...ann.items].sort((a, b) => a.announcedAt.localeCompare(b.announcedAt));

    const reactionFor = (a: Announcement) =>
      h.priceAsOf && reactsTo(a.announcedAt, h.priceAsOf) ? { volX: h.volX, dayPct: h.dayPct, session: h.priceAsOf } : null;

    const clusters: Cluster[] = groupAnnouncements(sorted, rankOf, { common });

    for (const cl of clusters) {
      const p = cl.primary;
      const c = p.classification;
      const related = cl.members.map((m) => ({
        title: titleFor(m.a),
        url: m.a.attachmentUrl,
        hoursAgo: hoursAgo(m.a.announcedAt),
        reason: m.reason.detail,
      }));
      const evidence = classificationEvidence(p);
      const sourceLabel = `NSE · ${fmtIst(p.announcedAt)} · ${p.nseDesc}`;

      // Results card: a board outcome with a stated reporting period.
      const stated = p.nseDesc === "Outcome of Board Meeting" && c.category === "results" ? [p, ...cl.members.map((m) => m.a)].map(statedPeriod).find((d) => d != null) ?? null : null;
      if (stated) {
        const latestEnd = fund?.source.asOf ?? null;
        let card = null as ReturnType<typeof buildResultsCard>;
        let pending: string | undefined;
        if (!fund || fund.source.status === "unavailable") pending = "Fundamentals snapshot unavailable, so the headline numbers cannot be shown.";
        else if (stated !== latestEnd) pending = `screener.in's latest quarter is ${latestEnd ?? "unknown"}, not the ${stated} period of this filing. Numbers are withheld rather than guessed.`;
        else card = buildResultsCard(fund, facts);

        const q = fiscalQuarter(stated);
        const change = card ? maxProfitChange(card) : null;
        const scored = scoreItem({
          category: "results",
          classification: c,
          nseDesc: p.nseDesc,
          text: p.text,
          subject: p.subject,
          url: p.attachmentUrl ?? undefined,
          kind: "results",
          results: { withheld: !card, maxChangePct: change?.pct ?? null, changeEvidence: change?.text },
          reaction: reactionFor(p),
        });

        let soWhat = pending ?? "";
        if (card) {
          const get = (label: string) => card!.rows.find((r) => r.label.startsWith(label));
          const bits: string[] = [];
          const op = get("Operating profit");
          const pat = get("PAT") ?? get("Net profit");
          const opQ = op?.cur != null && op.prevQ ? ((op.cur - op.prevQ) / Math.abs(op.prevQ)) * 100 : null;
          const patQ = pat?.cur != null && pat.prevQ ? ((pat.cur - pat.prevQ) / Math.abs(pat.prevQ)) * 100 : null;
          if (opQ != null) bits.push(`Operating profit ${pct(opQ)} QoQ`);
          if (patQ != null) bits.push(`PAT ${pct(patQ)} QoQ`);
          soWhat = bits.join(", ");
          evidence.push({ kind: "screener", text: `${card.periodLabel}, ${card.basis ?? "basis unknown"} quarterly table`, url: card.sourceUrls.find((x) => x.includes("screener.in")) });
        }
        if (stated && p.attachmentExcerpt?.status === "ok" && !p.text.match(/ended/i)) evidence.push({ kind: "pdf_excerpt", text: `Reporting period read from page 1: ${stated}`, url: p.attachmentExcerpt.url });

        feed.push({
          id: `${u.symbol}-results-${p.id}`,
          sym: u.symbol,
          cat: "results",
          title: `${q} results filed`,
          hoursAgo: hoursAgo(p.announcedAt),
          at: p.announcedAt,
          tier: scored.tier,
          score: scored.score,
          reasons: scored.reasons,
          why: summariseReasons(scored.reasons),
          evidence,
          soWhat,
          kind: "results",
          url: p.attachmentUrl ?? undefined,
          sourceLabel: `NSE · ${fmtIst(p.announcedAt)}`,
          sample: false,
          related,
          results: card ?? { periodLabel: `${q} · ${stated}`, basis: fund?.basis ?? null, rows: [], extras: [], margin: null, trend: [], notes: [], sourceUrls: [], pending },
        });
        continue;
      }

      const isNotice = c.category === "results" && p.nseDesc !== "Outcome of Board Meeting" && /scheduled|intimation|to consider/i.test(p.text) && !/approved/i.test(p.text);
      const scored = scoreItem({
        category: c.category,
        classification: c,
        nseDesc: p.nseDesc,
        text: p.text,
        subject: p.subject,
        url: p.attachmentUrl ?? undefined,
        kind: "filing",
        isResultsNotice: isNotice,
        reaction: reactionFor(p),
      });
      const title = isNotice ? "Board meeting on results scheduled" : titleFor(p);
      feed.push({
        id: `${u.symbol}-${p.id}`,
        sym: u.symbol,
        cat: c.category,
        title,
        hoursAgo: hoursAgo(p.announcedAt),
        at: p.announcedAt,
        tier: scored.tier,
        score: scored.score,
        reasons: scored.reasons,
        why: summariseReasons(scored.reasons),
        evidence,
        soWhat: isNotice ? truncate(p.text, 240) : informative(p.text) && title !== truncate(p.text, 110) ? truncate(p.text, 240) : "",
        kind: "generic",
        url: p.attachmentUrl ?? undefined,
        sourceLabel,
        sample: false,
        related: related.length ? related : undefined,
      });
    }

    // Unusual moves with no non-routine filing in the 36 hours before the close.
    if (h.price != null && h.dayPct != null && h.priceAsOf) {
      const unusual = (h.volX != null && h.volX >= DEFAULT_VOL_X) || Math.abs(h.dayPct) >= DEFAULT_MOVE_PCT;
      const explained = sorted.some((a) => !a.classification.routine && reactsTo(a.announcedAt, h.priceAsOf!));
      const bars = input.prices[u.symbol]?.bars ?? [];
      if (unusual && !explained) {
        const stats = moveStats(bars, { volX: DEFAULT_VOL_X, movePct: DEFAULT_MOVE_PCT });
        const bits = [h.volX != null && h.volX >= DEFAULT_VOL_X ? `volume ${h.volX.toFixed(1)}× the 20-day average` : null, Math.abs(h.dayPct) >= DEFAULT_MOVE_PCT ? `price ${pct(h.dayPct)}` : null].filter(Boolean);
        const scored = scoreItem({
          category: "unclassified",
          classification: { category: "unclassified", categories: [], rule: "move", confidence: "high", evidence: null, routine: false, needsReview: false },
          nseDesc: "",
          text: "",
          subject: null,
          kind: "move",
          move: { sigmaMultiple: stats?.sigmaMultiple ?? null, consecutive: stats?.consecutive ?? 0, volX: h.volX, dayPct: h.dayPct, session: h.priceAsOf },
        });
        const facts = stats ? moveFacts(stats) : [];
        feed.push({
          id: `${u.symbol}-move-${h.priceAsOf}`,
          sym: u.symbol,
          cat: "unclassified",
          label: "Market move",
          title: `Unusual move: ${bits.join(", ")}`,
          hoursAgo: h.closeHoursAgo ?? 0,
          tier: scored.tier,
          score: scored.score,
          reasons: scored.reasons,
          why: summariseReasons(scored.reasons),
          evidence: [
            { kind: "yahoo", text: `${h.priceAsOf} close, volume and 60-session history`, url: input.prices[u.symbol]?.source.url },
            { kind: "rule", text: `Default thresholds: ${DEFAULT_VOL_X}× volume or ±${DEFAULT_MOVE_PCT}% (yours are on the Alerts tab)` },
          ],
          soWhat: ["No announcement explains it in the data we hold.", ...facts].join(" "),
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
