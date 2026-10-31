/**
 * Rule-based announcement classification (no LLM). NSE's own `desc` is coarse, so the subject text is
 * scanned for keywords too. A filing is `routine` only when a rule positively identifies paperwork;
 * anything no rule recognises is `unclassified` + `needsReview`, never silently treated as routine.
 */
import type { Category } from "../types";
import type { Classification } from "./types";

/** Priority when a filing matches several categories (earlier wins the primary slot). */
const PRIORITY: Category[] = [
  // Transcripts and recordings quote the results headline but are call material, not the results themselves.
  "earnings_call",
  "results",
  "M&A",
  "management_change",
  "fund_raise",
  "litigation",
  "pledging",
  "insider_trading",
  "dividend",
  "bonus_split",
  "capex",
  "credit_rating",
  "investor_meetings",
  "press_release",
  "postal_ballot",
  "agm_egm",
];

interface KeywordRule {
  id: string;
  cat: Category;
  re: RegExp;
  /** Match the subject text only. NSE's own label can contain the keyword ("Con. Call Updates") without the filing being about it. */
  textOnly?: boolean;
}

const KEYWORDS: KeywordRule[] = [
  { id: "kw:results", cat: "results", re: /financial results|unaudited.*results|audited.*results|results for the (quarter|half|year)|quarter(ly)? (and (half|nine|year)[- ]?\w* )?ended/i },
  { id: "kw:dividend", cat: "dividend", re: /\bdividend\b/i },
  { id: "kw:bonus-split", cat: "bonus_split", re: /\bbonus (issue|shares)\b|stock split|sub-?division of (equity )?shares/i },
  { id: "kw:fund-raise", cat: "fund_raise", re: /debentures?|\bNCDs?\b|rights issue|\bQIP\b|preferential (issue|allotment)|buy-?back|commercial paper|fund ?raising|raising of funds/i },
  { id: "kw:ipo", cat: "M&A", re: /initial public offer|red herring prospectus|\bIPO\b/i },
  { id: "kw:mna", cat: "M&A", re: /acquisition|acquire|merger|amalgamation|demerger|scheme of arrangement|joint venture|\bstrategic (partnership|alliance)\b/i },
  { id: "kw:subsidiary", cat: "M&A", re: /step-down subsidiary|wholly[- ]owned subsidiary|\bsubsidiary\b.*(incorporat|dissol|struck off|wound up|voluntar)/i },
  { id: "kw:mgmt", cat: "management_change", re: /resign|cessation|appointment of (a )?(director|chief|managing|whole[- ]time|ceo|cfo)|appointed as (a )?(director|chief|managing|whole[- ]time)|retire/i },
  { id: "kw:litigation", cat: "litigation", re: /\bpenalty\b|\bfine\b|show[- ]cause|insolvency|\bNCLT\b|court order|regulatory order|warning letter|orders? passed/i },
  { id: "kw:pledge", cat: "pledging", re: /\bpledge|encumbrance/i },
  { id: "kw:insider", cat: "insider_trading", re: /prohibition of insider trading|\bPIT\b regulations.*(disclosure|acquisition|disposal)|insider trading/i },
  { id: "kw:capex", cat: "capex", re: /capacity expansion|new (plant|facility|manufacturing)|capital expenditure|\bcapex\b/i },
  { id: "kw:rating", cat: "credit_rating", re: /credit rating|rating (agency|action)|reaffirm/i },
  { id: "kw:transcript", cat: "earnings_call", textOnly: true, re: /transcript|audio recording|earnings call|conference call|con\. call/i },
  { id: "kw:investor-meet", cat: "investor_meetings", re: /institutional investors?.? meeting|investor (conference|meet)|analyst(s)? (meet|day)|one[- ]on[- ]one/i },
  { id: "kw:postal-ballot", cat: "postal_ballot", re: /postal ballot/i },
  { id: "kw:agm", cat: "agm_egm", re: /annual general meeting|extra-?ordinary general meeting|\bAGM\b|\bEGM\b|voting results/i },
  { id: "kw:press", cat: "press_release", re: /media (statement|release)|press release|news item|clarification|rumou?r/i },
];

/** Positive identification of low-relevance paperwork. */
const ROUTINE: { id: string; re: RegExp; where: "desc" | "text" | "both" }[] = [
  { id: "routine:trading-window", re: /trading window/i, where: "both" },
  { id: "routine:newspaper", re: /newspaper (publication|clipping)/i, where: "both" },
  { id: "routine:aoa-moa", re: /amendment to aoa\/moa/i, where: "desc" },
  { id: "routine:esop", re: /\besops?\b|employee stock option|stock option scheme/i, where: "text" },
  { id: "routine:compliance", re: /compliance certificate|secretarial (audit|compliance)|certificate under (regulation|sebi)|reconciliation of share capital/i, where: "both" },
  { id: "routine:auditor", re: /appointment of (statutory |secretarial |internal )?auditors?|change in auditors/i, where: "both" },
  { id: "routine:esop-desc", re: /^(esop\/esos\/esps|options to purchase securities)$/i, where: "desc" },
  { id: "routine:monitoring-agency", re: /monitoring agency report/i, where: "desc" },
];

