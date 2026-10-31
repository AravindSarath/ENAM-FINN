/** The assembled research dossier for one company. Everything in it is traceable: facts to a page, metrics to screener rows. */
import { evaluateFacts, type GuidanceItem } from "./guidance";
import type { Metric } from "./metrics";
import type { Synthesis } from "./synthesize";
import type { DocRef, DroppedFact, Fact, Usage } from "./types";

export interface SourceDoc extends DocRef {
  pages: number;
  bytes: number;
  fetchedAt: string;
}

export interface UsageTotals {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  /** HTTP statuses of rate-limit or overload errors that were retried. Empty means none occurred. */
  retriedStatuses: number[];
  byLabel: { label: string; model: string; promptTokens: number; outputTokens: number; thoughtTokens: number; latencyMs: number }[];
}

export interface Dossier {
  schema: 1;
  symbol: string;
  name: string;
  generatedAt: string;
  sources: {
    docs: SourceDoc[];
    unavailable: { what: string; reason: string }[];
    annualReportSelection: { topic: string; pages: number[]; rule: string }[];
  };
  facts: Fact[];
  dropped: { docId: string; section: string; reason: DroppedFact["reason"]; quote: string; page: number | null }[];
  metrics: Metric[];
  guidance: GuidanceItem[];
  synthesis: Omit<Synthesis, "items"> | null;
  coverage: {
    factsByDoc: Record<string, number>;
    factsByKind: Record<string, number>;
    managementSpeakers: { name: string; designation: string | null; statements: number }[];
    proposed: number;
    verified: number;
    dropped: number;
    droppedByReason: Record<string, number>;
    guidanceVerdicts: Record<string, number>;
    metrics: number;
  };
  usage: UsageTotals;
  limitations: string[];
}

export interface ExtractionFile {
  facts: Fact[];
  dropped: DroppedFact[];
  proposed: number;
  usage: Usage | null;
  section?: string;
  topic?: string;
}

export function assembleDossier(input: {
  symbol: string;
  name: string;
  sources: Dossier["sources"];
  extractions: { docId: string; section: string; file: ExtractionFile }[];
  metrics: Metric[];
  synthesis: Dossier["synthesis"];
  usage: UsageTotals;
  generatedAt: string;
}): Dossier {
  const facts = [...new Map(input.extractions.flatMap((e) => e.file.facts).map((f) => [f.id, f])).values()];
  const docEnd = new Map(input.sources.docs.map((d) => [d.id, d.periodEnd]));
  const guidance = evaluateFacts(facts, input.metrics, (id) => docEnd.get(id) ?? null);

  const inc = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);
  const factsByDoc: Record<string, number> = {};
  const factsByKind: Record<string, number> = {};
  const speakers = new Map<string, { name: string; designation: string | null; statements: number }>();
  for (const f of facts) {
    inc(factsByDoc, f.docId);
    inc(factsByKind, f.kind);
    if (f.speaker) {
      const s = speakers.get(f.speaker.name) ?? { name: f.speaker.name, designation: f.speaker.designation, statements: 0 };
      s.statements++;
      speakers.set(f.speaker.name, s);
    }
  }
  const droppedAll = input.extractions.flatMap((e) => e.file.dropped.map((d) => ({ docId: e.docId, section: e.section, reason: d.reason, quote: d.quote, page: d.page })));
  const droppedByReason: Record<string, number> = {};
  droppedAll.forEach((d) => inc(droppedByReason, d.reason));
  const guidanceVerdicts: Record<string, number> = {};
  guidance.forEach((g) => inc(guidanceVerdicts, g.verdict));

  return {
    schema: 1,
    symbol: input.symbol,
    name: input.name,
    generatedAt: input.generatedAt,
    sources: input.sources,
    facts,
    dropped: droppedAll,
    metrics: input.metrics,
    guidance,
    synthesis: input.synthesis,
    coverage: {
      factsByDoc,
      factsByKind,
      managementSpeakers: [...speakers.values()].sort((a, b) => b.statements - a.statements),
      proposed: input.extractions.reduce((s, e) => s + e.file.proposed, 0),
      verified: facts.length,
      dropped: droppedAll.length,
      droppedByReason,
      guidanceVerdicts,
      metrics: input.metrics.length,
    },
    usage: input.usage,
    limitations: [
      "Only the latest annual report's selected pages (business and MD&A, borrowings, contingent liabilities, auditors' reports) were read, not the whole report. Related-party transactions were not extracted.",
      "Only calls with a transcript link were read. A call without a link on screener.in is listed as unavailable.",
      "Guidance is compared with reported numbers only where metric, definition, period and growth basis all match. Segment-level and EBITDA statements have no matching source series and are shown as not compared.",
      "Model-written points (business, bull, bear) are a selection and framing of the cited sources, not additional evidence.",
      "The extraction model reads a capped set of statements per call, so the lists are representative, not exhaustive.",
    ],
  };
}
