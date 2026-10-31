"use client";

import { useMemo, useSyncExternalStore } from "react";

/** What the user has dealt with, kept on this device. Cards marked Done stay Done across reloads. */
export interface Triage {
  done: string[];
  /** "SYM:category" keys the user muted. */
  muted: string[];
  /** Ids of cards the user has marked as seen ("caught up"). */
  seen: string[];
}

const EMPTY: Triage = { done: [], muted: [], seen: [] };
const KEY = "finn.triage.v1";
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

export function parseTriage(raw: string): Triage {
  try {
    const j = raw ? JSON.parse(raw) : null;
    return { done: Array.isArray(j?.done) ? j.done : [], muted: Array.isArray(j?.muted) ? j.muted : [], seen: Array.isArray(j?.seen) ? j.seen : [] };
  } catch {
    return EMPTY;
  }
}

export function useTriage() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const t = useMemo(() => parseTriage(raw), [raw]);

  const write = (next: Triage) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: choices just don't persist */
    }
    listeners.forEach((l) => l());
  };
  const add = (list: string[], v: string[]) => [...new Set([...list, ...v])];

  return {
    ...t,
    markDone: (id: string) => write({ ...t, done: add(t.done, [id]) }),
    mute: (key: string) => write({ ...t, muted: add(t.muted, [key]) }),
    unmute: (key: string) => write({ ...t, muted: t.muted.filter((m) => m !== key) }),
    markSeen: (ids: string[]) => write({ ...t, seen: add(t.seen, ids) }),
    reset: () => write(EMPTY),
  };
}
