/** Server-side reader for committed research dossiers. Returns null when a company has none. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Dossier } from "./dossier";

/** What the browser needs: everything except the audit list of dropped statements. */
export type ClientDossier = Omit<Dossier, "dropped">;

export function loadDossier(sym: string): Dossier | null {
  if (!/^[A-Z0-9&-]{1,20}$/.test(sym)) return null;
  const file = path.join(process.cwd(), "data", "research", sym, "dossier.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Dossier;
  } catch {
    return null;
  }
}

export function toClient(d: Dossier): ClientDossier {
  const { dropped, ...rest } = d;
  void dropped;
  return rest;
}
