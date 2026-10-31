import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { parseNseAnnouncements } from "../lib/sources/nse";

describe("classify: real RELIANCE filings", () => {
  it("board outcome approving results is results", () => {
    const c = classify(
      "Outcome of Board Meeting",
      "In continuation of our letter dated October 27, 2026, we wish to inform you that the Board of Directors approved the unaudited Financial Results for the quarter and half year ended September 30, 2026",
    );
    expect(c.category).toBe("results");
    expect(c.routine).toBe(false);
  });

  it("an NCD enabling resolution in the same filing is captured as a secondary category", () => {
    const c = classify(
      "Outcome of Board Meeting",
      "approved the unaudited Financial Results; passed an enabling resolution for issuance of non-convertible debentures up to Rs. 15,000 crore",
    );
    expect(c.category).toBe("results");
    expect(c.categories).toContain("fund_raise");
  });

  it("transcripts and recordings are earnings_call even though they quote the results headline", () => {
    expect(classify("Analysts/Institutional Investor Meet/Con. Call Updates", "Transcript of the discussion on the Unaudited Financial Results of the Company for the quarter ended June 30, 2026").category).toBe("earnings_call");
    expect(classify("Analysts/Institutional Investor Meet/Con. Call Updates", "Audio recording of the discussion on the Unaudited Financial Results").category).toBe("earnings_call");
  });

  it("investor meeting participation is investor_meetings", () => {
    const c = classify("Analysts/Institutional Investor Meet/Con. Call Updates", "Please note that the Company executives will be participating in the Institutional Investors' Meeting - BofA");
    expect(c.category).toBe("investor_meetings");
  });

  it("trading window notices are routine and not insider trading", () => {
    const c = classify("Trading Window", "informed the Exchange regarding the Trading Window closure pursuant to SEBI (Prohibition of Insider Trading) Regulations");
    expect(c.routine).toBe(true);
    expect(c.category).not.toBe("insider_trading");
  });

  it("newspaper clippings are routine", () => {
    expect(classify("Copy of Newspaper Publication", "Newspaper clippings Special Window for transfer of physical shares").routine).toBe(true);
  });

  it("credit rating is high confidence", () => {
    const c = classify("Credit Rating", "Reliance Industries Limited has informed the Exchange about Credit Rating");
    expect(c.category).toBe("credit_rating");
    expect(c.confidence).toBe("high");
  });

  it("subsidiary IPO updates map to M&A", () => {
    expect(classify("General Updates", "Proposed Initial Public Offer of Jio Platforms Limited - filing of the Red Herring Prospectus.").category).toBe("M&A");
  });

  it("NCD allotment is a fund raise", () => {
    expect(classify("Allotment of Securities", "the Company has today allotted 13,00,000 Unsecured, Redeemable, Non-Convertible Debentures").category).toBe("fund_raise");
  });

  it("an uninformative 'Updates' filing is unclassified and flagged, never routine", () => {
    const c = classify("Updates", "This is further to the disclosure dated September 21, 2026 made by the Company. We wish to inform you that the");
    expect(c.category).toBe("unclassified");
    expect(c.needsReview).toBe(true);
    expect(c.routine).toBe(false);
  });

  it("low-confidence desc-only mappings are flagged for review", () => {
    const c = classify("Other Restructuring", "Disclosure under Regulation 30");
    expect(c.category).toBe("M&A");
    expect(c.confidence).toBe("low");
    expect(c.needsReview).toBe(true);
  });

  it("postal ballot vs AGM", () => {
    expect(classify("Shareholders meeting", "The Postal Ballot Notice dated July 17, 2026").category).toBe("postal_ballot");
    expect(classify("Shareholders meeting", "The voting results in the format prescribed under Regulation 44(3)").category).toBe("agm_egm");
  });
});

describe("classify: whole fixture", () => {
  const raw = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "nse_RELIANCE.json"), "utf8"));
  const snap = parseNseAnnouncements(raw, { symbol: "RELIANCE", url: "x", fetchedAt: "2026-10-31T00:00:00Z", from: "a", to: "b" });

  it("every item gets a classification and nothing unrecognised is marked routine", () => {
    for (const a of snap.items) {
      expect(a.classification.category).toBeTruthy();
      if (a.classification.rule === "none") {
        expect(a.classification.routine).toBe(false);
        expect(a.classification.needsReview).toBe(true);
      }
    }
  });

  it("the 30 Oct board outcomes are results", () => {
    const outcomes = snap.items.filter((a) => a.nseDesc === "Outcome of Board Meeting" && a.announcedAt.startsWith("2026-10-30"));
    expect(outcomes.length).toBeGreaterThan(0);
    expect(outcomes.every((a) => a.classification.category === "results")).toBe(true);
  });
});
