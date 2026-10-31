/**
 * Event grouping. Two filings are merged only on strong evidence of being the same event:
 *   same_attachment  the very same document
 *   same_subject     the same specific subject NSE names (never a generic one such as "General Updates"), within 72h
 *   same_text        near-identical informative text with the same NSE label, within 72h
 *   same_period      follow-ups to a results outcome that state the same reporting period (in their own text or
 *                    PDF excerpt), from an hour before to seven days after it
 * Sharing a symbol, a category and a time window is never enough. Every merged filing keeps its own reason,
 * and the originals are all preserved in the cluster.
 */
import { isGenericSubject, isUninformative } from "./enrich";
import { periodEndFromText } from "./period";
import type { Announcement } from "./types";

export type GroupKind = "same_attachment" | "same_subject" | "same_text" | "same_period";

export interface GroupReason {
  kind: GroupKind;
  detail: string;
}

export interface Cluster {
  primary: Announcement;
  /** Every other filing in the event, newest first, each with why it was merged. */
  members: { a: Announcement; reason: GroupReason }[];
}

const HOUR = 3_600_000;
const WINDOW_MS = 72 * HOUR;

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2));

export function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** The reporting period a filing states, from its text or, failing that, its PDF excerpt. */
export function statedPeriod(a: Announcement): string | null {
  return periodEndFromText(a.text) ?? (a.attachmentExcerpt?.status === "ok" ? periodEndFromText(a.attachmentExcerpt.text) : null);
}

const at = (a: Announcement) => new Date(a.announcedAt).getTime();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface GroupOptions {
  /**
   * Normalised subjects that many filings share ("Schedule of meet", "Credit Rating"). They name a type of filing,
   * not an event, so they never justify a merge. Build it with `commonSubjects`.
   */
  common?: Set<string>;
}

/** Subjects that recur this many times across the data are filing types, not events. */
export const COMMON_SUBJECT_COUNT = 3;

export function commonSubjects(all: Announcement[]): Set<string> {
  const counts = new Map<string, number>();
  for (const a of all) if (a.subject) counts.set(norm(a.subject), (counts.get(norm(a.subject)) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n >= COMMON_SUBJECT_COUNT).map(([k]) => k));
}

/** A subject that names the event itself: not generic, not NSE's own label, not a recurring filing type. */
export const specificSubject = (a: Announcement, common?: Set<string>): string | null =>
  a.subject && !isGenericSubject(a.subject) && norm(a.subject) !== norm(a.nseDesc) && !common?.has(norm(a.subject)) ? a.subject : null;

export function linkReason(a: Announcement, b: Announcement, opts: GroupOptions = {}): GroupReason | null {
  if (a.attachmentUrl && a.attachmentUrl === b.attachmentUrl) return { kind: "same_attachment", detail: "Same attached document" };

  const gap = Math.abs(at(a) - at(b));

  const sa = specificSubject(a, opts.common);
  const sb = specificSubject(b, opts.common);
  if (gap <= WINDOW_MS && sa && sb && norm(sa) === norm(sb)) {
    return { kind: "same_subject", detail: `Same subject: ${sa}` };
  }

  if (
    gap <= WINDOW_MS &&
    a.nseDesc === b.nseDesc &&
    !isUninformative(a.text) &&
    !isUninformative(b.text) &&
    tokens(a.text).size >= 8 &&
    jaccard(a.text, b.text) >= 0.85
  ) {
    return { kind: "same_text", detail: "Near-identical filing text" };
  }

  // Results follow-ups: outcome ↔ press release / deck / call material for the same stated period.
  const [o, x] = a.nseDesc === "Outcome of Board Meeting" && a.classification.category === "results" ? [a, b] : b.nseDesc === "Outcome of Board Meeting" && b.classification.category === "results" ? [b, a] : [null, null];
  if (o && x && x.nseDesc !== "Outcome of Board Meeting") {
    const po = statedPeriod(o);
    const px = statedPeriod(x);
    const delta = (at(x) - at(o)) / HOUR;
    const related = x.classification.categories.some((c) => c === "results" || c === "earnings_call");
    if (po && px && po === px && related && delta >= -1 && delta <= 24 * 7) {
      return { kind: "same_period", detail: `Same reporting period (${po})` };
    }
  }
  return null;
}

/**
 * Clusters filings with union-find over `linkReason` edges. The primary of each cluster is the filing with the
 * highest `rank` (ties go to the newest). Singletons are returned as clusters with no members.
 */
export function groupAnnouncements(items: Announcement[], rank: (a: Announcement) => number, opts: GroupOptions = {}): Cluster[] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges: { i: number; j: number; reason: GroupReason }[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const reason = linkReason(items[i], items[j], opts);
      if (reason) {
        edges.push({ i, j, reason });
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  items.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));

  const clusters: Cluster[] = [];
  for (const idxs of groups.values()) {
    const sorted = [...idxs].sort((x, y) => rank(items[y]) - rank(items[x]) || at(items[y]) - at(items[x]));
    const primary = sorted[0];
    const members = sorted
      .slice(1)
      .map((m) => {
        // Prefer an edge straight to the primary; otherwise any edge touching this member.
        const e = edges.find((e) => (e.i === m && e.j === primary) || (e.j === m && e.i === primary)) ?? edges.find((e) => e.i === m || e.j === m)!;
        return { a: items[m], reason: e.reason };
      })
      .sort((x, y) => at(y.a) - at(x.a));
    clusters.push({ primary: items[primary], members });
  }
  return clusters.sort((x, y) => at(y.primary) - at(x.primary));
}
