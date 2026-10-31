/**
 * RELIANCE research extraction. Restricted to RELIANCE on purpose.
 *   npm run research:extract [-- --refresh]
 * Steps (each skipped when its output file already exists, unless --refresh):
 *   transcripts: for each available call, presentation and Q&A are extracted in separate calls.
 *   annual report: only the pages chosen by lib/research/arPages.ts are sent, one call per topic.
 * Outputs under data/research/RELIANCE/ (verified facts, drops, token usage). Raw model output goes to gitignored data/raw/.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ScreenerSnapshot } from "../lib/data/types";
import { selectArPages } from "../lib/research/arPages";
import { docId, latestAnnualReport, periodFromTranscriptText, transcriptCalls } from "../lib/research/docs";
import { extractTranscript } from "../lib/research/extract";
import { extractArTopic } from "../lib/research/extractAr";
import { loadPdfPages } from "../lib/research/pdfText";
import type { DocRef } from "../lib/research/types";

const SYM = "RELIANCE";
const OUT = path.join(process.cwd(), "data", "research", SYM);
const RAW = path.join(process.cwd(), "data", "raw", "research");
const refresh = process.argv.includes("--refresh");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null; // e.g. --only auditor (annual-report topic) or --only transcripts
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  mkdirSync(path.join(OUT, "extractions"), { recursive: true });
  mkdirSync(RAW, { recursive: true });
  const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/fundamentals/RELIANCE.json"), "utf8")) as ScreenerSnapshot;
  const docs: (DocRef & { pages: number; bytes: number; fetchedAt: string })[] = [];
  const unavailable: { what: string; reason: string }[] = [];
  const totals = { calls: 0, promptTokens: 0, outputTokens: 0, thoughtTokens: 0, retriedStatuses: [] as number[] };
  const tally = (u: { promptTokens: number; outputTokens: number; thoughtTokens: number; retriedStatuses: number[] } | null) => {
    if (!u) return;
    totals.calls++;
    totals.promptTokens += u.promptTokens;
    totals.outputTokens += u.outputTokens;
    totals.thoughtTokens += u.thoughtTokens;
    totals.retriedStatuses.push(...u.retriedStatuses);
  };

  // --- transcripts ---
  const { available, unavailable: noLink } = transcriptCalls(snap, 4);
  noLink.forEach((l) => unavailable.push({ what: `Earnings call transcript, ${l}`, reason: "screener.in lists the call but has no transcript link yet" }));

  for (const c of only && only !== "transcripts" ? [] : available) {
    const pdf = await loadPdfPages(c.url);
    const period = periodFromTranscriptText(pdf.pages.slice(0, 3).join("\n"));
    if (!period) {
      unavailable.push({ what: `Earnings call transcript, ${c.label}`, reason: "the reporting period could not be read from the transcript's cover letter" });
      continue;
    }
    const doc: DocRef = { id: docId(SYM, "transcript", slug(c.label)), kind: "transcript", title: `Earnings call transcript, ${c.label} (${period.label})`, label: c.label, url: c.url, periodLabel: period.label, periodEnd: period.end };
    docs.push({ ...doc, pages: pdf.pages.length, bytes: pdf.bytes, fetchedAt: pdf.fetchedAt });

    for (const section of ["presentation", "qa"] as const) {
      const file = path.join(OUT, "extractions", `${slug(c.label)}-${section}.json`);
      if (existsSync(file) && !refresh) {
        console.log(`skip (exists): ${c.label} ${section}`);
        continue;
      }
      console.log(`extracting: ${c.label} ${section} ...`);
      const r = await extractTranscript(doc, pdf.pages, `extract:${SYM}:${slug(c.label)}-${section}`, section);
      const { rawText, ...res } = r;
      writeFileSync(file, JSON.stringify({ ...res, section, extractedAt: new Date().toISOString() }, null, 1) + "\n");
      writeFileSync(path.join(RAW, `${SYM}-${slug(c.label)}-${section}.json`), rawText);
      tally(res.usage);
      console.log(`  proposed ${res.proposed} | verified ${res.facts.length} | dropped ${res.dropped.length} | ${JSON.stringify(res.usage)}`);
      await sleep(2500);
    }
  }

  // --- annual report ---
  const ar = latestAnnualReport(snap);
  let arSelection: ReturnType<typeof selectArPages> = [];
  if (!ar) unavailable.push({ what: "Annual report", reason: "no annual report link on screener.in" });
  else {
    const pdf = await loadPdfPages(ar.url);
    const fy = `FY${String(ar.year).slice(2)}`;
    const doc: DocRef = { id: docId(SYM, "annual_report", fy), kind: "annual_report", title: `Integrated Annual Report ${ar.year - 1}-${String(ar.year).slice(2)}`, label: `Annual Report ${ar.year}`, url: ar.url, periodLabel: fy, periodEnd: `${ar.year}-03-31` };
    docs.push({ ...doc, pages: pdf.pages.length, bytes: pdf.bytes, fetchedAt: pdf.fetchedAt });
    arSelection = selectArPages(pdf.pages);
    console.log("annual-report selection:", arSelection.map((s) => `${s.topic}: ${s.pages.join(",")}`).join(" | "));
    for (const sel of arSelection.filter((x) => !only || only === x.topic)) {
      const file = path.join(OUT, "extractions", `annual-report-${sel.topic}.json`);
      if (existsSync(file) && !refresh) {
        console.log(`skip (exists): AR ${sel.topic}`);
        continue;
      }
      console.log(`extracting: AR ${sel.topic} (${sel.pages.length} pages) ...`);
      const r = await extractArTopic(doc, sel.topic, pdf.pages, sel.pages, `extract:${SYM}:ar-${sel.topic}`);
      const { rawText, ...res } = r;
      writeFileSync(file, JSON.stringify({ ...res, rule: sel.rule, extractedAt: new Date().toISOString() }, null, 1) + "\n");
      writeFileSync(path.join(RAW, `${SYM}-ar-${sel.topic}.json`), rawText);
      tally(res.usage);
      console.log(`  proposed ${res.proposed} | verified ${res.facts.length} | dropped ${res.dropped.length} | ${JSON.stringify(res.usage)}`);
      await sleep(2500);
    }
  }

  if (!only) writeFileSync(path.join(OUT, "sources.json"), JSON.stringify({ docs, unavailable, annualReportSelection: arSelection, tokensThisRun: totals, writtenAt: new Date().toISOString() }, null, 1) + "\n");
  console.log("\nThis run:", JSON.stringify(totals));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
