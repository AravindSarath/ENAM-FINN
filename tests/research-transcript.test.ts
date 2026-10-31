import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyStatements } from "../lib/research/extract";
import { contextAround, locateQuote, parseTranscript, renderForModel } from "../lib/research/transcript";
import type { DocRef } from "../lib/research/types";
import { normalizeForMatch, normalizeText } from "../lib/research/verify";

const fx = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "transcript_ril_q1fy27_pages.json"), "utf8")) as { totalPages: number; pages: Record<string, string> };
/** Pages keyed by real page number; unused pages are empty so page numbers stay true. */
const pages = Array.from({ length: fx.totalPages }, (_, i) => fx.pages[String(i + 1)] ?? "");
const parsed = parseTranscript(pages);
const doc: DocRef = { id: "T", kind: "transcript", title: "t", label: "Jul 2026", url: "https://example/t.pdf", periodLabel: "Q1 FY27", periodEnd: "2026-06-30" };

describe("normalisation", () => {
  it("unifies typography and rejoins line-end hyphens without changing words", () => {
    expect(normalizeText("It’s  “up”\n25% — quarter-on-\nquarter")).toBe(`It's "up" 25% - quarter-on-quarter`);
    expect(normalizeForMatch("A  B")).toBe("a b");
  });
});

describe("speaker identification (from the transcript's own headers)", () => {
  it("reads the participant roster", () => {
    expect(parsed.roster.get("v srikanth")).toMatch(/^CFO/);
    expect(parsed.roster.get("anshuman thakur")).toMatch(/Head of Strategy/);
  });

  it("marks presentation turns and company answers as management, with designations", () => {
    const mgmt = parsed.turns.filter((t) => t.speaker.role === "management");
    expect(mgmt.map((t) => t.speaker.name)).toContain("V Srikanth");
    expect(mgmt.find((t) => t.speaker.name === "V Srikanth")!.speaker.designation).toMatch(/CFO/);
    expect(mgmt.find((t) => t.speaker.name === "Anshuman Thakur")).toBeDefined();
  });

  it("marks questioners as analysts", () => {
    const a = parsed.turns.filter((t) => t.speaker.role === "analyst");
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].speaker.name).toBe("Manish Adukia");
  });

  it("gives text before the first header an unknown role", () => {
    expect(parsed.turns[0].speaker.role).toBe("unknown");
  });

  it("tags blocks for the model so it can skip analysts", () => {
    const text = renderForModel(parsed);
    expect(text).toMatch(/<<MANAGEMENT: V Srikanth, CFO/);
    expect(text).toMatch(/<<ANALYST QUESTION \(do not extract\): Manish Adukia>>/);
    expect(text).toMatch(/\[\[page 3\]\]/);
  });
});

describe("locating quotes", () => {
  it("finds a real management quote on its page and attributes it to the speaker", () => {
    const loc = locateQuote(parsed, "topline up 25% primarily because of oil prices, but it is also a fact that Jio topline was also up 12%", 3)!;
    expect(loc.page).toBe(3);
    expect(loc.pageCorrected).toBe(false);
    expect(loc.turn.speaker.name).toBe("V Srikanth");
    expect(loc.turn.speaker.role).toBe("management");
  });

  it("corrects the page when the model cites the wrong one", () => {
    const loc = locateQuote(parsed, "topline up 25% primarily because of oil prices", 9)!;
    expect(loc.page).toBe(3);
    expect(loc.pageCorrected).toBe(true);
  });

  it("matches across typography and line breaks", () => {
    const loc = locateQuote(parsed, "Extraordinary when you look at it from point of view of macro volatility.", 3);
    expect(loc).not.toBeNull();
  });

  it("returns null for text that is not in the document", () => {
    expect(locateQuote(parsed, "Reliance will double its retail EBITDA next year", 3)).toBeNull();
  });

  it("builds a context window that contains the quote", () => {
    const q = "topline up 25% primarily because of oil prices";
    const loc = locateQuote(parsed, q, 3)!;
    expect(normalizeForMatch(contextAround(parsed, loc.offset, q.length))).toContain(q);
  });
});

