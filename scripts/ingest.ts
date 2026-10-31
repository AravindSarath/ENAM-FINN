/**
 * Snapshot ingestion.
 *   npm run ingest -- --sym RELIANCE [--only prices|ann|fund] [--refresh]
 * Writes data/{prices,announcements,fundamentals}/<SYM>.json and updates data/manifest.json.
 * One failing source never aborts the others; failures are recorded in the manifest.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AnnouncementSnapshot, AttachmentExcerpt, Manifest, ManifestEntry, UniverseEntry } from "../lib/data/types";
import { fetchAnnouncements } from "../lib/sources/nse";
import { fetchPrices } from "../lib/sources/yahoo";
import { fetchScreener } from "../lib/sources/screener";

const DATA = path.join(process.cwd(), "data");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(rel: string, data: unknown) {
  const file = path.join(DATA, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 1) + "\n");
}

function entry(file: string, s: { source: { status: ManifestEntry["status"]; fetchedAt: string; asOf: string | null; reason?: string } }): ManifestEntry {
  return { status: s.source.status, fetchedAt: s.source.fetchedAt, asOf: s.source.asOf, file: s.source.status === "unavailable" ? null : file, reason: s.source.reason };
}

async function main() {
  const only = arg("only");
  const refresh = flag("refresh");
  const universe = (await readJson<UniverseEntry[]>(path.join(DATA, "universe.json"))) ?? [];
  const wanted = arg("sym")?.toUpperCase();
  const targets = wanted ? universe.filter((u) => u.symbol === wanted) : universe;
  if (targets.length === 0) throw new Error(`No matching symbol in data/universe.json${wanted ? `: ${wanted}` : ""}`);

  const manifest: Manifest = (await readJson<Manifest>(path.join(DATA, "manifest.json"))) ?? { schema: 1, ingestedAt: "", symbols: {} };

  for (const u of targets) {
    console.log(`\n== ${u.symbol} ==`);
    const m = (manifest.symbols[u.symbol] ??= {});

    if (!only || only === "prices") {
      try {
        const s = await fetchPrices(u.symbol, u.yahooSymbol, { refresh });
        await writeJson(`prices/${u.symbol}.json`, s);
        m.prices = entry(`prices/${u.symbol}.json`, s);
        console.log(`  prices: ${s.source.status} · ${s.bars.length} bars · latest ${s.source.asOf}${s.lastBarPartial ? " (PARTIAL: session open)" : ""}`);
      } catch (e) {
        m.prices = { status: "unavailable", fetchedAt: new Date().toISOString(), asOf: null, file: null, reason: String(e) };
        console.error(`  prices FAILED: ${e}`);
      }
    }

    if (!only || only === "ann") {
      try {
        // Carry over PDF excerpts from the previous snapshot so re-ingesting never loses enrichment.
        const prev = await readJson<AnnouncementSnapshot>(path.join(DATA, `announcements/${u.symbol}.json`));
        const prior = new Map<string, AttachmentExcerpt>(prev?.items.flatMap((i) => (i.attachmentExcerpt ? [[i.id, i.attachmentExcerpt] as const] : [])) ?? []);
        const s = await fetchAnnouncements(u.symbol, 30, { refresh, prior });
        if (prev?.enrichment) s.enrichment = prev.enrichment;
        await writeJson(`announcements/${u.symbol}.json`, s);
        m.announcements = entry(`announcements/${u.symbol}.json`, s);
        console.log(`  announcements: ${s.source.status} · ${s.count} items · newest ${s.source.asOf}`);
      } catch (e) {
        m.announcements = { status: "unavailable", fetchedAt: new Date().toISOString(), asOf: null, file: null, reason: String(e) };
        console.error(`  announcements FAILED: ${e}`);
      }
    }

    if (!only || only === "fund") {
      try {
        const s = await fetchScreener(u.symbol, u.screenerSlug, { refresh });
        await writeJson(`fundamentals/${u.symbol}.json`, s);
        m.fundamentals = entry(`fundamentals/${u.symbol}.json`, s);
        console.log(`  fundamentals: ${s.source.status} · basis ${s.basis} · latest quarter end ${s.source.asOf}${s.source.reason ? ` · ${s.source.reason}` : ""}`);
      } catch (e) {
        m.fundamentals = { status: "unavailable", fetchedAt: new Date().toISOString(), asOf: null, file: null, reason: String(e) };
        console.error(`  fundamentals FAILED: ${e}`);
      }
    }
  }

  manifest.ingestedAt = new Date().toISOString();
  await writeJson("manifest.json", manifest);
  console.log(`\nManifest updated at ${manifest.ingestedAt}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
