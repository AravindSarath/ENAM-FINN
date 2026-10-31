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

export interface ResultsRow {
  label: string;
  cur: number;
  prevQ: number;
  yearAgo: number;
}

export interface FeedItem {
  id: string;
  sym: string;
  cat: Category;
  title: string;
  hoursAgo: number;
  tier: Tier;
  /** Why it ranks where it does: the explainable part of the score. */
  why: string;
  /** The one-line "so what". */
  soWhat: string;
  kind: "results" | "mgmt" | "move" | "generic";
  /** Real filing link when the item is built from a real filing. */
  url?: string;
  /** True when the content is illustrative rather than from a real filing. */
  sample: boolean;
  results?: { period: string; basis: string; rows: ResultsRow[] };
  mgmt?: {
    role: string;
    outgoing: string;
    incoming: string;
    bio: string[];
  };
  move?: { volX: number; dayPct: number; series: number[] };
}

export interface Holding {
  sym: string;
  name: string;
  sector: string;
  weight: number;
  price: number;
  dayPct: number;
  volX: number;
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
  itemId?: string;
}
