/**
 * Re-runs verification over the SAVED raw model output. No API call. Use after changing a guardrail.
 *   npm run research:reverify
 * Rewrites data/research/RELIANCE/extractions/*.json with the same usage records and freshly verified facts.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ArTopic } from "../lib/research/arPages";
import { verifyStatements } from "../lib/research/extract";
import { verifyArStatements } from "../lib/research/extractAr";
import { loadPdfPages } from "../lib/research/pdfText";
import { parseTranscript } from "../lib/research/transcript";
import type { DocRef } from "../lib/research/types";

const SYM = "RELIANCE";
const OUT = path.join(process.cwd(), "data", "research", SYM);
const RAW = path.join(process.cwd(), "data", "raw", "research");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  const sources = JSON.parse(readFileSync(path.join(OUT, "sources.json"), "utf8")) as { docs: (DocRef & { pages: number })[]; annualReportSelection: { topic: ArTopic; pages: number[] }[] };
  const model = "gemini-3.5-flash-lite";
  let before = 0;
  let after = 0;

  for (const d of sources.docs.filter((x) => x.kind === "transcript")) {
    const pdf = await loadPdfPages(d.url);
    const parsed = parseTranscript(pdf.pages);
    for (const section of ["presentation", "qa"]) {
      const file = path.join(OUT, "extractions", `${slug(d.label)}-${section}.json`);
      const raw = path.join(RAW, `${SYM}-${slug(d.label)}-${section}.json`);
      if (!existsSync(file) || !existsSync(raw)) continue;
      const prev = JSON.parse(readFileSync(file, "utf8"));
      const proposed = (JSON.parse(readFileSync(raw, "utf8")).statements ?? []) as unknown[];
      const { facts, dropped } = verifyStatements(d, parsed, proposed, model);
      before += prev.facts.length;
      after += facts.length;
      writeFileSync(file, JSON.stringify({ ...prev, facts, dropped, proposed: proposed.length, reverifiedAt: new Date().toISOString() }, null, 1) + "\n");
      console.log(`${d.label} ${section}: verified ${prev.facts.length} -> ${facts.length}, dropped ${prev.dropped.length} -> ${dropped.length}`);
    }
  }

  const ar = sources.docs.find((x) => x.kind === "annual_report");
  if (ar) {
    const pdf = await loadPdfPages(ar.url);
    for (const sel of sources.annualReportSelection) {
      const file = path.join(OUT, "extractions", `annual-report-${sel.topic}.json`);
      const raw = path.join(RAW, `${SYM}-ar-${sel.topic}.json`);
      if (!existsSync(file) || !existsSync(raw)) continue;
      const prev = JSON.parse(readFileSync(file, "utf8"));
      const proposed = (JSON.parse(readFileSync(raw, "utf8")).statements ?? []) as unknown[];
      const { facts, dropped } = verifyArStatements(ar, sel.topic, pdf.pages, sel.pages, proposed, model);
      before += prev.facts.length;
      after += facts.length;
      writeFileSync(file, JSON.stringify({ ...prev, facts, dropped, proposed: proposed.length, reverifiedAt: new Date().toISOString() }, null, 1) + "\n");
      console.log(`AR ${sel.topic}: verified ${prev.facts.length} -> ${facts.length}, dropped ${prev.dropped.length} -> ${dropped.length}`);
    }
  }
  console.log(`\nTotal verified facts: ${before} -> ${after}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
