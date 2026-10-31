/**
 * Annual-report extraction over selected pages. Same contract as transcripts: the model proposes statements, code
 * keeps only those whose quote appears verbatim on a page it was given, and whose structured numbers the quote
 * supports. There is no speaker: annual-report text is the company speaking in print.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { validateQuantified } from "./claims";
import { statementAddsTerms } from "./extract";
import { MODELS, generateJson } from "./llm";
import { buildPageIndex, contextInPages, locateInPages, renderPagesForModel } from "./pagedoc";
import { AR_PROMPT_VERSION, AR_TOPICS, arPrompt } from "./prompts";
import type { ArTopic } from "./arPages";
import { GUIDANCE_METRICS, type DocRef, type DroppedFact, type Fact, type FactKind, type Usage } from "./types";
import { MAX_QUOTE_CHARS, hasEllipsis, normalizeForMatch } from "./verify";

const nullable = (t: Record<string, unknown>) => ({ ...t, nullable: true });

export const arResponseSchema = (kinds: readonly string[]) => ({
  type: "OBJECT",
  properties: {
    statements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: [...kinds] },
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
});

const Q = z.object({
  metric: z.enum(GUIDANCE_METRICS),
  direction: z.enum(["increase", "decrease", "maintain"]).nullable().optional().transform((v) => v ?? null),
  value: z.number().nullable().optional().transform((v) => v ?? null),
  valueHigh: z.number().nullable().optional().transform((v) => v ?? null),
  unit: z.enum(["percent", "inr_crore", "x", "bps", "other"]).nullable().optional().transform((v) => v ?? null),
  comparator: z.enum(["approx", "at_least", "at_most", "range"]).nullable().optional().transform((v) => v ?? null),
  period: z.string().nullable().optional().transform((v) => v ?? null),
  horizon: z.string().nullable().optional().transform((v) => v ?? null),
});

const hash8 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 8);

export interface ArExtraction {
  topic: ArTopic;
  pages: number[];
  facts: Fact[];
  dropped: DroppedFact[];
  proposed: number;
  usage: Usage | null;
  promptVersion: string;
}

export function verifyArStatements(doc: DocRef, topic: ArTopic, pages: string[], pageNumbers: number[], proposed: unknown[], model: string) {
  const kinds = new Set<string>(AR_TOPICS[topic].kinds);
  const S = z.object({
    kind: z.string().refine((k) => kinds.has(k)),
    scope: z.string().min(1).max(60),
    statement: z.string().min(3).max(300),
    quote: z.string().min(8),
    page: z.number().int().min(1),
    quantified: Q.nullable().optional().transform((v) => v ?? null),
  });
  const ix = buildPageIndex(pages, pageNumbers);
  const facts: Fact[] = [];
  const dropped: DroppedFact[] = [];
  const seen = new Set<string>();

  for (const raw of proposed) {
    const p = S.safeParse(raw);
    if (!p.success) {
      const r = raw as { quote?: unknown; page?: unknown };
      dropped.push({ reason: "schema_invalid", quote: typeof r?.quote === "string" ? r.quote.slice(0, 120) : "", page: typeof r?.page === "number" ? r.page : null, detail: p.error.issues[0]?.message });
      continue;
    }
    const s = p.data;
    const drop = (reason: DroppedFact["reason"], detail?: string) => dropped.push({ reason, quote: s.quote.slice(0, 160), page: s.page, detail });
    if (s.quote.length > MAX_QUOTE_CHARS) { drop("quote_too_long"); continue; }
    if (hasEllipsis(s.quote)) { drop("quote_has_ellipsis"); continue; }
    const loc = locateInPages(ix, s.quote, s.page);
    if (!loc) { drop("quote_not_found"); continue; }
    const key = normalizeForMatch(s.quote);
    if (seen.has(key)) { drop("duplicate"); continue; }
    seen.add(key);

    const quoteText = ix.plain.slice(loc.offset, loc.offset + key.length);
    const ctx = contextInPages(ix, loc.offset, key.length);
    const adjustments: string[] = [];
    let statement: string | null = s.statement;
    const added = statementAddsTerms(s.statement, quoteText);
    if (added) {
      statement = null;
      adjustments.push(`statement_dropped: adds ${added}`);
    }
    const vq = validateQuantified(s.quantified, quoteText, s.scope, ctx, doc.periodLabel);
    adjustments.push(...vq.adjustments);

    facts.push({
      id: `${doc.id}:p${loc.page}:${hash8(key)}`,
      docId: doc.id,
      docKind: doc.kind,
      kind: s.kind as FactKind,
      scope: s.scope,
      statement,
      quote: quoteText,
      page: loc.page,
      speaker: null,
      context: ctx,
      quantified: vq.quantified,
      verification: { quoteVerbatim: true, pageCorrected: loc.pageCorrected, speakerSource: "code", adjustments },
      extractedBy: { model, promptVersion: AR_PROMPT_VERSION },
    });
  }
  return { facts, dropped };
}

export async function extractArTopic(doc: DocRef, topic: ArTopic, pages: string[], pageNumbers: number[], label: string): Promise<ArExtraction & { rawText: string }> {
  const t = AR_TOPICS[topic];
  const gen = await generateJson({
    model: MODELS.fast,
    label,
    system: t.system,
    prompt: arPrompt(renderPagesForModel(pages, pageNumbers)),
    schema: arResponseSchema(t.kinds) as unknown as Record<string, unknown>,
    maxOutputTokens: 16384,
  });
  const proposed = (gen.json as { statements?: unknown[] })?.statements ?? [];
  const { facts, dropped } = verifyArStatements(doc, topic, pages, pageNumbers, proposed, MODELS.fast);
  return { topic, pages: pageNumbers, facts, dropped, proposed: proposed.length, usage: gen.usage, promptVersion: AR_PROMPT_VERSION, rawText: gen.rawText };
}
