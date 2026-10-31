import { describe, expect, it } from "vitest";
import { istToIso, monthEnd, nseDate, parseNumber, parsePeriod, rowKey, rowUnit } from "../lib/data/normalize";

describe("parseNumber", () => {
  it("parses Indian digit grouping", () => {
    expect(parseNumber("3,30,601")).toBe(330601);
    expect(parseNumber("1,23,456.78")).toBe(123456.78);
  });
  it("handles percent, negatives and unicode minus", () => {
    expect(parseNumber("17%")).toBe(17);
    expect(parseNumber("−12")).toBe(-12);
    expect(parseNumber("(1,234)")).toBe(-1234);
    expect(parseNumber("-5.5")).toBe(-5.5);
  });
  it("returns null, not zero, for blanks and unparseable text", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
  });
});

describe("periods and dates", () => {
  it("computes month ends, including leap February", () => {
    expect(monthEnd(2024, 1)).toBe("2024-02-29");
    expect(monthEnd(2025, 1)).toBe("2025-02-28");
    expect(monthEnd(2026, 8)).toBe("2026-09-30");
  });
  it("prefers the source's own date key", () => {
    expect(parsePeriod("Sep 2026", "2026-09-30", "quarter")).toEqual({ label: "Sep 2026", end: "2026-09-30", kind: "quarter" });
  });
  it("falls back to deriving the end from the label", () => {
    expect(parsePeriod("Mar 2025", null, "year")).toEqual({ label: "Mar 2025", end: "2025-03-31", kind: "year" });
  });
  it("treats TTM as a rolling period with no end date", () => {
    expect(parsePeriod("TTM", null, "year")).toEqual({ label: "TTM", end: null, kind: "ttm" });
  });
  it("converts NSE's IST timestamps to UTC", () => {
    expect(istToIso("31-Oct-2026 17:34:03")).toBe("2026-10-31T12:04:03.000Z");
    expect(istToIso("01-Jan-2026 00:10:00")).toBe("2025-12-31T18:40:00.000Z");
  });
  it("rejects malformed timestamps", () => {
    expect(istToIso("2026-10-31 17:34:03")).toBeNull();
    expect(istToIso("31-Foo-2026 17:34:03")).toBeNull();
  });
  it("formats NSE query dates in IST", () => {
    // 2026-10-31T20:00:00Z is already 1 Nov in IST.
    expect(nseDate(new Date("2026-10-31T20:00:00Z"))).toBe("01-11-2026");
    expect(nseDate(new Date("2026-10-31T10:00:00Z"))).toBe("31-10-2026");
  });
});

describe("row keys", () => {
  it("maps corporate and bank labels to canonical keys", () => {
    expect(rowKey("Sales")).toBe("revenue");
    expect(rowKey("Revenue")).toBe("revenue");
    expect(rowKey("Operating Profit")).toBe("operating_profit");
    expect(rowKey("Financing Profit")).toBe("financing_profit");
    expect(rowKey("Net Profit")).toBe("pat");
    expect(rowKey("Something Else")).toBeNull();
  });
  it("never maps Operating Profit to an EBITDA key", () => {
    expect(rowKey("Operating Profit")).not.toMatch(/ebitda/i);
  });
  it("infers units", () => {
    expect(rowUnit("OPM %")).toBe("percent");
    expect(rowUnit("EPS in Rs")).toBe("INR");
    expect(rowUnit("Sales")).toBe("INR_crore");
  });
});
