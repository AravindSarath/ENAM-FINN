import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { extractSubject, isGenericSubject, isUninformative, pdfPriority } from "../lib/data/enrich";
import type { Announcement, AnnouncementSnapshot, AttachmentExcerpt } from "../lib/data/types";
import { MAX_EXCERPT_CHARS, normaliseExcerpt } from "../lib/sources/pdf";

function ann(o: Partial<Announcement> & { desc?: string; excerpt?: AttachmentExcerpt | null }): Announcement {
  const nseDesc = o.desc ?? "General Updates";
  const text = o.text ?? "";
  const excerpt = o.excerpt ?? null;
  return {
    id: "1",
    symbol: "XYZ",
    company: null,
    isin: null,
    nseDesc,
    text,
    subject: extractSubject(text),
    attachmentExcerpt: excerpt,
    attachmentUrl: o.attachmentUrl === undefined ? "https://nsearchives.nseindia.com/corporate/x.pdf" : o.attachmentUrl,
    attachmentSize: null,
    announcedAt: "2026-10-30T10:00:00.000Z",
    announcedAtRaw: "",
    hasXbrl: false,
    classification: classify(nseDesc, text, { subject: extractSubject(text), excerpt: excerpt?.status === "ok" ? excerpt.text : null }),
  };
}

describe("subject extraction", () => {
  it("reads quoted subjects", () => {
    expect(extractSubject("Avenue Supermarts Limited has informed the Exchange regarding 'Store Opening'.")).toBe("Store Opening");
    expect(extractSubject("Dixon has informed the Exchange regarding 'Giving of guarantees or indemnity or becoming a surety for any third party'")).toMatch(/^Giving of guarantees/);
  });
  it("reads a short subject after 'about'", () => {
    expect(extractSubject("Reliance Industries Limited has informed the Exchange about Credit Rating")).toBe("Credit Rating");
  });
  it("returns null for empty text and for long free text", () => {
    expect(extractSubject("")).toBeNull();
    expect(extractSubject("ICICI Bank Limited has informed the Exchange that the Board at its meeting held today, inter alia, approved the filing of an application with RBI seeking its approval")).toBeNull();
  });
  it("flags generic subjects", () => {
    expect(isGenericSubject("general updates")).toBe(true);
    expect(isGenericSubject("Store Opening")).toBe(false);
    expect(isGenericSubject(null)).toBe(true);
  });
  it("detects uninformative text", () => {
    expect(isUninformative("")).toBe(true);
    expect(isUninformative("Reliance Industries Limited has informed the Exchange about Investor Presentation")).toBe(true);
    expect(isUninformative("The Board approved the unaudited results for the quarter ended September 30, 2026")).toBe(false);
  });
});

describe("which filings get their PDF read", () => {
  it("unclassified, non-routine filings come first", () => {
    expect(pdfPriority(ann({ desc: "General Updates", text: "" }))).toBe(1);
  });
  it("review or low-confidence filings come second", () => {
    expect(pdfPriority(ann({ desc: "Other Restructuring", text: "Disclosure under Regulation 30" }))).toBe(2);
  });
  it("uninformative text with a non-high-confidence category comes third", () => {
    const a = ann({ desc: "Shareholders meeting", text: "" });
    expect(a.classification.confidence).toBe("medium");
    expect(pdfPriority(a)).toBe(3);
  });
  it("never fetches routine filings, confident ones, ones already read, or ones without a PDF", () => {
    expect(pdfPriority(ann({ desc: "Trading Window", text: "closure of the trading window" }))).toBe(0);
    expect(pdfPriority(ann({ desc: "Acquisition", text: "wholly owned subsidiary incorporated in Canada" }))).toBe(0);
    expect(pdfPriority(ann({ desc: "General Updates", text: "", excerpt: { status: "ok", page: 1, url: "u", extractedAt: "t", text: "financial results quarter ended" } }))).toBe(0);
    expect(pdfPriority(ann({ desc: "General Updates", text: "", attachmentUrl: null }))).toBe(0);
    expect(pdfPriority(ann({ desc: "General Updates", text: "", attachmentUrl: "https://x/y.xml" }))).toBe(0);
  });
  it("retries a failed read next time", () => {
    const failed: AttachmentExcerpt = { status: "failed", page: 1, url: "u", extractedAt: "t", text: "", reason: "HTTP 500" };
    expect(pdfPriority(ann({ desc: "General Updates", text: "", excerpt: failed }))).toBe(1);
  });
});

