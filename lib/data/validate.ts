/** Integrity checks over the committed snapshots. Used by `npm run validate` and by the test suite. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { priceMetrics } from "./derive";
import type { AnnouncementSnapshot, FilingFacts, Manifest, PriceSnapshot, ScreenerSnapshot, UniverseEntry } from "./types";

export interface CoverageRow {
  symbol: string;
  group: string;
  prices: string;
  priceBars: number;
  priceAsOf: string | null;
  announcements: string;
  announcementCount: number;
  fundamentals: string;
  basis: string | null;
  latestQuarter: string | null;
  layout: "operating-profit" | "financing-profit" | "unknown";
  filingFacts: boolean;
  notes: string[];
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  coverage: CoverageRow[];
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export function validateSnapshots(dataDir = path.join(process.cwd(), "data")): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const coverage: CoverageRow[] = [];
  const err = (m: string) => errors.push(m);

  const universe = readJson<UniverseEntry[]>(path.join(dataDir, "universe.json"));
  const manifest = readJson<Manifest>(path.join(dataDir, "manifest.json"));
  if (!universe || universe.length === 0) err("universe.json missing or empty");
  if (!manifest) err("manifest.json missing");
  if (!universe || !manifest) return { errors, warnings, coverage };

  if (Number.isNaN(new Date(manifest.ingestedAt).getTime())) err("manifest.ingestedAt is not a valid date");

  for (const u of universe) {
    const s = u.symbol;
    const m = manifest.symbols[s];
    const notes: string[] = [];
    const row: CoverageRow = {
      symbol: s,
      group: u.group,
      prices: "missing",
      priceBars: 0,
      priceAsOf: null,
      announcements: "missing",
      announcementCount: 0,
      fundamentals: "missing",
      basis: null,
      latestQuarter: null,
      layout: "unknown",
      filingFacts: false,
      notes,
    };
    coverage.push(row);
    if (!m) {
      err(`${s}: no manifest entry`);
      continue;
    }

    // prices
    const pe = m.prices;
    if (!pe) err(`${s}: manifest has no prices entry`);
    else {
      row.prices = pe.status;
      if (pe.status !== "unavailable") {
        const snap = readJson<PriceSnapshot>(path.join(dataDir, pe.file ?? ""));
        if (!snap) err(`${s}: prices file missing or unreadable`);
        else {
          row.priceBars = snap.bars.length;
          row.priceAsOf = snap.source.asOf;
          const dates = snap.bars.map((b) => b.date);
          if ([...dates].sort().join() !== dates.join() || new Set(dates).size !== dates.length) err(`${s}: price bars not strictly ascending by date`);
          if (snap.bars.some((b) => !Number.isFinite(b.close) || b.close <= 0)) err(`${s}: non-positive or non-finite close`);
          if (dates.some((d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))) err(`${s}: bar dated on a weekend`);
          if (snap.source.asOf !== dates[dates.length - 1]) err(`${s}: source.asOf is not the last bar date`);
          if (snap.lastBarPartial) warnings.push(`${s}: latest price bar is partial (session was open)`);
          if (!priceMetrics(snap.bars)?.volumeMultiple) notes.push("volume multiple unavailable");
        }
      } else notes.push(`prices unavailable: ${pe.reason}`);
    }

    // announcements
    const ae = m.announcements;
    if (!ae) err(`${s}: manifest has no announcements entry`);
    else {
      row.announcements = ae.status;
      if (ae.status !== "unavailable") {
        const snap = readJson<AnnouncementSnapshot>(path.join(dataDir, ae.file ?? ""));
        if (!snap) err(`${s}: announcements file missing or unreadable`);
        else {
          row.announcementCount = snap.count;
          if (snap.count !== snap.items.length) err(`${s}: announcement count mismatch`);
          const ids = snap.items.map((i) => i.id);
          if (new Set(ids).size !== ids.length) err(`${s}: duplicate announcement ids`);
          const times = snap.items.map((i) => i.announcedAt);
          if (times.some((t) => Number.isNaN(new Date(t).getTime()))) err(`${s}: unparseable announcement time`);
          if ([...times].sort().reverse().join() !== times.join()) err(`${s}: announcements not newest-first`);
          if (snap.items.some((i) => i.attachmentUrl && !/^https:\/\//.test(i.attachmentUrl))) err(`${s}: non-https attachment URL`);
          if (snap.items.some((i) => !i.classification?.category)) err(`${s}: announcement without classification`);
          if (snap.items.some((i) => i.classification.routine && i.classification.needsReview)) err(`${s}: item both routine and needsReview`);
        }
      } else notes.push(`announcements unavailable: ${ae.reason}`);
    }

    // fundamentals
    const fe = m.fundamentals;
    if (!fe) err(`${s}: manifest has no fundamentals entry`);
    else {
      row.fundamentals = fe.status;
      if (fe.reason) notes.push(fe.reason);
      if (fe.status !== "unavailable") {
        const snap = readJson<ScreenerSnapshot>(path.join(dataDir, fe.file ?? ""));
        if (!snap) err(`${s}: fundamentals file missing or unreadable`);
        else {
          row.basis = snap.basis;
          const q = snap.tables.quarters;
          if (!q) err(`${s}: no quarterly table`);
          else {
            const ends = q.periods.map((p) => p.end ?? "");
            row.latestQuarter = ends[ends.length - 1] || null;
            if (q.periods.length < 5) err(`${s}: fewer than 5 quarters`);
            if ([...ends].sort().join() !== ends.join()) err(`${s}: quarter columns not ascending`);
            for (const r of q.rows) if (r.values.length !== q.periods.length) err(`${s}: row "${r.label}" length != periods`);
            const keys = new Set(q.rows.map((r) => r.key));
            if (!keys.has("revenue")) err(`${s}: no revenue row`);
            if (!keys.has("pat")) err(`${s}: no net profit row`);
            row.layout = keys.has("operating_profit") ? "operating-profit" : keys.has("financing_profit") ? "financing-profit" : "unknown";
            if (row.layout === "unknown") err(`${s}: neither operating nor financing profit row`);
          }
          if (!snap.basis) err(`${s}: basis not detected`);
          const labels = Object.values(snap.tables).flatMap((t) => t!.rows.map((r) => r.label));
          if (labels.some((l) => /ebitda/i.test(l.replace(/CFO\/EBITDA.*/i, "")))) err(`${s}: a row label claims EBITDA`);
        }
      } else notes.push(`fundamentals unavailable: ${fe.reason}`);
    }

    // verified filing facts
    const factsFile = path.join(dataDir, "filings", `${s}.json`);
    if (existsSync(factsFile)) {
      const f = readJson<FilingFacts>(factsFile);
      row.filingFacts = !!f;
      if (!f) err(`${s}: filing facts unreadable`);
      else {
        for (const k of ["revenueFromOperations", "exciseDuty", "pbt", "patInclNci", "patOwners", "patNci"] as const) {
          if (f[k].length !== f.periods.length) err(`${s}: filings.${k} length != periods`);
        }
        f.patInclNci.forEach((v, i) => {
          if (f.patOwners[i] + f.patNci[i] !== v) err(`${s}: owners + NCI != PAT incl. NCI for ${f.periods[i].label}`);
        });
      }
    }
  }
  return { errors, warnings, coverage };
}
