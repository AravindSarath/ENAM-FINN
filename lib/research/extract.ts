/**
 * Transcript extraction: model proposes, code disposes.
 * Every statement must (1) match the output schema, (2) quote the transcript verbatim, (3) sit entirely inside one
 * management turn. The speaker comes from the transcript's own headers, not from the model. Anything else is
 * dropped and counted with a reason.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { MODELS, generateJson } from "./llm";
import { TRANSCRIPT_PROMPT_VERSION, TRANSCRIPT_SYSTEM, transcriptPrompt } from "./prompts";
import { contextAround, locateQuote, parseTranscript, renderForModel, type ParsedTranscript, type Section } from "./transcript";
import { validateQuantified } from "./claims";
import { GUIDANCE_METRICS, type DocRef, type DroppedFact, type Fact, type Usage } from "./types";
import { MAX_QUOTE_CHARS, hasEllipsis, normalizeForMatch } from "./verify";

/** Omitted optional fields read as null. Required fields (kind, scope, quote, page) stay strict. */
const optNull = <T extends z.ZodTypeAny>(t: T) => t.nullable().optional().transform((v) => v ?? null);
const QuantifiedSchema = z.object({
  metric: z.enum(GUIDANCE_METRICS),
  direction: optNull(z.enum(["increase", "decrease", "maintain"])),
  value: optNull(z.number()),
  valueHigh: optNull(z.number()),
  unit: optNull(z.enum(["percent", "inr_crore", "x", "bps", "other"])),
  comparator: optNull(z.enum(["approx", "at_least", "at_most", "range"])),
  period: optNull(z.string()),
  horizon: optNull(z.string()),
});

const StatementSchema = z.object({
  kind: z.enum(["guidance", "forward_looking", "target", "commentary"]),
  scope: z.string().min(1).max(60),
  statement: z.string().min(3).max(300),
  quote: z.string().min(8),
  page: z.number().int().min(1),
  quantified: QuantifiedSchema.nullable().optional().transform((v) => v ?? null),
});

/** Gemini responseSchema equivalent of StatementSchema[]. */
const nullable = (t: Record<string, unknown>) => ({ ...t, nullable: true });
export const TRANSCRIPT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    statements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["guidance", "forward_looking", "target", "commentary"] },
          scope: { type: "STRING" },
          statement: { type: "STRING" },
          quote: { type: "STRING" },
          page: { type: "INTEGER" },
          quantified: nullable({
            type: "OBJECT",
            properties: {
              metric: { type: "STRING", enum: [...GUIDANCE_METRICS] },
              direction: nullable({ type: "STRING", enum: ["increase", "decrease", "maintain"] }),
              value: nullable({ type: "NUMBER" }),
              valueHigh: nullable({ type: "NUMBER" }),
              unit: nullable({ type: "STRING", enum: ["percent", "inr_crore", "x", "bps", "other"] }),
              comparator: nullable({ type: "STRING", enum: ["approx", "at_least", "at_most", "range"] }),
              period: nullable({ type: "STRING" }),
              horizon: nullable({ type: "STRING" }),
            },
            required: ["metric"],
          }),
        },
        required: ["kind", "scope", "statement", "quote", "page"],
      },
    },
  },
  required: ["statements"],
} as const;

const NUM = /\d[\d,]*(?:\.\d+)?/g;
export const numbersIn = (s: string) => (s.match(NUM) ?? []).map((x) => Number(x.replace(/,/g, "").replace(/\.$/, ""))).filter((n) => Number.isFinite(n));

/** A restatement may not introduce numbers or acronyms (names, metrics) that the quote itself does not contain. */
/** Period labels and currency codes are not facts about the quote: "Q1 FY27", "INR". */
export const PERIOD_TOKENS = /\b(?:Q[1-4]|FY\s?\d{2,4}|H[12])\b/gi;
const ALLOWED_TERMS = new Set(["INR", "USD", "FY", "IST"]);

export function statementAddsTerms(statement: string, quote: string): string | null {
  const st = statement.replace(PERIOD_TOKENS, " ");
  const inQuote = new Set(numbersIn(quote));
  for (const n of numbersIn(st)) if (!inQuote.has(n)) return `number ${n}`;
  for (const a of st.match(/\b[A-Z][A-Z0-9&]{1,}\b/g) ?? []) if (!ALLOWED_TERMS.has(a) && !new RegExp(String.raw`\b${a}\b`).test(quote)) return `term ${a}`;
  return null;
}

