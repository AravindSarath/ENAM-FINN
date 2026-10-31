/**
 * MOCK DATA (Stage 1). Nothing here is live.
 * - Reliance Q2 FY27 results figures come from the screener.in snapshot taken during the Stage 0 spike.
 * - Everything else is illustrative and flagged `sample: true` where it appears in the UI.
 * Replaced by ingested snapshots in the data stage.
 */
import type { FeedItem, Holding } from "./types";

/** Demo clock: all windows are relative to this moment (IST evening, 31 Oct 2026). */
export const AS_OF_LABEL = "31 Oct 2026, 6:00 pm IST";

export const HOLDINGS: Holding[] = [
  { sym: "RELIANCE", name: "Reliance Industries", sector: "Conglomerate", weight: 11.8, price: 1164.9, dayPct: 1.2, volX: 1.1 },
  { sym: "HDFCBANK", name: "HDFC Bank", sector: "Banks", weight: 10.1, price: 1012.4, dayPct: -0.4, volX: 0.9 },
  { sym: "ICICIBANK", name: "ICICI Bank", sector: "Banks", weight: 8.7, price: 1480.2, dayPct: 0.3, volX: 1.0 },
  { sym: "TCS", name: "Tata Consultancy", sector: "IT", weight: 7.9, price: 2502.6, dayPct: -0.6, volX: 0.8 },
  { sym: "INFY", name: "Infosys", sector: "IT", weight: 7.4, price: 1688.5, dayPct: 0.9, volX: 1.3 },
  { sym: "SUNPHARMA", name: "Sun Pharma", sector: "Pharma", weight: 6.4, price: 1795.0, dayPct: -1.1, volX: 1.4 },
  { sym: "MARUTI", name: "Maruti Suzuki", sector: "Auto", weight: 5.9, price: 15240.0, dayPct: 0.5, volX: 0.9 },
  { sym: "TITAN", name: "Titan Company", sector: "Consumer", weight: 5.5, price: 3920.0, dayPct: -2.1, volX: 1.6 },
  { sym: "LT", name: "Larsen & Toubro", sector: "Capital goods", weight: 5.2, price: 3715.0, dayPct: 0.7, volX: 1.0 },
  { sym: "ITC", name: "ITC", sector: "Consumer", weight: 5.0, price: 412.3, dayPct: 0.2, volX: 0.8 },
  { sym: "BAJFINANCE", name: "Bajaj Finance", sector: "NBFC", weight: 4.6, price: 1034.7, dayPct: -0.3, volX: 1.1 },
  { sym: "ETERNAL", name: "Eternal", sector: "Internet", weight: 4.2, price: 343.65, dayPct: 2.4, volX: 1.8 },
  { sym: "DIXON", name: "Dixon Technologies", sector: "Electronics", weight: 3.6, price: 15830.0, dayPct: 3.1, volX: 2.3 },
  { sym: "POLYCAB", name: "Polycab India", sector: "Capital goods", weight: 3.2, price: 7420.0, dayPct: -1.4, volX: 1.2 },
  { sym: "KPITTECH", name: "KPIT Technologies", sector: "IT", weight: 3.0, price: 1295.0, dayPct: 1.9, volX: 1.5 },
  { sym: "HAL", name: "Hindustan Aeronautics", sector: "Defence", weight: 2.6, price: 4310.0, dayPct: 0.8, volX: 1.0 },
  { sym: "SUZLON", name: "Suzlon Energy", sector: "Energy", weight: 2.4, price: 33.9, dayPct: 6.2, volX: 3.4 },
  { sym: "VEDL", name: "Vedanta", sector: "Metals", weight: 2.5, price: 512.8, dayPct: -4.6, volX: 2.7 },
];

export const ADHOC = ["ASIANPAINT", "DMART", "CDSL", "TATAELXSI"];

const RELIANCE_RESULTS_URL =
  "https://nsearchives.nseindia.com/corporate/kavinavora_30102026193935_SE_30102026_Results.pdf";

