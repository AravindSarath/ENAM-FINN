/** Server-side readers for the committed snapshots in data/. Missing files return null, never throw. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AnnouncementSnapshot, FilingFacts, Manifest, PriceSnapshot, ScreenerSnapshot, UniverseEntry } from "./types";

const DATA = path.join(process.cwd(), "data");

function read<T>(rel: string): T | null {
  const file = path.join(DATA, rel);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export const loadUniverse = () => read<UniverseEntry[]>("universe.json") ?? [];
export const loadManifest = () => read<Manifest>("manifest.json");
export const loadPrices = (sym: string) => read<PriceSnapshot>(`prices/${sym}.json`);
export const loadAnnouncements = (sym: string) => read<AnnouncementSnapshot>(`announcements/${sym}.json`);
export const loadFundamentals = (sym: string) => read<ScreenerSnapshot>(`fundamentals/${sym}.json`);
export const loadFilingFacts = (sym: string) => read<FilingFacts>(`filings/${sym}.json`);
