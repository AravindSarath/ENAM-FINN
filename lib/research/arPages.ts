/**
 * Chooses which annual-report pages to send to the model. Only these pages are ever read; the rest of the report
 * (which can be 400k tokens) is not. Selection is keyword-driven so it works for any annual report, and the chosen
 * pages and the rule behind each choice are recorded with the dossier.
 */
export type ArTopic = "business_mdna" | "debt" | "contingent" | "auditor";

export interface ArSelection {
  topic: ArTopic;
  pages: number[];
  rule: string;
}

const count = (p: string, re: RegExp) => (p.match(re) ?? []).length;

const MDNA = /management discussion and analysis/gi;
const BORROW = /borrowings/gi;
const CONTINGENT = /contingent liabilit/gi;
const AUDIT = /independent auditor|key audit matter|emphasis of matter|basis for opinion/gi;

const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

export function selectArPages(pages: string[]): ArSelection[] {
  const n = pages.length;
  const latterHalf = (i: number) => i + 1 >= Math.floor(n * 0.5);
  const out: ArSelection[] = [];

  // MD&A: the first run of 3+ consecutive pages carrying the heading, plus a little lead-in for the business overview.
  let runStart = -1;
  let runEnd = -1;
  for (let i = 0; i < n - 2; i++) {
    if (count(pages[i], MDNA) > 0 && count(pages[i + 1], MDNA) > 0 && count(pages[i + 2], MDNA) > 0) {
      runStart = i;
      runEnd = i + 2;
      while (runEnd + 1 < n && count(pages[runEnd + 1], MDNA) > 0) runEnd++;
      break;
    }
  }
  if (runStart >= 0) out.push({ topic: "business_mdna", pages: uniq(Array.from({ length: runEnd - runStart + 5 }, (_, k) => runStart - 3 + k + 1).filter((x) => x >= 1 && x <= n)), rule: `first run of pages headed "Management Discussion and Analysis" (${runStart + 1}-${runEnd + 1}), with 3 lead-in pages and 1 after` });

  // Debt: the pages in the financial statements that mention borrowings most.
  const debt = pages.map((p, i) => ({ page: i + 1, c: count(p, BORROW), ok: latterHalf(i) })).filter((x) => x.ok && x.c >= 5).sort((a, b) => b.c - a.c).slice(0, 5).map((x) => x.page);
  if (debt.length) out.push({ topic: "debt", pages: uniq(debt), rule: "5 pages in the second half with the most mentions of \"borrowings\" (at least 5)" });

  // Contingent liabilities: every page that names them in the financial statements, plus the page after each.
  const cont = pages.map((p, i) => ({ page: i + 1, c: count(p, CONTINGENT), ok: latterHalf(i) || i + 1 > 0 })).filter((x) => x.c > 0).map((x) => x.page);
  if (cont.length) out.push({ topic: "contingent", pages: uniq(cont.flatMap((p) => [p, p + 1]).filter((p) => p <= n)).slice(0, 10), rule: "pages naming contingent liabilities, plus the page after each (max 10)" });

  // Auditor's reports: the pages dense with audit-report headings.
  const aud = pages.map((p, i) => ({ page: i + 1, c: count(p, AUDIT) })).filter((x) => x.c >= 3).sort((a, b) => b.c - a.c).slice(0, 7).map((x) => x.page);
  if (aud.length) out.push({ topic: "auditor", pages: uniq(aud), rule: "7 pages with the most auditor-report headings (at least 3)" });
  return out;
}
