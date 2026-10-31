/**
 * Pilot: ONE real extraction on ONE document (RELIANCE, Jul 2026 concall transcript).
 *   npm run research:pilot
 * Writes data/research/pilot/RELIANCE-concall-2026-07.json (verified facts, drops, usage). The raw model output goes
 * to gitignored data/raw/ for audit. The API key is never printed or written.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractTranscript } from "../lib/research/extract";
import { loadPdfPages } from "../lib/research/pdfText";
import type { DocRef } from "../lib/research/types";
import type { ScreenerSnapshot } from "../lib/data/types";

async function main() {
  const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/fundamentals/RELIANCE.json"), "utf8")) as ScreenerSnapshot;
  const concall = snap.documents.find((d) => d.group === "Concalls" && d.label === "Jul 2026");
  const link = concall?.links.find((l) => l.text.toLowerCase() === "transcript");
  if (!link) throw new Error("No Jul 2026 transcript link in the RELIANCE snapshot");

  const doc: DocRef = { id: "RELIANCE:concall:2026-07", kind: "transcript", title: "RIL Q1 FY27 Media & Analyst Call Transcript, 17 Jul 2026", label: "Jul 2026", url: link.url, periodLabel: "Q1 FY27", periodEnd: "2026-06-30" };
  console.log("Fetching", doc.url.replace(/Pname=.*/, "Pname=…"));
  const pdf = await loadPdfPages(doc.url);
  console.log(`Loaded ${pdf.pages.length} pages, ${(pdf.bytes / 1024).toFixed(0)} KB`);

  const res = await extractTranscript(doc, pdf.pages, "pilot:RELIANCE:concall-2026-07");
  const { rawText, ...out } = res;

  mkdirSync(path.join(process.cwd(), "data/research/pilot"), { recursive: true });
  mkdirSync(path.join(process.cwd(), "data/raw/research"), { recursive: true });
  writeFileSync(path.join(process.cwd(), "data/research/pilot/RELIANCE-concall-2026-07.json"), JSON.stringify({ ...out, extractedAt: new Date().toISOString(), pdfFetchedAt: pdf.fetchedAt }, null, 1) + "\n");
  writeFileSync(path.join(process.cwd(), "data/raw/research/pilot-RELIANCE-model-output.json"), rawText);

  const byReason: Record<string, number> = {};
  out.dropped.forEach((d) => (byReason[d.reason] = (byReason[d.reason] ?? 0) + 1));
  console.log("\nmodel:", out.usage?.model);
  console.log("proposed:", out.proposed, "| verified facts:", out.facts.length, "| dropped:", out.dropped.length, byReason);
  console.log("usage:", JSON.stringify(out.usage));
  console.log("by kind:", out.facts.reduce<Record<string, number>>((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {}));
  console.log("page-corrected:", out.facts.filter((f) => f.verification.pageCorrected).length);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
