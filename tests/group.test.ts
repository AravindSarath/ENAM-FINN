import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/data/classify";
import { commonSubjects, groupAnnouncements, jaccard, linkReason, specificSubject } from "../lib/data/group";
import type { Announcement, AnnouncementSnapshot } from "../lib/data/types";

let n = 0;
function mk(o: Partial<Announcement> & { at?: string } = {}): Announcement {
  const nseDesc = o.nseDesc ?? "General Updates";
  const text = o.text ?? "";
  n++;
  return {
    id: o.id ?? String(n),
    symbol: "XYZ",
    company: null,
    isin: null,
    nseDesc,
    text,
    subject: o.subject ?? null,
    attachmentExcerpt: o.attachmentExcerpt ?? null,
    attachmentUrl: o.attachmentUrl ?? null,
    attachmentSize: null,
    announcedAt: o.at ?? o.announcedAt ?? "2026-10-30T10:00:00.000Z",
    announcedAtRaw: "",
    hasXbrl: false,
    classification: o.classification ?? classify(nseDesc, text, { subject: o.subject ?? null, excerpt: o.attachmentExcerpt?.status === "ok" ? o.attachmentExcerpt.text : null }),
  };
}
const hoursLater = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3_600_000).toISOString();
const rank = () => 0;

describe("what must NOT merge", () => {
  it("same symbol, same category and a close time are not enough", () => {
    const a = mk({ nseDesc: "Bagging/Receiving of orders/contracts", text: "Order worth Rs 500 crore received from one customer for solar modules", at: "2026-10-30T10:00:00Z" });
    const b = mk({ nseDesc: "Bagging/Receiving of orders/contracts", text: "Order worth Rs 80 crore from a different customer for transmission lines", at: "2026-10-30T12:00:00Z" });
    expect(linkReason(a, b)).toBeNull();
    expect(groupAnnouncements([a, b], rank)).toHaveLength(2);
  });

  it("identical but uninformative boilerplate does not merge", () => {
    const t = "XYZ has informed the Exchange regarding 'general updates'.";
    const a = mk({ nseDesc: "Updates", text: t, subject: "general updates" });
    const b = mk({ nseDesc: "Updates", text: t, subject: "general updates", at: "2026-10-30T11:00:00Z" });
    expect(linkReason(a, b)).toBeNull();
  });

  it("a subject equal to NSE's label is a filing type, not an event", () => {
    const a = mk({ nseDesc: "Credit Rating", text: "XYZ has informed the Exchange about Credit Rating", subject: "Credit Rating" });
    const b = mk({ nseDesc: "Credit Rating", text: "XYZ has informed the Exchange about Credit Rating", subject: "Credit Rating", at: "2026-10-30T14:00:00Z" });
    expect(specificSubject(a)).toBeNull();
    expect(linkReason(a, b)).toBeNull();
  });

  it("a subject that recurs across the data is a filing type", () => {
    const mkSub = (s: string) => mk({ nseDesc: "Analysts/Institutional Investor Meet/Con. Call Updates", subject: s, text: `XYZ informed about ${s}` });
    const all = [mkSub("Schedule of meet"), mkSub("Schedule of meet"), mkSub("Schedule of meet")];
    const common = commonSubjects(all);
    expect(common.has("schedule of meet")).toBe(true);
    expect(linkReason(all[0], all[1], { common })).toBeNull();
  });

  it("filings beyond 72 hours do not merge on subject or text", () => {
    const a = mk({ nseDesc: "Updates", subject: "Store Opening in Pune", text: "XYZ has informed the Exchange regarding 'Store Opening in Pune'." });
    const b = mk({ nseDesc: "Updates", subject: "Store Opening in Pune", text: "XYZ has informed the Exchange regarding 'Store Opening in Pune'.", at: hoursLater(a.announcedAt, 100) });
    expect(linkReason(a, b)).toBeNull();
  });

  it("a results follow-up with a different period, or none, does not merge with the outcome", () => {
    const outcome = mk({ nseDesc: "Outcome of Board Meeting", text: "approved the unaudited financial results for the quarter ended September 30, 2026" });
    const other = mk({ nseDesc: "Press Release", text: "results for the quarter ended June 30, 2026", at: hoursLater(outcome.announcedAt, 1) });
    const none = mk({ nseDesc: "Investor Presentation", text: "informed the Exchange about Investor Presentation", at: hoursLater(outcome.announcedAt, 1) });
    expect(linkReason(outcome, other)).toBeNull();
    expect(linkReason(outcome, none)).toBeNull();
  });
});

