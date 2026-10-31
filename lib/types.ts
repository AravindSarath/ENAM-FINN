export type Category =
  | "results"
  | "M&A"
  | "fund_raise"
  | "management_change"
  | "litigation"
  | "insider_trading"
  | "earnings_call"
  | "investor_meetings"
  | "credit_rating"
  | "dividend"
  | "bonus_split"
  | "capex"
  | "press_release"
  | "postal_ballot"
  | "agm_egm"
  | "pledging"
  | "unclassified";

export type Tier = "act" | "note" | "routine";

/** A pointer to what supports a statement: where it came from and the exact text or figure. */
export interface EvidenceRef {
  kind: "nse_label" | "filing_text" | "pdf_excerpt" | "screener" | "yahoo" | "rule";
  text: string;
  url?: string;
}

/** One line of a materiality score: what it adds or removes, and why. */
export interface Reason {
  label: string;
  points: number;
  evidence: EvidenceRef;
}

export interface ResultsRow {
  label: string;
  /** Short definition shown under the label, so no figure's meaning is ambiguous. */
  defn?: string;
  cur: number | null;
  prevQ: number | null;
  yearAgo: number | null;
  /** Why the figure is unavailable, when it is. */
  reason?: string;
}

export interface ResultsCard {
  /** e.g. "Q2 FY27 · Sep 2026" */
  periodLabel: string;
  basis: "consolidated" | "standalone" | null;
  /** Primary metrics, defined consistently across the three columns. */
  rows: ResultsRow[];
  /** Separately preserved alternative definitions (owners' profit, revenue net of excise). */
  extras: ResultsRow[];
  /** Operating margin on screener's revenue, so numerator and denominator share one definition. */
  margin: { cur: number; prevQ: number | null } | null;
  /** Last eight quarters of screener revenue and net profit, for a trend line. */
  trend: { label: string; periods: string[]; values: (number | null)[] }[];
  notes: string[];
  sourceUrls: string[];
  /** Set when a results filing exists but the numbers are not yet available. */
  pending?: string;
}

export interface FeedItem {
  id: string;
  sym: string;
  cat: Category;
  /** Overrides the category pill text, e.g. "Market move". */
  label?: string;
  title: string;
  hoursAgo: number;
  tier: Tier;
  /** One-line summary of the top reasons, e.g. "Management change +60, senior role +10". */
  why: string;
  /** Materiality score, 0–100. Deterministic; see docs/PUSH_INTELLIGENCE.md. */
  score: number;
  /** Itemised score. Points sum to `score` (after floors and ceilings, which appear as their own lines). */
  reasons: Reason[];
  /** What supports the classification and the numbers on this card. */
  evidence: EvidenceRef[];
  /** When the primary filing was announced (ISO, UTC). Absent for sample items. */
  at?: string;
  /** Detail line: computed facts for results/moves, the filing's own text otherwise. May be empty. */
  soWhat: string;
  kind: "results" | "mgmt" | "move" | "generic";
  /** Real filing link when the item is built from a real filing. */
  url?: string;
  /** e.g. "NSE · 30 Oct 2026, 7:40 pm IST". Present for real items. */
  sourceLabel?: string;
  /** True when the content is illustrative rather than from a real filing. */
  sample: boolean;
  /** Other filings folded into this card (e.g. the press release and deck behind a results card). */
  related?: { title: string; url: string | null; hoursAgo: number; reason: string }[];
  results?: ResultsCard;
  mgmt?: {
    role: string;
    outgoing: string;
    incoming: string;
    bio: string[];
  };
  move?: { volX: number | null; dayPct: number; series: number[]; asOfLabel: string };
}

export interface Holding {
  sym: string;
  name: string;
  /** Hand-entered. */
  sector: string;
  /** Illustrative demo weight (percent). There is no real portfolio behind it. */
  weight: number;
  /** Null means unavailable; the UI shows "n/a" and never substitutes a value. */
  price: number | null;
  dayPct: number | null;
  volX: number | null;
  /** Date of the latest session in the price snapshot (YYYY-MM-DD). */
  priceAsOf: string | null;
  /** Hours between the latest session's close (15:30 IST) and the demo clock. */
  closeHoursAgo: number | null;
  series: number[];
  reason?: string;
}

export interface Rules {
  volX: number;
  movePct: number;
  cats: Partial<Record<Category, boolean>>;
}

export interface Hit {
  id: string;
  sym: string;
  kind: "volume" | "move" | "filing" | "simulated";
  text: string;
  hoursAgo: number;
  /** Shown instead of "Xh ago" for end-of-day price hits, e.g. "30 Oct close". */
  whenLabel?: string;
  itemId?: string;
}