/**
 * NSE's own structured Regulation 30 labels are authoritative: when the label names the event, it decides the
 * category and keywords may only add secondary categories. Free-text labels ("Updates", "General Updates",
 * "Outcome of Board Meeting", "Press Release") are not listed here and fall through to keyword rules.
 */
const AUTHORITY: Record<string, { cat: Category; confidence: Classification["confidence"]; needsReview?: boolean }> = {
  acquisition: { cat: "M&A", confidence: "high" },
  "sale or disposal": { cat: "M&A", confidence: "high" },
  agreements: { cat: "M&A", confidence: "low", needsReview: true },
  "other restructuring": { cat: "M&A", confidence: "low", needsReview: true },
  "change in management": { cat: "management_change", confidence: "high" },
  "change in director(s)": { cat: "management_change", confidence: "high" },
  cessation: { cat: "management_change", confidence: "high" },
  appointment: { cat: "management_change", confidence: "high" },
  resignation: { cat: "management_change", confidence: "high" },
  retirement: { cat: "management_change", confidence: "high" },
  "resignation of director/kmp/smp": { cat: "management_change", confidence: "high" },
  "corporate insolvency resolution process": { cat: "litigation", confidence: "high" },
  "action(s) taken or orders passed": { cat: "litigation", confidence: "high" },
  "action(s) initiated or orders passed": { cat: "litigation", confidence: "high" },
  "credit rating": { cat: "credit_rating", confidence: "high" },
  dividend: { cat: "dividend", confidence: "high" },
  "bagging/receiving of orders/contracts": { cat: "press_release", confidence: "medium" },
  "rumour verification - regulation 30(11)": { cat: "press_release", confidence: "medium" },
  "news verification": { cat: "press_release", confidence: "medium" },
  "qualified institutional placement": { cat: "fund_raise", confidence: "high" },
  "preferential issue": { cat: "fund_raise", confidence: "high" },
  "issue of securities": { cat: "fund_raise", confidence: "high" },
  "giving guarantees/indemnity/ becoming a surety for third party": { cat: "unclassified", confidence: "low", needsReview: true },
};

/** Fallbacks when no keyword matched: NSE's own label, lower confidence. */
const DESC_FALLBACK: Record<string, { cat: Category; confidence: Classification["confidence"] }> = {
  "credit rating": { cat: "credit_rating", confidence: "high" },
  "investor presentation": { cat: "results", confidence: "low" },
  "shareholders meeting": { cat: "agm_egm", confidence: "medium" },
  "news verification": { cat: "press_release", confidence: "medium" },
  "action(s) taken or orders passed": { cat: "litigation", confidence: "medium" },
  "press release": { cat: "press_release", confidence: "medium" },
  "record date": { cat: "dividend", confidence: "low" },
  "other restructuring": { cat: "M&A", confidence: "low" },
  "analysts/institutional investor meet/con. call updates": { cat: "investor_meetings", confidence: "medium" },
};

export function classify(nseDesc: string, text: string): Classification {
  const desc = nseDesc.trim();
  const descKey = desc.toLowerCase();
  const hay = `${desc} ${text}`;

  const routineIds = ROUTINE.filter((r) => {
    const target = r.where === "desc" ? desc : r.where === "text" ? text : hay;
    return r.re.test(target);
  }).map((r) => r.id);
  const routine = routineIds.length > 0;
  const routineRule = routineIds[0];

  // Trading-window notices cite the insider-trading regulations but are not insider trades.
  const hits = KEYWORDS.filter(
    (k) => k.re.test(k.textOnly ? text : hay) && !(k.cat === "insider_trading" && routineIds.includes("routine:trading-window")),
  );
  const cats = [...new Set(hits.map((h) => h.cat))].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));

  const auth = AUTHORITY[descKey];
  if (auth) {
    const secondary = cats.filter((c) => c !== auth.cat);
    return {
      category: auth.cat,
      categories: [auth.cat, ...secondary],
      rule: `desc:${descKey}`,
      confidence: auth.confidence,
      routine,
      routineRule,
      needsReview: !!auth.needsReview,
    };
  }

  if (cats.length > 0) {
    const primary = cats[0];
    const rule = hits.find((h) => h.cat === primary)!.id;
    const fb = DESC_FALLBACK[descKey];
    // Agreement between NSE's label and our keywords raises confidence.
    const confidence: Classification["confidence"] = fb && cats.includes(fb.cat) ? "high" : "medium";
    return { category: primary, categories: cats, rule, confidence, routine, routineRule, needsReview: false };
  }

  const fb = DESC_FALLBACK[descKey];
  if (fb) {
    return { category: fb.cat, categories: [fb.cat], rule: `desc:${descKey}`, confidence: fb.confidence, routine, routineRule, needsReview: fb.confidence === "low" };
  }

  if (routine) {
    return { category: "unclassified", categories: ["unclassified"], rule: "routine-only", confidence: "medium", routine: true, routineRule, needsReview: false };
  }
  return { category: "unclassified", categories: ["unclassified"], rule: "none", confidence: "low", routine: false, needsReview: true };
}