describe("what merges, and why", () => {
  it("the same attachment", () => {
    const a = mk({ attachmentUrl: "https://x/y.pdf" });
    const b = mk({ attachmentUrl: "https://x/y.pdf", at: hoursLater(a.announcedAt, 500) });
    expect(linkReason(a, b)?.kind).toBe("same_attachment");
  });

  it("the same specific subject within 72 hours", () => {
    const a = mk({ nseDesc: "Updates", subject: "Business Transfer Agreement with Vyoma.AI Limited", text: "XYZ has informed the Exchange regarding 'Business Transfer Agreement with Vyoma.AI Limited'." });
    const b = mk({ nseDesc: "General Updates", subject: "Business Transfer Agreement with Vyoma.AI Limited", text: "Update on the Business Transfer Agreement", at: hoursLater(a.announcedAt, 5) });
    expect(linkReason(a, b)?.kind).toBe("same_subject");
  });

  it("near-identical informative text with the same label", () => {
    const t = "The Board of Directors approved the unaudited standalone and consolidated financial results of the Company for the quarter and half year ended September 30, 2026";
    const a = mk({ nseDesc: "Outcome of Board Meeting", text: t });
    const b = mk({ nseDesc: "Outcome of Board Meeting", text: `${t}.`, at: hoursLater(a.announcedAt, 0.01) });
    expect(jaccard(a.text, b.text)).toBeGreaterThanOrEqual(0.85);
    expect(linkReason(a, b)?.kind).toBe("same_text");
  });

  it("results follow-ups that state the same period, in text or in the PDF excerpt", () => {
    const outcome = mk({ nseDesc: "Outcome of Board Meeting", text: "approved the unaudited financial results for the quarter ended September 30, 2026" });
    const pr = mk({ nseDesc: "Press Release", text: "In continuation, the Financial Results for the quarter ended September 30, 2026", at: hoursLater(outcome.announcedAt, 0.5) });
    const deck = mk({
      nseDesc: "Investor Presentation",
      text: "informed the Exchange about Investor Presentation",
      at: hoursLater(outcome.announcedAt, 0.2),
      attachmentExcerpt: { status: "ok", page: 1, url: "https://x/d.pdf", extractedAt: "t", text: "Presentation on the financial results for the quarter and half year ended September 30, 2026" },
    });
    expect(linkReason(outcome, pr)?.kind).toBe("same_period");
    expect(linkReason(outcome, deck)?.kind).toBe("same_period");
  });
});

describe("cluster structure", () => {
  it("makes the results outcome the primary and keeps every original with its reason", () => {
    const outcome = mk({ id: "o", nseDesc: "Outcome of Board Meeting", text: "approved the financial results for the quarter ended September 30, 2026" });
    const pr = mk({ id: "p", nseDesc: "Press Release", text: "financial results for the quarter ended September 30, 2026", at: hoursLater(outcome.announcedAt, 1) });
    const call = mk({ id: "c", nseDesc: "Analysts/Institutional Investor Meet/Con. Call Updates", text: "Audio recording of the discussion on the financial results for the quarter ended September 30, 2026", at: hoursLater(outcome.announcedAt, 20) });
    const cl = groupAnnouncements([pr, call, outcome], (a) => (a.nseDesc === "Outcome of Board Meeting" ? 100 : 0));
    expect(cl).toHaveLength(1);
    expect(cl[0].primary.id).toBe("o");
    expect(cl[0].members.map((m) => m.a.id).sort()).toEqual(["c", "p"]);
    expect(cl[0].members.every((m) => m.reason.detail.length > 0)).toBe(true);
  });
});

describe("real data invariants", () => {
  const dir = path.join(__dirname, "..", "data", "announcements");
  const snaps = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as AnnouncementSnapshot);
  const common = commonSubjects(snaps.flatMap((s) => s.items));

  it("every original filing appears exactly once across clusters, for every company", () => {
    for (const s of snaps) {
      const cl = groupAnnouncements(s.items, () => 0, { common });
      const ids = cl.flatMap((c) => [c.primary.id, ...c.members.map((m) => m.a.id)]);
      expect(ids.sort(), s.symbol).toEqual(s.items.map((i) => i.id).sort());
    }
  });

  it("members never share a cluster on symbol, label and time alone", () => {
    for (const s of snaps) {
      for (const c of groupAnnouncements(s.items, () => 0, { common })) {
        for (const m of c.members) expect(["same_attachment", "same_subject", "same_text", "same_period"]).toContain(m.reason.kind);
      }
    }
  });

  it("grouping reduces 298 filings only a little, because it is conservative", () => {
    const total = snaps.reduce((s, x) => s + x.items.length, 0);
    const clusters = snaps.reduce((s, x) => s + groupAnnouncements(x.items, () => 0, { common }).length, 0);
    expect(total).toBe(298);
    expect(clusters).toBeLessThan(total);
    expect(clusters).toBeGreaterThan(total * 0.75);
  });
});
