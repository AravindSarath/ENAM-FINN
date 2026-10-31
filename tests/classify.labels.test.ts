import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { tierFor } from "../lib/data/score";
import { periodEndFromText } from "../lib/data/view";

describe("NSE structured labels are authoritative (real labels seen in the 22-company snapshot)", () => {
  const cases: [string, string, string][] = [
    ["Acquisition", "Titan has incorporated Titan Company Canada Inc. as a wholly owned subsidiary", "M&A"],
    ["Sale or disposal", "sale of stake", "M&A"],
    ["Cessation", "completed his 2nd term as an Independent Director", "management_change"],
    ["Change in Management", "", "management_change"],
    ["Change in Director(s)", "", "management_change"],
    ["Appointment", "", "management_change"],
    ["Corporate Insolvency Resolution Process", "order passed by NCLAT", "litigation"],
    ["Bagging/Receiving of orders/contracts", "order worth Rs 500 crore", "press_release"],
    ["Rumour Verification - Regulation 30(11)", "", "press_release"],
    ["Qualified Institutional Placement", "", "fund_raise"],
    ["Preferential issue", "", "fund_raise"],
  ];
  it.each(cases)("%s → %s", (desc, text, cat) => {
    const c = classify(desc, text);
    expect(c.category).toBe(cat);
    expect(c.routine).toBe(false);
  });

  it("a guarantee filing is not mistaken for M&A and is flagged for review", () => {
    const c = classify("Giving guarantees/indemnity/ becoming a surety for third party", "the Company has given a guarantee in relation to an acquisition");
    expect(c.category).toBe("unclassified");
    expect(c.needsReview).toBe(true);
  });

  it("positively identifies routine paperwork labels", () => {
    for (const [d, t] of [
      ["ESOP/ESOS/ESPS", ""],
      ["Options to purchase securities", ""],
      ["Certificate under SEBI (Depositories and Participants) Regulations, 2018", ""],
      ["Change in Auditors", ""],
      ["Updates", "Appointment of Statutory Auditors Pursuant to Mandatory Auditor Rotation"],
      ["Monitoring Agency Report", ""],
    ] as const) {
      expect(classify(d, t).routine, d).toBe(true);
    }
  });

  it("explains the routine rule in the tier reason", () => {
    const c = classify("ESOP/ESOS/ESPS", "");
    expect(tierFor({ category: c.category, classification: c, reaction: null }).why).toMatch(/Routine paperwork \(esop-desc\)/);
  });

  it("a director completing a scheduled term is Noted, not Act", () => {
    const text = "Prof. X completed his 2nd term as an Independent Director of the Company on October 31, 2026, and consequently ceased to be a Director";
    const c = classify("Cessation", text);
    const t = tierFor({ category: c.category, classification: c, text, reaction: null });
    expect(t.tier).toBe("note");
    expect(t.why).toMatch(/scheduled term/);
  });

  it("a resignation stays Act", () => {
    const c = classify("Resignation", "the CFO has resigned with immediate effect");
    expect(tierFor({ category: c.category, classification: c, text: "the CFO has resigned", reaction: null }).tier).toBe("act");
  });
});

describe("period parsing from NSE text", () => {
  it("reads day-month-year and month-day-year forms", () => {
    expect(periodEndFromText("Unaudited Financial Results for the quarter and half year ended 30 September 2026")).toBe("2026-09-30");
    expect(periodEndFromText("results for the quarter ended 30th June, 2026")).toBe("2026-06-30");
    expect(periodEndFromText("for the quarter and half year ended September 30, 2026")).toBe("2026-09-30");
    expect(periodEndFromText("unaudited financial results of the Bank for the quarter and six months ended September 30, 2026")).toBe("2026-09-30");
  });
  it("returns null for text with no stated period", () => {
    expect(periodEndFromText("the Board approved the filing of an application with RBI")).toBeNull();
  });
});
