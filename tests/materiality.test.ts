import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { CATEGORY_BASE, CONFIDENCE_ADJUSTMENT, MODIFIERS, THRESHOLDS, scoreItem, tierOf, type ScoreInput } from "../lib/data/materiality";
import { loadBrief } from "../lib/data/view";

function score(desc: string, text: string, extra: Partial<ScoreInput> = {}, ctx: { subject?: string | null; excerpt?: string | null } = {}) {
  const c = classify(desc, text, ctx);
  return scoreItem({ category: c.category, classification: c, nseDesc: desc, text, subject: ctx.subject ?? null, kind: "filing", ...extra });
}

const sum = (r: { reasons: { points: number }[] }) => r.reasons.reduce((s, x) => s + x.points, 0);

describe("category weights", () => {
  it("starts management changes at Act and a CFO resignation higher", () => {
    const plain = score("Change in Management", "");
    expect(plain.score).toBe(CATEGORY_BASE.management_change);
    expect(plain.tier).toBe("act");
    const cfo = score("Resignation", "the Chief Financial Officer has resigned");
    expect(cfo.score).toBe(CATEGORY_BASE.management_change + MODIFIERS.seniorRole);
  });

  it("scores a director completing a scheduled term as Noted", () => {
    const r = score("Cessation", "completed his 2nd term as an Independent Director");
    expect(r.score).toBe(CATEGORY_BASE.management_change + MODIFIERS.scheduledTerm);
    expect(r.tier).toBe("note");
  });

  it("low-confidence M&A cannot reach Act on its own", () => {
    const r = score("Other Restructuring", "Disclosure under Regulation 30");
    expect(r.score).toBe(CATEGORY_BASE["M&A"] + CONFIDENCE_ADJUSTMENT.low);
    expect(r.tier).toBe("note");
  });

  it("category inferred only from a PDF page is penalised", () => {
    const r = score("General Updates", "", {}, { excerpt: "Sub: Acquisition of shares in a joint venture company" });
    expect(r.reasons.some((x) => /inferred from page 1/i.test(x.label))).toBe(true);
    expect(r.score).toBeLessThan(THRESHOLDS.act);
  });
});