describe("excerpt-aware classification", () => {
  const ex = (text: string) => ({ excerpt: text });

  it("resolves an unclassified filing from page 1 and records the evidence", () => {
    const c = classify("General Updates", "", ex("Sub: Outcome of Board Meeting. Unaudited financial results for the quarter ended September 30, 2026"));
    expect(c.category).toBe("results");
    expect(c.confidence).toBe("medium");
    expect(c.evidence?.source).toBe("pdf");
    expect(c.needsReview).toBe(false);
  });

  it("confirms a low-confidence label: an investor presentation that is the results deck", () => {
    const before = classify("Investor Presentation", "informed the Exchange about Investor Presentation");
    expect(before.confidence).toBe("low");
    const after = classify("Investor Presentation", "informed the Exchange about Investor Presentation", ex("Presentation on unaudited financial results for the quarter ended September 30, 2026"));
    expect(after.category).toBe("results");
    expect(after.confidence).toBe("medium");
    expect(after.needsReview).toBe(false);
  });

  it("an empty or missing excerpt (failed read) leaves the filing flagged and visible", () => {
    const c = classify("General Updates", "", { excerpt: null });
    expect(c).toEqual(classify("General Updates", ""));
    expect(c.needsReview).toBe(true);
    expect(c.routine).toBe(false);
  });

  it("an excerpt can never make a filing routine", () => {
    const c = classify("General Updates", "", ex("Intimation of trading window closure. Compliance certificate. ESOP allotment"));
    expect(c.routine).toBe(false);
  });

  it("does not override a confident classification", () => {
    const c = classify("Acquisition", "wholly owned subsidiary", ex("quarterly results"));
    expect(c.category).toBe("M&A");
    expect(c.evidence?.source).toBe("label");
  });
});

describe("excerpt normalisation", () => {
  it("collapses whitespace and caps the length", () => {
    expect(normaliseExcerpt("a \n\n  b\t c")).toBe("a b c");
    expect(normaliseExcerpt("x".repeat(5000))).toHaveLength(MAX_EXCERPT_CHARS);
  });
});

describe("committed enrichment", () => {
  const dir = path.join(__dirname, "..", "data", "announcements");
  const items = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => (JSON.parse(readFileSync(path.join(dir, f), "utf8")) as AnnouncementSnapshot).items);

  it("commits only short excerpts with a source URL and a time", () => {
    const withEx = items.filter((i) => i.attachmentExcerpt);
    expect(withEx.length).toBeGreaterThan(30);
    for (const i of withEx) {
      const e = i.attachmentExcerpt!;
      expect(e.text.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS);
      expect(e.url).toMatch(/^https:\/\//);
      expect(Number.isNaN(new Date(e.extractedAt).getTime())).toBe(false);
      if (e.status === "failed") expect(e.reason).toBeTruthy();
    }
  });

  it("a filing whose PDF read failed is never Routine unless a label or text rule said so", () => {
    for (const i of items.filter((x) => x.attachmentExcerpt?.status === "failed")) {
      if (i.classification.routine) expect(i.classification.routineRule, i.id).toBeTruthy();
    }
  });

  it("every category other than unclassified carries evidence", () => {
    for (const i of items) {
      if (i.classification.category !== "unclassified") expect(i.classification.evidence, `${i.symbol} ${i.nseDesc}`).not.toBeNull();
    }
  });
});
