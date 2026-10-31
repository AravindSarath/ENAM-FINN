import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadFundamentals } from "../lib/data/load";
import type { ScreenerSnapshot } from "../lib/data/types";
import { validateQuantified, type RawQuantified } from "../lib/research/claims";
import type { Dossier } from "../lib/research/dossier";
import { numbersIn } from "../lib/research/extract";
import { evaluateFacts } from "../lib/research/guidance";
import { buildMetrics } from "../lib/research/metrics";
import { buildItems, selectForSynthesis, validatePoints } from "../lib/research/synthesize";
import { normalizeForMatch } from "../lib/research/verify";

const root = path.join(__dirname, "..");
const d = JSON.parse(readFileSync(path.join(root, "data/research/RELIANCE/dossier.json"), "utf8")) as Dossier;
const docs = new Map(d.sources.docs.map((x) => [x.id, x]));
const factIds = new Set(d.facts.map((f) => f.id));
const metricIds = new Set(d.metrics.map((m) => m.id));

describe("RELIANCE dossier: every fact is traceable", () => {
  it("has facts from every document that was read", () => {
    expect(d.facts.length).toBeGreaterThan(100);
    for (const doc of d.sources.docs) expect(d.coverage.factsByDoc[doc.id], doc.id).toBeGreaterThan(0);
  });

  it("gives each fact a verbatim quote, a real page of a real document, and a context that contains the quote", () => {
    for (const f of d.facts) {
      const doc = docs.get(f.docId);
      expect(doc, f.id).toBeDefined();
      expect(doc!.url).toMatch(/^https:\/\//);
      expect(f.page).toBeGreaterThanOrEqual(1);
      expect(f.page).toBeLessThanOrEqual(doc!.pages);
      expect(f.quote.length).toBeGreaterThan(7);
      expect(f.quote.length).toBeLessThanOrEqual(400);
      expect(f.quote).not.toMatch(/\.\.\.|…/);
      expect(normalizeForMatch(f.context), f.id).toContain(normalizeForMatch(f.quote));
      expect(f.docKind).toBe(doc!.kind);
      expect(f.verification.quoteVerbatim).toBe(true);
      expect(f.extractedBy.model).toBe("gemini-3.5-flash-lite");
    }
  });

  it("attributes every call statement to a management speaker identified from the transcript, and never to an analyst", () => {
    const calls = d.facts.filter((f) => f.docKind === "transcript");
    expect(calls.length).toBeGreaterThan(30);
    for (const f of calls) {
      expect(f.speaker, f.id).not.toBeNull();
      expect(f.speaker!.role).toBe("management");
      expect(f.speaker!.name.length).toBeGreaterThan(2);
      expect(f.speaker!.header).toMatch(/Company Speaker|^Sh |\d{2}:\d{2}:\d{2}/);
      expect(f.verification.speakerSource).toBe("code");
    }
    expect(calls.some((f) => f.speaker!.designation)).toBe(true);
  });

  it("gives annual-report statements no speaker", () => {
    for (const f of d.facts.filter((x) => x.docKind === "annual_report")) expect(f.speaker).toBeNull();
  });

  it("keeps structured claims only if the quote supports them (re-validated from scratch)", () => {
    for (const f of d.facts.filter((x) => x.quantified)) {
      const q = f.quantified!;
      if (q.value != null) expect(numbersIn(f.quote), f.id).toContain(q.value);
      const doc = docs.get(f.docId)!;
      const again = validateQuantified(q as RawQuantified, f.quote, f.scope, f.context, doc.periodLabel);
      expect(again.quantified, `${f.id}: ${again.adjustments.join("; ")}`).not.toBeNull();
      if (q.period) expect(q.period).toBe(doc.periodLabel);
    }
  });
});

describe("RELIANCE dossier: calculated content is deterministic", () => {
  const snap = loadFundamentals("RELIANCE") as ScreenerSnapshot;

  it("metrics equal a fresh calculation from the committed screener snapshot", () => {
    expect(JSON.parse(JSON.stringify(buildMetrics(snap)))).toEqual(d.metrics);
  });

  it("guidance verdicts equal a fresh evaluation of the stored facts and metrics", () => {
    const end = new Map(d.sources.docs.map((x) => [x.id, x.periodEnd]));
    expect(JSON.parse(JSON.stringify(evaluateFacts(d.facts, d.metrics, (id) => end.get(id) ?? null)))).toEqual(d.guidance);
  });

  it("every guidance item points at a real fact; tested ones point at a real metric; untested ones say why", () => {
    for (const g of d.guidance) {
      expect(factIds.has(g.factId), g.id).toBe(true);
      expect(g.reason.length).toBeGreaterThan(10);
      if (["consistent", "diverges", "delivered", "missed", "partly"].includes(g.verdict)) {
        expect(g.actual, g.id).not.toBeNull();
        expect(metricIds.has(g.actual!.metricId)).toBe(true);
      } else {
        expect(g.actual, g.id).toBeNull();
      }
      if (g.reference) expect(g.reference.caveat).toMatch(/do not match/);
    }
  });

  it("never compares management's EBITDA or topline with a differently defined series", () => {
    for (const g of d.guidance.filter((x) => x.metric === "ebitda_growth_yoy" || x.metric === "revenue_growth_yoy")) expect(g.verdict).not.toMatch(/consistent|diverges|delivered|missed/);
  });
});

describe("RELIANCE dossier: synthesis is cited, last, and re-validates", () => {
  const syn = d.synthesis!;
  const sel = selectForSynthesis(d.facts, d.metrics);
  const docInfo = (id: string) => ({ title: docs.get(id)!.title, period: docs.get(id)!.periodLabel });
  const items = buildItems(sel.facts, sel.metrics, docInfo);
  const aliasOf = new Map(items.map((i) => [i.realId, i.alias]));

  it("uses the approved models", () => {
    expect(syn.model).toBe("gemini-3.5-flash");
  });

  it("cites only facts and metrics that exist in the dossier", () => {
    for (const p of [...syn.business, ...syn.bull, ...syn.bear]) {
      expect(p.cites.length).toBeGreaterThan(0);
      for (const c of p.cites) expect(factIds.has(c) || metricIds.has(c), c).toBe(true);
    }
  });

  it("passes today's validation unchanged: no point rests on a number, term, period, rise or fall its sources lack", () => {
    for (const section of ["business", "bull", "bear"] as const) {
      const pts = syn[section].map((p) => ({ text: p.text, cites: p.cites.map((c) => aliasOf.get(c) ?? "MISSING") }));
      const r = validatePoints(section, pts, items);
      expect(r.dropped, section).toEqual([]);
      expect(r.kept).toHaveLength(syn[section].length);
    }
  });

  it("records what it discarded", () => {
    expect(Array.isArray(syn.dropped)).toBe(true);
    for (const x of syn.dropped) expect(x.reason.length).toBeGreaterThan(5);
  });
});

describe("RELIANCE dossier: coverage, usage and gaps are stated", () => {
  it("has consistent coverage numbers", () => {
    expect(d.coverage.verified).toBe(d.facts.length);
    expect(Object.values(d.coverage.factsByDoc).reduce((a, b) => a + b, 0)).toBe(d.facts.length);
    expect(d.coverage.proposed).toBeGreaterThanOrEqual(d.coverage.verified);
    expect(d.coverage.guidanceVerdicts && Object.values(d.coverage.guidanceVerdicts).reduce((a, b) => a + b, 0)).toBe(d.guidance.length);
  });

  it("records measured token usage that adds up, and any quota or overload errors", () => {
    expect(d.usage.calls).toBe(d.usage.byLabel.length);
    expect(d.usage.promptTokens).toBe(d.usage.byLabel.reduce((s, x) => s + x.promptTokens, 0));
    expect(d.usage.outputTokens).toBe(d.usage.byLabel.reduce((s, x) => s + x.outputTokens, 0));
    expect(Array.isArray(d.usage.retriedStatuses)).toBe(true);
    expect(new Set(d.usage.byLabel.map((x) => x.model))).toEqual(new Set(["gemini-3.5-flash-lite", "gemini-3.5-flash"]));
  });

  it("lists the unavailable transcript with its reason, and the annual-report pages actually read", () => {
    expect(d.sources.unavailable.some((u) => /Oct 2026/.test(u.what) && u.reason.length > 10)).toBe(true);
    const ar = d.sources.docs.find((x) => x.kind === "annual_report")!;
    const read = new Set(d.sources.annualReportSelection.flatMap((s) => s.pages));
    expect(read.size).toBeLessThan(ar.pages / 4);
    for (const f of d.facts.filter((x) => x.docKind === "annual_report")) expect(read.has(f.page), f.id).toBe(true);
  });

  it("states its limitations", () => {
    expect(d.limitations.length).toBeGreaterThanOrEqual(4);
  });
});

describe("secrets stay out of the repository", () => {
  const SKIP = new Set(["node_modules", ".next", ".git", "raw"]);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      if (SKIP.has(f)) return [];
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|json|jsonl|md|mjs|css|txt|example)$/.test(f) || f === ".env.example" ? [p] : [];
    });
  const files = [...walk(root)].filter((f) => !f.endsWith("package-lock.json"));

  it("never contains the Gemini key value from .env.local", () => {
    const envFile = path.join(root, ".env.local");
    if (!existsSync(envFile)) return;
    const key = readFileSync(envFile, "utf8").match(/^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/m)?.[1]?.replace(/^["']|["']$/g, "");
    if (!key || key.length < 20) return;
    const offenders = files.filter((f) => !f.endsWith(".env.local") && readFileSync(f, "utf8").includes(key));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("contains no Google-style API key string, and .env.local is ignored by git", () => {
    const offenders = files.filter((f) => /AIza[0-9A-Za-z_-]{30,}/.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toMatch(/^\.env\*\.local$/m);
  });

  it("logs only token counts and timings for model calls, never prompts or responses", () => {
    const lines = readFileSync(path.join(root, "data/research/usage.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const allowed = new Set(["at", "label", "model", "promptTokens", "outputTokens", "thoughtTokens", "totalTokens", "latencyMs", "attempts", "retriedStatuses"]);
    for (const l of lines) for (const k of Object.keys(l)) expect(allowed.has(k), k).toBe(true);
  });
});
