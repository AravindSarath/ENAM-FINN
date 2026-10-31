/**
 * Template-based digest. Counts and names only: it states what arrived, never what it means.
 */
import { CATEGORY_LABEL } from "../format";
import type { FeedItem } from "../types";

export interface Digest {
  headline: string;
  counts: { act: number; note: number; routine: number };
  /** Raw filings behind the cards (grouped filings count individually). */
  rawFilings: number;
  cards: number;
  /** Routine cards that are collapsed rather than shown. */
  routineCollapsed: number;
  /** Sample cards in the window. They are excluded from every figure above, since they are not real. */
  sampleExcluded: number;
  /** Highest-scoring cards with their top reason. */
  top: { id: string; sym: string; title: string; score: number; reason: string }[];
}

const PLURAL: Partial<Record<string, [string, string]>> = {
  results: ["results filing", "results filings"],
  management_change: ["management change", "management changes"],
  litigation: ["legal or regulatory item", "legal or regulatory items"],
  "M&A": ["M&A or restructuring item", "M&A or restructuring items"],
  pledging: ["pledging item", "pledging items"],
  bonus_split: ["bonus or split", "bonuses or splits"],
  move: ["unusual move", "unusual moves"],
};

const names = (syms: string[]) => {
  const u = [...new Set(syms)];
  return u.length <= 3 ? u.join(", ") : `${u.slice(0, 3).join(", ")} +${u.length - 3}`;
};

export function buildDigest(all: FeedItem[]): Digest {
  // Illustrative sample cards are never counted, named or ranked here.
  const items = all.filter((i) => !i.sample);
  const real = items;
  const act = items.filter((i) => i.tier === "act");
  const counts = { act: act.length, note: items.filter((i) => i.tier === "note").length, routine: items.filter((i) => i.tier === "routine").length };

  // Group Act cards by what they are, so the headline reads "2 results filings (RELIANCE, DIXON), 1 unusual move (SUZLON)".
  const groups = new Map<string, FeedItem[]>();
  for (const i of act) {
    const key = i.kind === "move" ? "move" : i.cat;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  const parts = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, xs]) => {
      const [one, many] = PLURAL[k] ?? [CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]?.toLowerCase() ?? k, `${CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]?.toLowerCase() ?? k} items`];
      return `${xs.length} ${xs.length === 1 ? one : many} (${names(xs.map((x) => x.sym))})`;
    });

  const rawFilings = real.filter((i) => i.kind !== "move").reduce((s, i) => s + 1 + (i.related?.length ?? 0), 0);
  const top = [...act]
    .sort((a, b) => b.score - a.score || a.hoursAgo - b.hoursAgo)
    .slice(0, 3)
    .map((i) => ({
      id: i.id,
      sym: i.sym,
      title: i.title,
      score: i.score,
      reason: [...i.reasons].sort((x, y) => Math.abs(y.points) - Math.abs(x.points))[0]?.label.replace(/^Category: /, "") ?? "",
    }));

  return {
    headline: parts.length ? `${parts.join(", ")}.` : "Nothing needs you in this window.",
    counts,
    rawFilings,
    cards: items.length,
    routineCollapsed: counts.routine,
    sampleExcluded: all.length - items.length,
    top,
  };
}
