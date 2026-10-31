/** A searchable index over selected PDF pages, so a quote can be located and its page proven. */
import { normalizeForMatch, normalizeText } from "./verify";

export interface PageIndex {
  plain: string;
  norm: string;
  marks: { start: number; page: number }[];
}

function joinLines(lines: string[]): { text: string; starts: number[] } {
  let out = "";
  const starts: number[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!out) {
      starts.push(0);
      out = t;
    } else if (out.endsWith("-")) {
      starts.push(out.length);
      out += t;
    } else {
      out += " ";
      starts.push(out.length);
      out += t;
    }
  }
  return { text: out, starts };
}

/** Index of the given 1-based pages only. Page furniture lines are left in; quotes simply never match them. */
export function buildPageIndex(pages: string[], pageNumbers: number[]): PageIndex {
  const lines: { text: string; page: number }[] = [];
  for (const n of pageNumbers) {
    for (const raw of (pages[n - 1] ?? "").split("\n")) {
      const t = normalizeText(raw);
      if (t) lines.push({ text: t, page: n });
    }
  }
  const { text, starts } = joinLines(lines.map((l) => l.text));
  return { plain: text, norm: text.toLowerCase(), marks: lines.map((l, i) => ({ start: starts[i], page: l.page })) };
}

function pageAt(ix: PageIndex, offset: number): number {
  let lo = 0;
  let hi = ix.marks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ix.marks[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  return ix.marks[lo].page;
}

export function locateInPages(ix: PageIndex, quote: string, citedPage: number | null): { page: number; offset: number; pageCorrected: boolean } | null {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return null;
  const hits: { o: number; page: number }[] = [];
  for (let i = ix.norm.indexOf(q); i >= 0; i = ix.norm.indexOf(q, i + 1)) hits.push({ o: i, page: pageAt(ix, i) });
  if (!hits.length) return null;
  const onCited = hits.find((h) => h.page === citedPage);
  const pick = onCited ?? hits[0];
  // A quote that straddles a page boundary is cited at the page where it starts; that is still its true page.
  return { page: pick.page, offset: pick.o, pageCorrected: !onCited };
}

export function contextInPages(ix: PageIndex, offset: number, length: number, radius = 300): string {
  const a = Math.max(0, offset - radius);
  const b = Math.min(ix.plain.length, offset + length + radius);
  return `${a > 0 ? "…" : ""}${ix.plain.slice(a, b)}${b < ix.plain.length ? "…" : ""}`;
}

export function renderPagesForModel(pages: string[], pageNumbers: number[]): string {
  return pageNumbers.map((n) => `[[page ${n}]]\n${joinLines((pages[n - 1] ?? "").split("\n").map(normalizeText).filter(Boolean)).text}`).join("\n");
}
