/**
 * Deterministic, explainable tiering. No model involved. Every decision carries a `why` string that the
 * UI shows on the card, so the ranking is never a black box.
 */
import { CATEGORY_LABEL } from "../format";
import type { Category, Tier } from "../types";
import type { Classification } from "./types";

interface Policy {
  tier: Tier;
  why: string;
}

const POLICY: Record<Category, Policy> = {
  results: { tier: "note", why: "Results-related filing" },
  "M&A": { tier: "act", why: "Acquisition, stake or restructuring can change the investment case" },
  management_change: { tier: "act", why: "Change at the top" },
  litigation: { tier: "act", why: "Regulatory or legal action" },
  pledging: { tier: "act", why: "Promoter pledge changes are a risk signal" },
  bonus_split: { tier: "act", why: "Corporate action that changes the share count" },
  fund_raise: { tier: "note", why: "Fund raise or debt programme" },
  credit_rating: { tier: "note", why: "Rating action, direction not read yet" },
  dividend: { tier: "note", why: "Cash payout with a record date" },
  capex: { tier: "note", why: "Capacity or capital spend" },
  insider_trading: { tier: "note", why: "Insider dealing disclosure" },
  press_release: { tier: "note", why: "Company news" },
  postal_ballot: { tier: "note", why: "Shareholder vote" },
  agm_egm: { tier: "note", why: "Shareholder meeting" },
  earnings_call: { tier: "routine", why: "Call material: context for the results, not news" },
  investor_meetings: { tier: "routine", why: "Investor meeting schedule: low relevance" },
  unclassified: { tier: "note", why: "No rule recognised this filing, so it stays visible" },
};

export interface TierInput {
  category: Category;
  classification: Classification;
  /** The filing's own subject text, used for narrow refinements such as scheduled director terms. */
  text?: string;
  /** Market reacted to this filing: unusual volume or a large move in the session after it. */
  reaction: string | null;
}

/** Matches a director's term simply ending, e.g. "completed his 2nd term as an Independent Director". */
const SCHEDULED_TERM = /completed (?:his|her|their|the) .{0,60}term|end of (?:his|her|their) term|term of (?:appointment )?(?:has )?(?:ended|expired|completed)/i;

export function tierFor(i: TierInput): { tier: Tier; why: string } {
  const c = i.classification;
  const label = CATEGORY_LABEL[i.category];

  if (c.routine) {
    return { tier: "routine", why: `Routine paperwork (${(c.routineRule ?? c.rule).replace(/^(routine|desc):/, "")})` };
  }

  const p = POLICY[i.category];
  let tier = p.tier;
  let why = `${label}: ${p.why}`;

  // A director completing a scheduled term is a management-change filing but rarely news.
  if (i.category === "management_change" && i.text && SCHEDULED_TERM.test(i.text)) {
    return { tier: "note", why: `${label}: director completing a scheduled term, a routine succession event` };
  }

  // A low-confidence category must not push an item to "act" on its own.
  if (tier === "act" && c.confidence === "low") {
    tier = "note";
    why += " (classified with low confidence, so shown as noted)";
  }
  if (tier === "note" && i.reaction) {
    tier = "act";
    why += `. Raised to Act: ${i.reaction}`;
  }
  if (c.needsReview && i.category !== "unclassified") why += ". Classification needs review";
  return { tier, why };
}

/** The session close (15:30 IST) of an ISO date, in epoch ms. */
export const sessionCloseMs = (date: string) => new Date(`${date}T15:30:00+05:30`).getTime();

/** True when a filing landed in the 36 hours before the latest session's close, so that session can reflect it. */
export function reactsTo(announcedAtIso: string, priceDate: string): boolean {
  const diffH = (sessionCloseMs(priceDate) - new Date(announcedAtIso).getTime()) / 3_600_000;
  return diffH >= 0 && diffH <= 36;
}