const hash8 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);

export interface ExtractionResult {
  doc: DocRef;
  facts: Fact[];
  dropped: DroppedFact[];
  proposed: number;
  usage: Usage | null;
  promptVersion: string;
}

/**
 * Pure verification of proposed statements against a parsed transcript. Exported so it can be tested without a model.
 */
export function verifyStatements(
  doc: DocRef,
  parsed: ParsedTranscript,
  proposed: unknown[],
  model: string,
): { facts: Fact[]; dropped: DroppedFact[] } {
  const facts: Fact[] = [];
  const dropped: DroppedFact[] = [];
  const seen = new Set<string>();

  for (const raw of proposed) {
    const p = StatementSchema.safeParse(raw);
    if (!p.success) {
      const r = raw as { quote?: unknown; page?: unknown };
      dropped.push({ reason: "schema_invalid", quote: typeof r?.quote === "string" ? r.quote.slice(0, 120) : "", page: typeof r?.page === "number" ? r.page : null, detail: p.error.issues[0]?.message });
      continue;
    }
    const s = p.data;
    const drop = (reason: DroppedFact["reason"], detail?: string) => dropped.push({ reason, quote: s.quote.slice(0, 160), page: s.page, detail });

    if (s.quote.length > MAX_QUOTE_CHARS) { drop("quote_too_long"); continue; }
    if (hasEllipsis(s.quote)) { drop("quote_has_ellipsis"); continue; }

    const loc = locateQuote(parsed, s.quote, s.page);
    if (!loc) { drop("quote_not_found"); continue; }
    if (loc.spansTurns) { drop("quote_spans_turns"); continue; }
    const sp = loc.turn.speaker;
    if (sp.role === "analyst") { drop("in_analyst_turn", sp.name); continue; }
    if (sp.role === "moderator") { drop("in_moderator_turn"); continue; }
    if (sp.role !== "management") { drop("speaker_unknown"); continue; }

    const key = normalizeForMatch(s.quote);
    if (seen.has(key)) { drop("duplicate"); continue; }
    seen.add(key);

    const adjustments: string[] = [];
    const quoteText = parsed.plain.slice(loc.offset, loc.offset + key.length);
    let statement: string | null = s.statement;
    const added = statementAddsTerms(s.statement, quoteText);
    if (added) {
      statement = null;
      adjustments.push(`statement_dropped: adds ${added}`);
    }
    const ctx = contextAround(parsed, loc.offset, s.quote.length);
    const vq = validateQuantified(s.quantified, quoteText, s.scope, ctx, doc.periodLabel);
    adjustments.push(...vq.adjustments);
    const quantified = vq.quantified;

    facts.push({
      id: `${doc.id}:p${loc.page}:${hash8(key)}`,
      docId: doc.id,
      docKind: doc.kind,
      kind: s.kind,
      scope: s.scope,
      statement,
      quote: quoteText,
      page: loc.page,
      speaker: sp,
      context: ctx,
      quantified,
      verification: { quoteVerbatim: true, pageCorrected: loc.pageCorrected, speakerSource: "code", adjustments },
      extractedBy: { model, promptVersion: TRANSCRIPT_PROMPT_VERSION },
    });
  }
  return { facts, dropped };
}

export async function extractTranscript(doc: DocRef, pages: string[], label: string, section?: Section): Promise<ExtractionResult & { rawText: string }> {
  const parsed = parseTranscript(pages);
  const gen = await generateJson({
    model: MODELS.fast,
    label,
    system: TRANSCRIPT_SYSTEM,
    prompt: transcriptPrompt(renderForModel(parsed, section)),
    schema: TRANSCRIPT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 16384,
  });
  const proposed = (gen.json as { statements?: unknown[] })?.statements ?? [];
  const { facts, dropped } = verifyStatements(doc, parsed, proposed, MODELS.fast);
  return { doc, facts, dropped, proposed: proposed.length, usage: gen.usage, promptVersion: TRANSCRIPT_PROMPT_VERSION, rawText: gen.rawText };
}