describe("verifyStatements: model proposes, code disposes", () => {
  const base = { kind: "commentary" as const, scope: "Group", statement: "Topline up 25%", page: 3, quantified: null };
  const good = { ...base, quote: "topline up 25% primarily because of oil prices, but it is also a fact that Jio topline was also up 12%" };

  it("keeps a verbatim management quote with code-derived speaker and a context snippet", () => {
    const { facts, dropped } = verifyStatements(doc, parsed, [good], "m");
    expect(dropped).toEqual([]);
    expect(facts).toHaveLength(1);
    expect(facts[0].speaker!.name).toBe("V Srikanth");
    expect(facts[0].speaker!.designation).toMatch(/CFO/);
    expect(facts[0].verification).toEqual({ quoteVerbatim: true, pageCorrected: false, speakerSource: "code", adjustments: [] });
    expect(normalizeForMatch(facts[0].context)).toContain(normalizeForMatch(facts[0].quote));
    expect(facts[0].id).toMatch(/^T:p3:[0-9a-f]{8}$/);
  });

  it("drops a paraphrase that is not in the transcript", () => {
    const { facts, dropped } = verifyStatements(doc, parsed, [{ ...good, quote: "Management said topline rose a quarter on higher crude prices" }], "m");
    expect(facts).toEqual([]);
    expect(dropped[0].reason).toBe("quote_not_found");
  });

  it("never attributes an analyst question to management", () => {
    const { facts, dropped } = verifyStatements(doc, parsed, [{ ...base, page: 20, quote: "My second question on the ARPU number for the quarter." }], "m");
    expect(facts).toEqual([]);
    expect(dropped[0].reason).toBe("in_analyst_turn");
  });

  it("drops text outside any recognised speaker turn", () => {
    const { facts, dropped } = verifyStatements(doc, parsed, [{ ...base, page: 1, quote: "Transcript of the discussion on the Unaudited Financial Results" }], "m");
    expect(facts).toEqual([]);
    // the cover letter lives in page 1 which the fixture leaves empty, so it cannot even be found
    expect(["quote_not_found", "speaker_unknown"]).toContain(dropped[0].reason);
  });

  it("drops ellipses, over-long quotes and duplicates, and records schema failures", () => {
    const long = `${good.quote} ${"x".repeat(400)}`;
    const { facts, dropped } = verifyStatements(doc, parsed, [{ ...good, quote: `${good.quote.slice(0, 30)}...${good.quote.slice(60)}` }, { ...good, quote: long }, good, good, { quote: "x" }], "m");
    expect(facts).toHaveLength(1);
    expect(dropped.map((d) => d.reason).sort()).toEqual(["duplicate", "quote_has_ellipsis", "quote_too_long", "schema_invalid"].sort());
  });

  it("rejects an unknown metric name", () => {
    const { facts, dropped } = verifyStatements(doc, parsed, [{ ...good, quantified: { metric: "ebitda_margin", direction: null, value: 1, valueHigh: null, unit: "percent", comparator: null, period: null, horizon: null } }], "m");
    expect(facts).toEqual([]);
    expect(dropped[0].reason).toBe("schema_invalid");
  });

  it("corrects a wrong cited page and records it", () => {
    const { facts } = verifyStatements(doc, parsed, [{ ...good, page: 4 }], "m");
    expect(facts[0].page).toBe(3);
    expect(facts[0].verification.pageCorrected).toBe(true);
  });
});

describe("guardrails on the model's own words", () => {
  const base = { kind: "commentary" as const, scope: "Group", page: 3, quantified: null, quote: "topline up 25% primarily because of oil prices, but it is also a fact that Jio topline was also up 12%" };

  it("drops a restatement that adds a number the quote does not contain, but keeps the verified quote", () => {
    const { facts } = verifyStatements(doc, parsed, [{ ...base, statement: "Revenue was up 25% to Rs. 1,17,000 Crores" }], "m");
    expect(facts).toHaveLength(1);
    expect(facts[0].statement).toBeNull();
    expect(facts[0].verification.adjustments[0]).toMatch(/statement_dropped: adds number 117000/);
  });

  it("drops a restatement that introduces a term (an acronym) absent from the quote", () => {
    const { facts } = verifyStatements(doc, parsed, [{ ...base, statement: "EBITDA was up 25%" }], "m");
    expect(facts[0].statement).toBeNull();
    expect(facts[0].verification.adjustments[0]).toMatch(/term EBITDA/);
  });

  it("keeps a restatement whose acronyms and numbers all appear in the quote", () => {
    const q = "starting with the numbers, topline up 25% primarily because of oil prices, but it is also a fact that Jio topline was also up 12%";
    const { facts } = verifyStatements(doc, parsed, [{ ...base, quote: q, statement: "Jio topline up 12%" }], "m");
    expect(facts[0].statement).not.toBeNull();
  });

  it("keeps a restatement that only uses what the quote says", () => {
    const { facts } = verifyStatements(doc, parsed, [{ ...base, statement: "Topline up 25% mainly on oil prices; Jio up 12%." }], "m");
    expect(facts[0].statement).not.toBeNull();
    expect(facts[0].verification.adjustments).toEqual([]);
  });

  it("drops structured numbers that were never spoken", () => {
    const q = { metric: "revenue_growth_yoy", direction: "increase", value: 100, valueHigh: null, unit: "percent", comparator: null, period: null, horizon: null };
    const { facts } = verifyStatements(doc, parsed, [{ ...base, statement: "Topline up 25%", quantified: q }], "m");
    expect(facts[0].quantified).toBeNull();
    expect(facts[0].verification.adjustments.join(" ")).toMatch(/value 100 is not in the quote/);
  });

  it("drops a company-wide metric attached to a segment, and a segment metric attached to the whole company", () => {
    const quote = "So, when you look at that, our overall EBITDA is more than Rs.54,000 Crores, so we are up 10%.";
    const q = (metric: string) => ({ metric, direction: "increase", value: 10, valueHigh: null, unit: "percent", comparator: null, period: null, horizon: null });
    const mk = (scope: string, metric: string) => verifyStatements(doc, parsed, [{ ...base, quote, scope, statement: "EBITDA up 10%", quantified: q(metric) }], "m").facts[0];
    const a = mk("Jio", "ebitda_growth_yoy");
    expect(a.quantified).toBeNull();
    expect(a.verification.adjustments.join(" ")).toMatch(/company-wide metric ebitda_growth_yoy used for scope "Jio"/);
    const b = mk("Group", "segment_ebitda_growth_yoy");
    expect(b.quantified).toBeNull();
    expect(b.verification.adjustments.join(" ")).toMatch(/segment metric/);
    expect(mk("Group", "ebitda_growth_yoy").quantified?.metric).toBe("ebitda_growth_yoy");
  });
});
