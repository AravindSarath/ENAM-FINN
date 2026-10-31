import { describe, expect, it } from "vitest";
import { reactsTo, sessionCloseMs } from "../lib/data/score";

describe("session timing", () => {
  it("closes at 15:30 IST", () => {
    expect(new Date(sessionCloseMs("2026-10-30")).toISOString()).toBe("2026-10-30T10:00:00.000Z");
  });

  it("counts filings in the 36 hours before a session close", () => {
    expect(reactsTo("2026-10-30T05:00:00Z", "2026-10-30")).toBe(true);
    expect(reactsTo("2026-10-29T05:00:00Z", "2026-10-30")).toBe(true);
  });

  it("ignores filings after the close and filings too long before it", () => {
    expect(reactsTo("2026-10-30T14:10:00Z", "2026-10-30")).toBe(false);
    expect(reactsTo("2026-10-28T05:00:00Z", "2026-10-30")).toBe(false);
  });
});
