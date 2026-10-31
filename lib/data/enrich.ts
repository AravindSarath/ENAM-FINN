/** Pure helpers for enriching announcements: subject extraction and deciding which filings need their PDF read. */
import type { Announcement } from "./types";

/** Subjects that name no event. They must never be used to group or distinguish filings. */
const GENERIC_SUBJECT = /^(general updates?|updates?|disclosure under regulation 30.*|investor presentation|press release|outcome of board meeting.*)$/i;

export const isGenericSubject = (s: string | null) => !s || GENERIC_SUBJECT.test(s.trim());

/**
 * NSE often embeds the structured subject in its text:
 *   "Avenue Supermarts Limited has informed the Exchange regarding 'Store Opening'."
 *   "Dixon ... has informed the Exchange ESG Rating by Crisil ESG Ratings & Analytics Ltd."
 * Returns the subject, or null when the text names none (empty, or only boilerplate).
 */
export function extractSubject(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const quoted = t.match(/regarding ['‘’"“](.+?)['’‘"”]\.?(?:\s|$)/i);
  if (quoted) return quoted[1].trim();
  const about = t.match(/has (?:informed|filed with) (?:the )?exchange (?:about|regarding|that)? ?(.+?)\.?$/i);
  if (about) {
    const s = about[1].trim();
    // Boilerplate that merely repeats the label ("about Credit Rating") still names the event; long free text does not.
    if (s.length > 0 && s.length <= 90 && !/^the (board|company)/i.test(s)) return s;
  }
  return null;
}

/** Text carrying no event content, so the attachment is the only place the content lives. */
export const isUninformative = (text: string) => text.trim().length < 25 || /has informed the exchange (about|regarding) [A-Za-z/ ()'.-]{0,40}\.?$/i.test(text.trim());

export type PdfPriority = 1 | 2 | 3 | 0;

/**
 * Which filings are worth reading the PDF for, most urgent first. 0 means "do not fetch".
 *   1  unclassified and not routine
 *   2  flagged for review, or classified only with low confidence
 *   3  uninformative text and a category that is not high-confidence (e.g. "Investor Presentation")
 * Routine filings are never fetched: the PDF cannot make them non-routine, so the download would be wasted.
 */
export function pdfPriority(a: Announcement): PdfPriority {
  const c = a.classification;
  if (!a.attachmentUrl || !/\.pdf(\?|$)/i.test(a.attachmentUrl)) return 0;
  if (c.routine) return 0;
  if (a.attachmentExcerpt?.status === "ok") return 0;
  if (c.category === "unclassified") return 1;
  if (c.needsReview || c.confidence === "low") return 2;
  if (isUninformative(a.text) && c.confidence !== "high") return 3;
  return 0;
}
