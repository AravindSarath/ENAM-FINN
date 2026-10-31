import { validateSnapshots } from "../lib/data/validate";

const r = validateSnapshots();
console.log("symbol".padEnd(11), "grp".padEnd(9), "prices".padEnd(8), "bars", "asOf".padEnd(11), "ann".padEnd(8), "n".padEnd(3), "fund".padEnd(8), "basis".padEnd(13), "latest Q".padEnd(11), "layout".padEnd(17), "facts");
for (const c of r.coverage) {
  console.log(
    c.symbol.padEnd(11),
    c.group.padEnd(9),
    c.prices.padEnd(8),
    String(c.priceBars).padEnd(4),
    (c.priceAsOf ?? "-").padEnd(11),
    c.announcements.padEnd(8),
    String(c.announcementCount).padEnd(3),
    c.fundamentals.padEnd(8),
    (c.basis ?? "-").padEnd(13),
    (c.latestQuarter ?? "-").padEnd(11),
    c.layout.padEnd(17),
    c.filingFacts ? "yes" : "-",
    c.notes.length ? `· ${c.notes.join("; ")}` : "",
  );
}
r.warnings.forEach((w) => console.warn("WARN ", w));
r.errors.forEach((e) => console.error("ERROR", e));
console.log(`\n${r.errors.length} error(s), ${r.warnings.length} warning(s)`);
process.exit(r.errors.length ? 1 : 0);