export const FEED: FeedItem[] = [
  {
    id: "rel-results",
    sym: "RELIANCE",
    cat: "results",
    title: "Q2 FY27 results approved by the board",
    hoursAgo: 22,
    tier: "act",
    why: "Results · 11.8% of portfolio · largest position",
    soWhat: "Operating profit grew 19% QoQ on 7% higher revenue: margin widened to 17.1%.",
    kind: "results",
    url: RELIANCE_RESULTS_URL,
    sample: false,
    results: {
      period: "Q2 FY27",
      basis: "Consolidated",
      rows: [
        { label: "Revenue", cur: 330601, prevQ: 309468, yearAgo: 254623 },
        { label: "EBITDA*", cur: 56616, prevQ: 47517, yearAgo: 45885 },
        { label: "PBT", cur: 38613, prevQ: 30630, yearAgo: 29124 },
        { label: "PAT", cur: 29550, prevQ: 23196, yearAgo: 22092 },
      ],
    },
  },
  {
    id: "suz-move",
    sym: "SUZLON",
    cat: "press_release",
    title: "Volume 3.4× the 20-day average, price +6.2%",
    hoursAgo: 2,
    tier: "act",
    why: "Unusual move · volume above your 2× threshold · no filing explains it",
    soWhat: "A large move with no announcement behind it. Worth checking before the open.",
    kind: "move",
    sample: true,
    move: { volX: 3.4, dayPct: 6.2, series: [29.1, 29.4, 29.0, 29.8, 30.2, 29.9, 30.6, 31.1, 30.7, 31.5, 31.9, 31.4, 31.8, 32.0, 31.6, 31.9, 32.2, 31.7, 31.9, 33.9] },
  },
  {
    id: "kpit-cfo",
    sym: "KPITTECH",
    cat: "management_change",
    title: "Chief Financial Officer steps down; successor appointed",
    hoursAgo: 9,
    tier: "act",
    why: "Management change · CFO is a top-tier role · effective immediately",
    soWhat: "CFO transitions often precede guidance resets. The incoming CFO comes from a larger, slower-growing peer.",
    kind: "mgmt",
    sample: true,
    mgmt: {
      role: "Chief Financial Officer",
      outgoing: "R. Iyer",
      incoming: "S. Banerjee",
      bio: [
        "Finance leader with two decades across IT services and engineering R&D.",
        "Most recently CFO of a mid-cap technology services company.",
        "Chartered accountant; previously led investor relations and M&A integration.",
      ],
    },
  },
  {
    id: "ved-pledge",
    sym: "VEDL",
    cat: "pledging",
    title: "Promoter pledge on shares increased",
    hoursAgo: 14,
    tier: "act",
    why: "Pledging · stock down 4.6% today · volume 2.7×",
    soWhat: "Rising pledge into a falling price is a classic stress signal.",
    kind: "generic",
    sample: true,
  },
  {
    id: "rel-ncd",
    sym: "RELIANCE",
    cat: "fund_raise",
    title: "Board enables NCD issue of up to ₹15,000 crore",
    hoursAgo: 22,
    tier: "note",
    why: "Fund raise · enabling resolution only, not yet issued",
    soWhat: "Routine debt programme. Watch the tenor and rate when it is actually priced.",
    kind: "generic",
    url: RELIANCE_RESULTS_URL,
    sample: false,
  },
  {
    id: "titan-rating",
    sym: "TITAN",
    cat: "credit_rating",
    title: "Credit rating reaffirmed at the highest short-term grade",
    hoursAgo: 5,
    tier: "note",
    why: "Credit rating · reaffirmation, no change",
    soWhat: "No change. The stock is down 2.1% for other reasons.",
    kind: "generic",
    sample: true,
  },
  {
    id: "itc-div",
    sym: "ITC",
    cat: "dividend",
    title: "Interim dividend declared, record date 7 Nov",
    hoursAgo: 30,
    tier: "note",
    why: "Dividend · cash payout with a record date",
    soWhat: "Buy by 6 Nov to be eligible.",
    kind: "generic",
    sample: true,
  },
  {
    id: "sun-lit",
    sym: "SUNPHARMA",
    cat: "litigation",
    title: "Regulatory observation received at a manufacturing site",
    hoursAgo: 40,
    tier: "note",
    why: "Litigation / regulatory · site-level, no import alert yet",
    soWhat: "Contained for now. Escalation to a warning letter would matter.",
    kind: "generic",
    sample: true,
  },
  {
    id: "dix-capex",
    sym: "DIXON",
    cat: "capex",
    title: "Board approves new display-module facility",
    hoursAgo: 52,
    tier: "note",
    why: "Capex · expands capacity in a growth segment",
    soWhat: "Supports the volume story. Check the funding mix on the next call.",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-1",
    sym: "TCS",
    cat: "unclassified",
    title: "Allotment of shares under employee stock option plan",
    hoursAgo: 4,
    tier: "routine",
    why: "ESOP allotment · no impact on ownership",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-2",
    sym: "INFY",
    cat: "unclassified",
    title: "Trading window closure intimation",
    hoursAgo: 7,
    tier: "routine",
    why: "Compliance notice",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-3",
    sym: "HDFCBANK",
    cat: "unclassified",
    title: "Copy of newspaper publication: results advertisement",
    hoursAgo: 12,
    tier: "routine",
    why: "Advertisement of already-published results",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-4",
    sym: "LT",
    cat: "unclassified",
    title: "Compliance certificate under depository regulations",
    hoursAgo: 18,
    tier: "routine",
    why: "Compliance certificate",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-5",
    sym: "MARUTI",
    cat: "unclassified",
    title: "Analyst meet intimation",
    hoursAgo: 26,
    tier: "routine",
    why: "Scheduling notice",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-6",
    sym: "POLYCAB",
    cat: "unclassified",
    title: "Appointment of secretarial auditor",
    hoursAgo: 60,
    tier: "routine",
    why: "Auditor appointment",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
  {
    id: "ret-7",
    sym: "ICICIBANK",
    cat: "unclassified",
    title: "Disclosure of related-party transactions (half-yearly)",
    hoursAgo: 100,
    tier: "routine",
    why: "Periodic compliance disclosure",
    soWhat: "",
    kind: "generic",
    sample: true,
  },
];

export interface Dossier {
  sym: string;
  name: string;
  quarters: string[];
  revenue: number[];
  opProfit: number[];
  pat: number[];
}

/** Reliance 5-quarter series from the screener.in spike snapshot (₹ crore, consolidated). */
export const RELIANCE_DOSSIER: Dossier = {
  sym: "RELIANCE",
  name: "Reliance Industries",
  quarters: ["Sep 25", "Dec 25", "Mar 26", "Jun 26", "Sep 26"],
  revenue: [254623, 264905, 294059, 309468, 330601],
  opProfit: [45885, 46018, 44141, 47517, 56616],
  pat: [22092, 22290, 20589, 23196, 29550],
};
