/**
 * Reads page 1 of the PDF attachment for filings that cannot be classified from NSE's label and text alone,
 * then re-classifies them. Prioritised (unclassified first), small concurrency, retry/backoff via the http client.
 *   npm run enrich [-- --limit 80]
 * PDFs stay in data/raw/ (gitignored). Snapshots keep only a short excerpt, its URL and provenance.
 * A failed read is recorded and changes nothing: it never makes a filing routine.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { classify } from "../lib/data/classify";
import { pdfPriority } from "../lib/data/enrich";
import type { Announcement, AnnouncementSnapshot, UniverseEntry } from "../lib/data/types";
import { fetchExcerpt } from "../lib/sources/pdf";

const DATA = path.join(process.cwd(), "data");
const CONCURRENCY = 2;

const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 80;

async function main() {
  const universe = JSON.parse(await readFile(path.join(DATA, "universe.json"), "utf8")) as UniverseEntry[];
  const snaps = new Map<string, AnnouncementSnapshot>();
  for (const u of universe) {
    try {
      snaps.set(u.symbol, JSON.parse(await readFile(path.join(DATA, `announcements/${u.symbol}.json`), "utf8")));
    } catch {
      /* no snapshot for this symbol */
    }
  }

  const queue = [...snaps.values()]
    .flatMap((s) => s.items.map((a) => ({ a, p: pdfPriority(a) })))
    .filter((x) => x.p > 0)
    .sort((x, y) => x.p - y.p || y.a.announcedAt.localeCompare(x.a.announcedAt))
    .slice(0, LIMIT);

  console.log(`${queue.length} filings queued (priority 1: ${queue.filter((q) => q.p === 1).length}, 2: ${queue.filter((q) => q.p === 2).length}, 3: ${queue.filter((q) => q.p === 3).length})`);

  let ok = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < queue.length) {
      const { a } = queue[i++];
      const ex = await fetchExcerpt(a.attachmentUrl!);
      a.attachmentExcerpt = ex;
      if (ex.status === "ok") ok++;
      else failed++;
      console.log(`  ${a.symbol.padEnd(10)} ${a.nseDesc.slice(0, 30).padEnd(30)} ${ex.status}${ex.reason ? ` (${ex.reason})` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Re-classify every filing with whatever excerpt it now has, then write back.
  const at = new Date().toISOString();
  for (const s of snaps.values()) {
    const attempted = s.items.filter((a: Announcement) => queue.some((q) => q.a.id === a.id && q.a.symbol === a.symbol)).length;
    for (const a of s.items) {
      a.classification = classify(a.nseDesc, a.text, { subject: a.subject, excerpt: a.attachmentExcerpt?.status === "ok" ? a.attachmentExcerpt.text : null });
    }
    s.enrichment = {
      at,
      attempted: (s.enrichment?.attempted ?? 0) + attempted,
      ok: s.items.filter((a) => a.attachmentExcerpt?.status === "ok").length,
      failed: s.items.filter((a) => a.attachmentExcerpt?.status === "failed").length,
    };
    await writeFile(path.join(DATA, `announcements/${s.symbol}.json`), JSON.stringify(s, null, 1) + "\n");
  }
  console.log(`\nDone: ${ok} excerpts read, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
