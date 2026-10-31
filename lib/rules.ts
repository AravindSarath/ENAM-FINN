import { useMemo, useSyncExternalStore } from "react";
import { CATEGORY_LABEL, pct } from "./format";
import type { FeedItem, Hit, Holding, Rules } from "./types";

export const DEFAULT_RULES: Rules = {
  volX: 2,
  movePct: 4,
  cats: {
    results: true,
    management_change: true,
    fund_raise: true,
    litigation: true,
    pledging: true,
    "M&A": true,
  },
};

/** Categories the user can toggle in the alert builder. */
export const WATCHABLE = [
  "results",
  "M&A",
  "management_change",
  "fund_raise",
  "litigation",
  "pledging",
  "insider_trading",
  "credit_rating",
  "dividend",
  "capex",
] as const;

/** Pure: which alerts fire for these rules over this data. */
export function evaluate(rules: Rules, holdings: Holding[], feed: FeedItem[], windowHours = 24): Hit[] {
  const hits: Hit[] = [];
  for (const h of holdings) {
    if (h.volX >= rules.volX)
      hits.push({ id: `v-${h.sym}`, sym: h.sym, kind: "volume", text: `Volume ${h.volX.toFixed(1)}× the 20-day average`, hoursAgo: 1 });
    if (Math.abs(h.dayPct) >= rules.movePct)
      hits.push({ id: `m-${h.sym}`, sym: h.sym, kind: "move", text: `Price ${pct(h.dayPct)} today`, hoursAgo: 1 });
  }
  for (const f of feed) {
    if (f.hoursAgo <= windowHours && rules.cats[f.cat])
      hits.push({ id: `f-${f.id}`, sym: f.sym, kind: "filing", text: `${CATEGORY_LABEL[f.cat]}: ${f.title}`, hoursAgo: f.hoursAgo, itemId: f.id });
  }
  return hits.sort((a, b) => a.hoursAgo - b.hoursAgo);
}

const KEY = "finn.rules.v1";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Rules persist in localStorage; SSR and first paint use the defaults. */
export function useRules() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const rules = useMemo<Rules>(() => {
    try {
      return raw ? { ...DEFAULT_RULES, ...JSON.parse(raw) } : DEFAULT_RULES;
    } catch {
      return DEFAULT_RULES;
    }
  }, [raw]);
  const set = (next: Rules) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: rules just don't persist */
    }
    listeners.forEach((l) => l());
  };
  return [rules, set] as const;
}
