/** Chooses which source documents to research, from the screener.in document list already in the snapshot. */
import { periodEndFromText } from "../data/period";
import { fiscalQuarter } from "../data/results";
import type { ScreenerSnapshot } from "../data/types";
import type { DocRef } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The quarter-end a call's period most likely ends on, from the call month. A fallback only: the transcript's own title wins. */
export function periodEndFromCallMonth(label: string): string | null {
  const m = label.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  const y = Number(m[2]);
  if (mi < 1) return null;
  if (mi <= 2) return `${y - 1}-12-31`;
  if (mi <= 6) return `${y}-03-31`;
  if (mi <= 9) return `${y}-06-30`;
  return `${y}-09-30`;
}

/**
 * The reporting period a call covers, read from the cover letter ("for the quarter and year ended March 31, 2026").
 * Null when the front matter states none; the call month is then not trusted to infer it.
 */
export function periodFromTranscriptText(text: string): { label: string; end: string } | null {
  const end = periodEndFromText(text);
  return end ? { label: fiscalQuarter(end), end } : null;
}

export interface CallDoc {
  label: string;
  url: string;
}

/** Concalls that have a transcript link, newest first. Calls with no link are listed separately as unavailable. */
export function transcriptCalls(snap: ScreenerSnapshot, limit = 4): { available: CallDoc[]; unavailable: string[] } {
  const calls = snap.documents.filter((d) => d.group === "Concalls").slice(0, limit);
  const available: CallDoc[] = [];
  const unavailable: string[] = [];
  for (const c of calls) {
    const link = c.links.find((l) => l.text.toLowerCase() === "transcript");
    if (link) available.push({ label: c.label, url: link.url });
    else unavailable.push(c.label);
  }
  return { available, unavailable };
}

/** The most recent annual report link ("Annual Report 2026"). */
export function latestAnnualReport(snap: ScreenerSnapshot): { year: number; url: string } | null {
  let best: { year: number; url: string } | null = null;
  for (const d of snap.documents.filter((x) => x.group === "Annual reports")) {
    for (const l of d.links) {
      const y = l.text.match(/Annual Report\s+(\d{4})/i)?.[1];
      if (y && (!best || Number(y) > best.year)) best = { year: Number(y), url: l.url };
    }
  }
  return best;
}

export const docId = (sym: string, kind: DocRef["kind"], tag: string) => `${sym}:${kind}:${tag}`;
