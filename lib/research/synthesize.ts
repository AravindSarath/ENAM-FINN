/**
 * Business summary and bull/bear cases, written LAST, from verified facts and calculated metrics only.
 * The model sees short aliases (F1, F2, M:...) and must cite them. Code then drops any point that
 *   - cites nothing, or cites an id it was not given;
 *   - contains a number that none of its cited items contain.
 * Surviving text is labelled "written by the model from cited sources" everywhere it is shown.
 */
import { numbersIn, PERIOD_TOKENS } from "./extract";
import { generateJson } from "./llm";
import type { Metric } from "./metrics";
import type { Fact } from "./types";

export const SYNTHESIS_PROMPT_VERSION = "synthesis-v2";

export interface Point {
  text: string;
  /** Ids of the facts (F:...) and metrics (M:...) the point rests on. */
  cites: string[];
}

export interface Synthesis {
  model: string;
  promptVersion: string;
  business: Point[];
  bull: Point[];
  bear: Point[];
  dropped: { section: "business" | "bull" | "bear"; text: string; reason: string }[];
  usage: { promptTokens: number; outputTokens: number; thoughtTokens: number; latencyMs: number; attempts: number; retriedStatuses: number[] } | null;
}

const SYSTEM = `You write a short research summary of a company for an investor, using ONLY the cited items you are given.

Each item is either a fact (id F1, F2, ...: a verbatim quote from a transcript or annual report, with its source) or a calculated metric (id M:name: figures computed from reported tables).

Rules:
1. Use nothing from memory, the news, broker views or general knowledge. If the items do not support a point, do not write it.
2. Every point has "text" (at most 35 words) and "cites" (one to four item ids you relied on, copied exactly from the list).
3. A point may restate or combine what its cited items say. It must NOT contain any number that is not in one of its cited items, and must not add causes, forecasts or comparisons that the items do not make.
4. "business": 3 or 4 points describing what the company does and how it is organised.
5. "bull": up to 4 points that make the strongest case FOR the stock using the items. "bear": up to 4 points that make the strongest case AGAINST it, including risks, weak numbers and open questions the items raise. Each case must rest on different items where possible.
6. Management statements are management's own words, not facts about results: say "management said" or "the annual report states" when you rely on one. Calculated metrics may be stated plainly.
7. Do not give a price target, a rating or advice.
8. Periods: each item shows its period (for example "period Q4 FY26" or "period FY26"). Name a period only as the item gives it. Never describe a quarterly figure as annual or the reverse, and never combine figures from items with different periods in one comparison unless you name both periods.
9. No causal links ("because", "due to", "driven by", "supported by", "as a result", "thanks to") unless a cited item itself states that cause. Otherwise place the facts side by side without connecting them.`;