describe("market reaction", () => {
  const rating = (reaction: ScoreInput["reaction"]) => score("Credit Rating", "informed the Exchange about Credit Rating", { reaction });

  it("lifts a Noted category to Act when the session reflected it, and itemises why", () => {
    expect(rating(null).tier).toBe("note");
    const r = rating({ volX: 2.7, dayPct: -4.6, session: "2026-10-30" });
    expect(r.tier).toBe("act");
    expect(r.reasons.map((x) => x.label).join(" | ")).toMatch(/Volume 2.7×.*Price -4.6%/);
  });

  it("caps the total reaction contribution", () => {
    const base = rating(null).score;
    const r = rating({ volX: 9, dayPct: 12, session: "2026-10-30" });
    expect(r.score - base).toBe(MODIFIERS.reactionCap);
  });

  it("is monotonic: more reaction never lowers the score", () => {
    const ladder = [null, { volX: 1, dayPct: 1 }, { volX: 2, dayPct: 1 }, { volX: 3, dayPct: 1 }, { volX: 3, dayPct: 4 }, { volX: 3, dayPct: 7 }].map((x) => (x ? { ...x, session: "s" } : null));
    const scores = ladder.map((x) => rating(x).score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
  });

  it("does not apply to call material or investor-meeting notices", () => {
    const r = score("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the discussion on results", { reaction: { volX: 5, dayPct: 9, session: "s" } });
    expect(r.tier).toBe("routine");
  });
});

describe("floors and ceilings", () => {
  it("caps positively identified routine paperwork and shows the cap as a line", () => {
    const r = score("Trading Window", "closure of the trading window");
    expect(r.tier).toBe("routine");
    expect(r.score).toBeLessThanOrEqual(THRESHOLDS.routineCeiling);
    expect(sum(r)).toBe(r.score);
  });

  it("keeps an unrecognised filing visible at the floor", () => {
    const r = score("Updates", "This is further to the disclosure dated September 21, 2026 made by the Company.");
    expect(r.score).toBe(THRESHOLDS.visibilityFloor);
    expect(r.tier).toBe("note");
    expect(r.reasons.some((x) => /kept visible/i.test(x.label))).toBe(true);
  });

  it("a failed PDF read changes nothing: the filing stays Noted, never Routine", () => {
    const withoutPdf = score("General Updates", "");
    const afterFailedRead = score("General Updates", "", {}, { excerpt: null });
    expect(afterFailedRead).toEqual(withoutPdf);
    expect(withoutPdf.tier).toBe("note");
  });

  it("a PDF excerpt can never make a filing routine", () => {
    const r = score("General Updates", "", {}, { excerpt: "Intimation of trading window closure and compliance certificate" });
    expect(classify("General Updates", "", { excerpt: "Intimation of trading window closure" }).routine).toBe(false);
    expect(r.tier).not.toBe("routine");
  });
});

describe("results scoring", () => {
  const base = { category: "results" as const, nseDesc: "Outcome of Board Meeting", text: "approved the unaudited financial results", subject: null, kind: "results" as const };
  const c = classify("Outcome of Board Meeting", "approved the unaudited financial results for the quarter ended September 30, 2026");

  it("adds points for the size of change, not its direction", () => {
    const small = scoreItem({ ...base, classification: c, results: { withheld: false, maxChangePct: 5 } });
    const notable = scoreItem({ ...base, classification: c, results: { withheld: false, maxChangePct: 20 } });
    const large = scoreItem({ ...base, classification: c, results: { withheld: false, maxChangePct: 45 } });
    expect(notable.score - small.score).toBe(MODIFIERS.changeNotable);
    expect(large.score - small.score).toBe(MODIFIERS.changeLarge);
    expect(large.tier).toBe("act");
  });

  it("subtracts a little when the numbers could not be shown, and stays Act", () => {
    const r = scoreItem({ ...base, classification: c, results: { withheld: true, maxChangePct: null } });
    expect(r.reasons.some((x) => x.points === MODIFIERS.resultsNumbersWithheld)).toBe(true);
    expect(r.tier).toBe("act");
  });

  it("a board-meeting date notice is only Noted", () => {
    const notice = classify("Analysts/Institutional Investor Meet/Con. Call Updates", "A meeting of the Board is scheduled to consider the financial results");
    const r = scoreItem({ category: "results", classification: { ...notice, category: "results" }, nseDesc: "x", text: "", subject: null, kind: "filing", isResultsNotice: true });
    expect(r.tier).toBe("note");
  });
});

describe("move cards", () => {
  const stats = { sigmaMultiple: 3.4, consecutive: 1, volX: 4, dayPct: -7, session: "2026-10-30" };
  it("start at Act and itemise the extras", () => {
    const r = scoreItem({ category: "unclassified", classification: classify("", ""), nseDesc: "", text: "", subject: null, kind: "move", move: stats });
    expect(r.score).toBe(MODIFIERS.moveCardBase + MODIFIERS.sigma3 + MODIFIERS.consecutive);
    expect(r.tier).toBe("act");
    expect(sum(r)).toBe(r.score);
  });
});

describe("determinism and independence from illustrative data", () => {
  it("returns identical results for identical input", () => {
    expect(score("Acquisition", "wholly owned subsidiary")).toEqual(score("Acquisition", "wholly owned subsidiary"));
  });

  it("ignores any portfolio weight passed alongside", () => {
    const a = score("Acquisition", "x");
    const b = scoreItem({ ...({ category: "M&A", classification: classify("Acquisition", "x"), nseDesc: "Acquisition", text: "x", subject: null, kind: "filing", weight: 99, portfolioWeight: 40 } as unknown as ScoreInput) });
    expect(b).toEqual(a);
  });

  it("tier boundaries follow the documented thresholds", () => {
    expect(tierOf(THRESHOLDS.act)).toBe("act");
    expect(tierOf(THRESHOLDS.act - 1)).toBe("note");
    expect(tierOf(THRESHOLDS.noted)).toBe("note");
    expect(tierOf(THRESHOLDS.noted - 1)).toBe("routine");
  });
});

describe("scores on the real feed", () => {
  const feed = loadBrief().feed.filter((f) => !f.sample);

  it("reasons always sum to the score (clamped 0–100) and the tier matches it", () => {
    for (const f of feed) {
      const total = Math.min(100, Math.max(0, f.reasons.reduce((s, r) => s + r.points, 0)));
      expect(total, `${f.sym} ${f.title}`).toBe(f.score);
      expect(tierOf(f.score), `${f.sym} ${f.title}`).toBe(f.tier);
    }
  });

  it("every card has at least one reason and one piece of evidence", () => {
    for (const f of feed) {
      expect(f.reasons.length, f.id).toBeGreaterThan(0);
      expect(f.evidence.length, f.id).toBeGreaterThan(0);
    }
  });
});

describe("documentation stays in step with the code", () => {
  const doc = readFileSync(path.join(__dirname, "..", "docs", "PUSH_INTELLIGENCE.md"), "utf8");
  const row = (key: string, value: number | string) => new RegExp("`" + key.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&") + "`\\s*\\|\\s*" + String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");

  it("lists every category weight", () => {
    for (const [k, v] of Object.entries(CATEGORY_BASE)) expect(doc, k).toMatch(row(k, v));
  });
  it("lists every modifier and threshold", () => {
    for (const [k, v] of Object.entries(MODIFIERS)) expect(doc, k).toMatch(row(k, v));
    for (const [k, v] of Object.entries(THRESHOLDS)) expect(doc, k).toMatch(row(k, v));
  });
  it("lists the confidence adjustments", () => {
    for (const [k, v] of Object.entries(CONFIDENCE_ADJUSTMENT)) expect(doc, k).toMatch(row(`confidence.${k}`, v));
  });
});
