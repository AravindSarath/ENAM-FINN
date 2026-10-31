/** Verbatim quote verification. A quote counts only if it appears, modulo whitespace and typography, in the document. */

/**
 * Normalises text for matching: typographic quotes and dashes become ASCII, line-end hyphenation is rejoined,
 * whitespace collapses, case is ignored. It never changes wording, so a match still means the same words.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/­/g, "")
    .replace(/-\s*\n\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** `normalizeText`, lower-cased: what quotes are matched against. Same length as `normalizeText` for these inputs. */
export const normalizeForMatch = (s: string) => normalizeText(s).toLowerCase();

export const MAX_QUOTE_CHARS = 400;

export function hasEllipsis(q: string): boolean {
  return /(\.\.\.|…)/.test(q);
}