const pointSchema = { type: "OBJECT", properties: { text: { type: "STRING" }, cites: { type: "ARRAY", items: { type: "STRING" } } }, required: ["text", "cites"] };
const SCHEMA = {
  type: "OBJECT",
  properties: { business: { type: "ARRAY", items: pointSchema }, bull: { type: "ARRAY", items: pointSchema }, bear: { type: "ARRAY", items: pointSchema } },
  required: ["business", "bull", "bear"],
};

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Facts and metrics offered to the model, capped so the call stays small. */
export function selectForSynthesis(facts: Fact[], metrics: Metric[]) {
  const t = facts.filter((f) => f.docKind === "transcript");
  const ar = facts.filter((f) => f.docKind === "annual_report");
  const forward = t.filter((f) => ["guidance", "target", "forward_looking"].includes(f.kind));
  const quantifiedClaims = t.filter((f) => f.kind === "commentary" && f.quantified).slice(0, 12);
  const otherClaims = t.filter((f) => f.kind === "commentary" && !f.quantified).slice(0, 6);
  const take = (kind: string, n: number) => ar.filter((f) => f.kind === kind).slice(0, n);
  const chosen = [...forward.slice(0, 24), ...quantifiedClaims, ...otherClaims, ...take("business", 5), ...take("segment", 6), ...take("outlook", 5), ...take("risk", 5), ...take("debt", 6), ...take("contingent_liability", 4), ...take("auditor_remark", 5)];
  const unique = [...new Map(chosen.map((f) => [f.id, f])).values()];
  const ms = metrics.filter((m) => m.frequency === "annual" && m.values.some((v) => v.value != null));
  return { facts: unique, metrics: ms };
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-IN") : String(Math.round(v * 10) / 10));

function metricNumbers(m: Metric): Set<number> {
  const out = new Set<number>();
  for (const v of m.values) {
    if (v.value == null) continue;
    for (const d of [0, 1, 2]) {
      const r = Number(v.value.toFixed(d));
      out.add(r);
      out.add(Math.abs(r));
    }
  }
  return out;
}

export interface PromptItem {
  alias: string;
  line: string;
  numbers: Set<number>;
  realId: string;
  /** Period labels the item carries ("Q4 FY26", "FY26"). Period labels in a point's text must come from these. */
  periods: Set<string>;
  /** Lower-case text the item's words can be checked against: quote plus surrounding text, or metric label, formula and note. */
  haystack: string;
  /** Lower-case quote only (facts) or null (metrics, which are series and may be described as rising or falling). */
  quoteOnly: string | null;
}

/** Finance terms a point may use only if a cited item uses the same term (or a synonym). */
const TERMS: { word: RegExp; source: RegExp }[] = [
  { word: /\bebitda\b/i, source: /ebitda/ },
  { word: /\b(revenues?|topline|turnover|sales)\b/i, source: /(revenue|topline|top line|turnover|sales)/ },
  { word: /\b(net profit|profit|pat)\b/i, source: /(profit|\bpat\b)/ },
  { word: /\bmargins?\b/i, source: /margin/ },
  { word: /\b(year-on-year|yoy|y-o-y)\b/i, source: /(year[- ]on[- ]year|yoy|y-o-y|year over year)/ },
  { word: /\b(borrowings?|debt)\b/i, source: /(borrowing|debt)/ },
  { word: /\bcash flow\b/i, source: /(cash flow|cash from|free cash|fcf)/ },
  { word: /\binterest cover\b/i, source: /interest/ },
];
const UP_WORD = /\b(increased|rose|grew|expanded|improved|accelerat\w*|climbed|rising)\b/i;
const UP_CUE = /(\bup\b|increas|higher|growth|grew|grow|rose|rise|improv|expand|upside|gain|double)/i;
const DOWN_WORD = /\b(declined|fell|dropped|decreased|moderated|contracted|falling)\b/i;
const DOWN_CUE = /(\bdown\b|decreas|lower|declin|fell|fall|drop|reduc|contract|compress|moderat)/i;

export function buildItems(facts: Fact[], metrics: Metric[], docInfo: (id: string) => { title: string; period: string | null }): PromptItem[] {
  const items: PromptItem[] = facts.map((f, i) => {
    const info = docInfo(f.docId);
    return {
      alias: `F${i + 1}`,
      realId: f.id,
      numbers: new Set(numbersIn(f.quote)),
      periods: new Set(info.period ? [info.period] : []),
      haystack: `${f.quote} ${f.context}`.toLowerCase(),
      quoteOnly: f.quote.toLowerCase(),
      line: `F${i + 1} [${f.docKind === "transcript" ? `management said, ${f.speaker?.name}${f.speaker?.designation ? `, ${f.speaker.designation}` : ""}` : "annual report states"}; ${info.title}, p${f.page}; period ${info.period ?? "unknown"}; ${f.kind}; scope ${f.scope}] "${clip(f.quote, 260)}"`,
    };
  });
  for (const m of metrics) {
    items.push({
      alias: m.id,
      realId: m.id,
      numbers: metricNumbers(m),
      periods: new Set(m.values.map((v) => v.period)),
      haystack: `${m.label} ${m.formula} ${m.note ?? ""}`.toLowerCase(),
      quoteOnly: null,
      line: `${m.id} [calculated, ${m.label}${m.note ? `; ${m.note}` : ""}] ${m.values.filter((v) => v.value != null).map((v) => `${v.period}: ${fmt(v.value as number)}${m.unit === "percent" ? "%" : m.unit === "x" ? "x" : m.unit === "days" ? " days" : " cr"}`).join(", ")}`,
    });
  }
  return items;
}

/** Pure validation of the model's points against the items it was given. */
export function validatePoints(section: "business" | "bull" | "bear", points: unknown, items: PromptItem[]): { kept: Point[]; dropped: Synthesis["dropped"] } {
  const byAlias = new Map(items.map((i) => [i.alias, i]));
  const kept: Point[] = [];
  const dropped: Synthesis["dropped"] = [];
  for (const p of Array.isArray(points) ? points : []) {
    const text = typeof p?.text === "string" ? p.text.trim() : "";
    const cites: string[] = Array.isArray(p?.cites) ? p.cites.filter((c: unknown): c is string => typeof c === "string") : [];
    const drop = (reason: string) => dropped.push({ section, text: text.slice(0, 200), reason });
    if (!text) { drop("empty text"); continue; }
    if (cites.length === 0) { drop("cites nothing"); continue; }
    const unknown = cites.find((c) => !byAlias.has(c));
    if (unknown) { drop(`cites an id it was not given: ${unknown}`); continue; }
    const allowed = new Set<number>();
    cites.forEach((c) => byAlias.get(c)!.numbers.forEach((n) => allowed.add(n)));
    const stray = numbersIn(text.replace(PERIOD_TOKENS, " ")).find((n) => !allowed.has(n));
    if (stray !== undefined) { drop(`contains the number ${stray}, which is not in its cited items`); continue; }
    const periodsAllowed = new Set<string>();
    cites.forEach((c) => byAlias.get(c)!.periods.forEach((x) => periodsAllowed.add(x)));
    const strayPeriod = ((text.match(/\bQ[1-4] FY\d{2}\b|\bFY\d{2}\b/g) as string[] | null) ?? []).find((x) => !periodsAllowed.has(x) && ![...periodsAllowed].some((a) => a.endsWith(x)));
    if (strayPeriod) { drop(`names the period ${strayPeriod}, which its cited items do not carry`); continue; }
    if (/\b(because|due to|driven by|supported by|as a result|thanks to|owing to)\b/i.test(text)) { drop("uses a causal link; sources are placed side by side instead"); continue; }
    const hay = cites.map((c) => byAlias.get(c)!.haystack).join(" ");
    const missingTerm = TERMS.find((t) => t.word.test(text) && !t.source.test(hay));
    if (missingTerm) { drop(`uses a term its cited items do not contain (${text.match(missingTerm.word)?.[0]})`); continue; }
    const cited = cites.map((c) => byAlias.get(c)!);
    const hasSeries = cited.some((i) => i.quoteOnly === null);
    const quotes = cited.map((i) => i.quoteOnly ?? "").join(" ");
    if (UP_WORD.test(text) && !hasSeries && !UP_CUE.test(quotes)) { drop("states a rise that no cited quote states"); continue; }
    if (DOWN_WORD.test(text) && !hasSeries && !DOWN_CUE.test(quotes)) { drop("states a fall that no cited quote states"); continue; }
    if (text.split(/\s+/).length > 45) { drop("longer than 45 words"); continue; }
    kept.push({ text, cites: cites.map((c) => byAlias.get(c)!.realId) });
  }
  return { kept, dropped };
}

export async function synthesize(facts: Fact[], metrics: Metric[], docInfo: (id: string) => { title: string; period: string | null }, model: string, label: string): Promise<Synthesis & { items: PromptItem[] }> {
  const sel = selectForSynthesis(facts, metrics);
  const items = buildItems(sel.facts, sel.metrics, docInfo);
  const gen = await generateJson({
    model,
    label,
    system: SYSTEM,
    prompt: `Items you may cite:\n${items.map((i) => i.line).join("\n")}\n\nWrite the business, bull and bear points now.`,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxOutputTokens: 4096,
    thinkingLevel: "low",
  });
  const j = gen.json as { business?: unknown; bull?: unknown; bear?: unknown };
  const b = validatePoints("business", j.business, items);
  const u = validatePoints("bull", j.bull, items);
  const r = validatePoints("bear", j.bear, items);
  return {
    model,
    promptVersion: SYNTHESIS_PROMPT_VERSION,
    business: b.kept,
    bull: u.kept,
    bear: r.kept,
    dropped: [...b.dropped, ...u.dropped, ...r.dropped],
    usage: { promptTokens: gen.usage.promptTokens, outputTokens: gen.usage.outputTokens, thoughtTokens: gen.usage.thoughtTokens, latencyMs: gen.usage.latencyMs, attempts: gen.usage.attempts, retriedStatuses: gen.usage.retriedStatuses },
    items,
  };
}
