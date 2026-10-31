/**
 * Snapshot data model. Every snapshot file carries a `source` block so any number on screen can be traced
 * to a URL, a fetch time and a reporting period. Missing data is `null` with a reason, never a guess.
 */
import type { Category } from "../types";

export type Status = "ok" | "partial" | "unavailable";
export type Basis = "consolidated" | "standalone";

export interface Source {
  name: string;
  /** The exact URL fetched. */
  url: string;
  /** When we fetched it (ISO, UTC). */
  fetchedAt: string;
  /** Date of the newest datum in the response (ISO date or datetime). */
  asOf: string | null;
  status: Status;
  /** Why the status is not "ok". */
  reason?: string;
}

export interface Period {
  /** As displayed by the source, e.g. "Sep 2026" or "TTM". */
  label: string;
  /** Period end date (YYYY-MM-DD). Null for rolling periods such as TTM. */
  end: string | null;
  kind: "quarter" | "year" | "ttm";
}

export type Unit = "INR_crore" | "INR" | "percent" | "ratio" | "days" | "text";

export interface StatementRow {
  /** Label exactly as the source prints it (cleaned of UI glyphs). */
  label: string;
  /** Canonical key when we recognise the row; null otherwise. */
  key: string | null;
  unit: Unit;
  /** One value per period; null means the source left it blank or we could not parse it. */
  values: (number | null)[];
}

export interface StatementTable {
  section: "quarters" | "profit-loss" | "balance-sheet" | "cash-flow" | "ratios";
  title: string;
  /** The sub-heading the source prints, e.g. "Consolidated Figures in Rs. Crores". */
  unitNote: string;
  periods: Period[];
  rows: StatementRow[];
  /** Per-period link to the underlying filing, when the source provides one (quarters only). */
  periodSourceUrls: (string | null)[];
}

export interface DocLink {
  group: string;
  /** Period or date label as printed, e.g. "Oct 2026" or "Annual Report 2026". */
  label: string;
  links: { text: string; url: string }[];
}

export interface ScreenerSnapshot {
  schema: 1;
  symbol: string;
  source: Source;
  basis: Basis | null;
  companyName: string | null;
  companyId: string | null;
  topRatios: { name: string; text: string; value: number | null }[];
  tables: Partial<Record<StatementTable["section"], StatementTable>>;
  documents: DocLink[];
}

export interface PriceBar {
  /** Exchange-local trading date (YYYY-MM-DD). */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface PriceSnapshot {
  schema: 1;
  symbol: string;
  yahooSymbol: string;
  source: Source;
  currency: string | null;
  exchangeTimezone: string | null;
  range: string;
  interval: string;
  /** True when the newest bar was fetched while the session was still open. */
  lastBarPartial: boolean;
  regularMarketTime: string | null;
  bars: PriceBar[];
}

export interface Classification {
  category: Category;
  /** Every category the filing matched, primary first. */
  categories: Category[];
  /** Which rule decided the category, for audit. */
  rule: string;
  confidence: "high" | "medium" | "low";
  /** What decided the category: the matched phrase and where it came from. Null when nothing matched. */
  evidence: { source: "label" | "subject" | "text" | "pdf"; phrase: string } | null;
  /** True only when a rule positively identifies paperwork that doesn't move a stock. */
  routine: boolean;
  /** Which routine rule matched, e.g. "routine:trading-window". */
  routineRule?: string;
  /** True when no rule recognised the filing; it must not be treated as routine. */
  needsReview: boolean;
}

/** Text read from page 1 of the filing's PDF attachment. Used only to classify; the PDF itself is not committed. */
export interface AttachmentExcerpt {
  status: "ok" | "failed";
  /** Normalised page-1 text, capped at 1,500 characters. Empty when status is "failed". */
  text: string;
  page: 1;
  url: string;
  extractedAt: string;
  /** Why extraction failed. A failure never changes a filing's classification. */
  reason?: string;
}

export interface Announcement {
  id: string;
  symbol: string;
  company: string | null;
  isin: string | null;
  /** NSE's own category label, verbatim. */
  nseDesc: string;
  /** NSE's own subject text, verbatim. */
  text: string;
  /** The event subject NSE embeds in the text, e.g. "Store Opening". Null when the text names none. */
  subject: string | null;
  /** Page-1 text of the attachment, present only for filings that needed it to be classified. */
  attachmentExcerpt: AttachmentExcerpt | null;
  attachmentUrl: string | null;
  attachmentSize: string | null;
  /** When NSE says it was announced (ISO, UTC). Source time is IST. */
  announcedAt: string;
  /** The source's timestamp string, verbatim. */
  announcedAtRaw: string;
  hasXbrl: boolean;
  classification: Classification;
}

export interface AnnouncementSnapshot {
  schema: 1;
  symbol: string;
  source: Source;
  window: { from: string; to: string };
  count: number;
  items: Announcement[];
  /** Present after `npm run enrich`. */
  enrichment?: { at: string; attempted: number; ok: number; failed: number };
}

export interface ManifestEntry {
  status: Status;
  fetchedAt: string;
  asOf: string | null;
  file: string | null;
  reason?: string;
}

export interface Manifest {
  schema: 1;
  ingestedAt: string;
  symbols: Record<string, { prices?: ManifestEntry; announcements?: ManifestEntry; fundamentals?: ManifestEntry }>;
}

export interface UniverseEntry {
  symbol: string;
  name: string;
  /** Hand-entered, not sourced from a feed. */
  sector: string;
  group: "portfolio" | "research";
  /** Illustrative demo weight (percent), hand-entered. There is no real portfolio behind it. */
  weight?: number;
  screenerSlug: string;
  yahooSymbol: string;
}

/**
 * Figures read from an original results filing (as opposed to screener.in's standardised tables).
 * Arrays are ordered [current quarter, previous quarter, same quarter a year earlier].
 * Only present for companies where the filing has been transcribed and verified.
 */
export interface FilingFacts {
  schema: 1;
  symbol: string;
  basis: Basis;
  unit: "INR_crore";
  periods: { label: string; end: string }[];
  source: { name: string; url: string; altUrl?: string; method: "manual_transcription"; verification: string; verifiedOn: string };
  revenueFromOperations: number[];
  exciseDuty: number[];
  pbt: number[];
  patInclNci: number[];
  patOwners: number[];
  patNci: number[];
}
