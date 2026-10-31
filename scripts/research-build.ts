/**
 * Builds the RELIANCE dossier from saved extractions: metrics (code), guidance checks (code), then the model-written
 * synthesis LAST. The synthesis call is the only API call here and is skipped if data/research/RELIANCE/synthesis.json
 * exists (use --refresh to redo it).
 *   npm run research:build [-- --refresh]
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ScreenerSnapshot } from "../lib/data/types";
import { assembleDossier, type ExtractionFile, type UsageTotals } from "../lib/research/dossier";
import { buildMetrics } from "../lib/research/metrics";
import { synthesize, type Synthesis } from "../lib/research/synthesize";
import type { DocRef } from "../lib/research/types";

const SYM = "RELIANCE";
const OUT = path.join(process.cwd(), "data", "research", SYM);
const refresh = process.argv.includes("--refresh");
const SMART = process.env.GEMINI_SMART_MODEL || "gemini-3.5-flash";

function usageTotals(): UsageTotals {
  const lines = readFileSync(path.join(process.cwd(), "data/research/usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  // Pilot, extraction and synthesis calls for this company. Calibration probes were not logged.
  const mine = lines.filter((l) => typeof l.label === "string" && l.label.includes(SYM));
  return {
    calls: mine.length,
    promptTokens: mine.reduce((s, l) => s + l.promptTokens, 0),
    outputTokens: mine.reduce((s, l) => s + l.outputTokens, 0),
    thoughtTokens: mine.reduce((s, l) => s + l.thoughtTokens, 0),
    retriedStatuses: mine.flatMap((l) => l.retriedStatuses ?? []),
    byLabel: mine.map((l) => ({ label: l.label, model: l.model, promptTokens: l.promptTokens, outputTokens: l.outputTokens, thoughtTokens: l.thoughtTokens, latencyMs: l.latencyMs })),
  };
}

async function main() {
  const sources = JSON.parse(readFileSync(path.join(OUT, "sources.json"), "utf8")) as { docs: (DocRef & { pages: number; bytes: number; fetchedAt: string })[]; unavailable: { what: string; reason: string }[]; annualReportSelection: { topic: string; pages: number[]; rule: string }[] };
  const snap = JSON.parse(readFileSync(path.join(process.cwd(), "data/fundamentals/RELIANCE.json"), "utf8")) as ScreenerSnapshot;

  const extractions = readdirSync(path.join(OUT, "extractions"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const file = JSON.parse(readFileSync(path.join(OUT, "extractions", f), "utf8")) as ExtractionFile & { doc?: DocRef };
      const docId = file.facts[0]?.docId ?? file.doc?.id ?? "";
      return { docId, section: file.section ?? file.topic ?? f, file };
    });

  const metrics = buildMetrics(snap);
  const facts = [...new Map(extractions.flatMap((e) => e.file.facts).map((f) => [f.id, f])).values()];
  const info = new Map(sources.docs.map((d) => [d.id, { title: d.title, period: d.periodLabel }]));

  const synthFile = path.join(OUT, "synthesis.json");
  let synthesis: Omit<Synthesis, "items"> | null = null;
  if (existsSync(synthFile) && !refresh) {
    synthesis = JSON.parse(readFileSync(synthFile, "utf8"));
    console.log("synthesis: using saved", synthFile);
  } else {
    console.log(`synthesis: calling ${SMART} (thinkingLevel low) ...`);
    const { items, ...s } = await synthesize(facts, metrics, (id) => info.get(id) ?? { title: id, period: null }, SMART, `synth:${SYM}`);
    synthesis = s;
    writeFileSync(synthFile, JSON.stringify(s, null, 1) + "\n");
    console.log(`  offered ${items.length} items | kept business ${s.business.length}, bull ${s.bull.length}, bear ${s.bear.length} | dropped ${s.dropped.length} | ${JSON.stringify(s.usage)}`);
    s.dropped.forEach((d) => console.log("  dropped:", d.section, d.reason));
  }

  const dossier = assembleDossier({
    symbol: SYM,
    name: "Reliance Industries",
    sources: { docs: sources.docs, unavailable: sources.unavailable, annualReportSelection: sources.annualReportSelection },
    extractions,
    metrics,
    synthesis,
    usage: usageTotals(),
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(path.join(OUT, "dossier.json"), JSON.stringify(dossier, null, 1) + "\n");
  console.log("\ndossier written:", `${dossier.facts.length} facts, ${dossier.metrics.length} metrics, ${dossier.guidance.length} guidance/claim items`);
  console.log("guidance verdicts:", dossier.coverage.guidanceVerdicts);
  console.log("usage:", JSON.stringify({ calls: dossier.usage.calls, prompt: dossier.usage.promptTokens, output: dossier.usage.outputTokens, thoughts: dossier.usage.thoughtTokens, retried: dossier.usage.retriedStatuses }));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
