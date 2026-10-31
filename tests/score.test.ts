import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { reactsTo, tierFor } from "../lib/data/score";

const cls = (desc: string, text: string) => classify(desc, text);

describe("tierFor", () => {
  it("routine paperwork stays routine whatever its category", () => {
    const c = cls("Copy of Newspaper Publication", "Newspaper clippings Proposed Initial Public Offer of Jio Platforms");
    expect(tierFor({ category: c.category, classification: c, reaction: null }).tier).toBe("routine");
  });

  it("management change, litigation and pledging are Act", () => {
    for (const [d, t] of [
      ["General Updates", "resignation of the Chief Financial Officer"],
      ["Action(s) taken or orders passed", "penalty imposed"],
    ] as const) {
      const c = cls(d, t);
      expect(tierFor({ category: c.category, classification: c, reaction: null }).tier).toBe("act");
    }
  });

  it("a low-confidence 'act' category is capped at Noted", () => {
    const c = cls("Other Restructuring", "Disclosure under Regulation 30");
    expect(c.confidence).toBe("low");
    const t = tierFor({ category: c.category, classification: c, reaction: null });
    expect(t.tier).toBe("note");
    expect(t.why).toMatch(/low confidence/);
  });

  it("a market reaction raises Noted to Act and says why", () => {
    const c = cls("Credit Rating", "informed the Exchange about Credit Rating");
    expect(tierFor({ category: c.category, classification: c, reaction: null }).tier).toBe("note");
    const t = tierFor({ category: c.category, classification: c, reaction: "volume 2.7× average on the 2026-10-30 session" });
    expect(t.tier).toBe("act");
    expect(t.why).toMatch(/Raised to Act/);
  });

  it("an unrecognised filing is Noted, never hidden as routine", () => {
    const c = cls("Updates", "This is further to the disclosure dated September 21, 2026 made by the Company.");
    const t = tierFor({ category: c.category, classification: c, reaction: null });
    expect(t.tier).toBe("note");
  });

  it("call material and investor meeting schedules are routine by policy", () => {
    const a = cls("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the discussion on results");
    expect(tierFor({ category: a.category, classification: a, reaction: null }).tier).toBe("routine");
    const b = cls("Analysts/Institutional Investor Meet/Con. Call Updates", "participating in the Institutional Investors' Meeting - UBS");
    expect(tierFor({ category: b.category, classification: b, reaction: null }).tier).toBe("routine");
  });
});

describe("reactsTo", () => {
  it("counts filings in the 36 hours before a session close", () => {
    // Session 2026-10-30 closes 15:30 IST = 10:00Z
    expect(reactsTo("2026-10-30T05:00:00Z", "2026-10-30")).toBe(true);
    expect(reactsTo("2026-10-29T05:00:00Z", "2026-10-30")).toBe(true);
  });
  it("ignores filings after the close and filings too long before it", () => {
    expect(reactsTo("2026-10-30T14:10:00Z", "2026-10-30")).toBe(false);
    expect(reactsTo("2026-10-28T05:00:00Z", "2026-10-30")).toBe(false);
  });
});
