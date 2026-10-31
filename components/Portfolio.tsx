"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, ago, pct, price, sampleSeries, tone } from "@/lib/format";
import { FEED, HOLDINGS } from "@/lib/mock";
import type { Holding } from "@/lib/types";
import { Chip, DataNotice, PageHeader, Pill, SampleTag, Sparkline } from "./ui";

type Sort = "attention" | "move" | "weight";

function attention(h: Holding) {
  const pending = FEED.filter((f) => f.sym === h.sym && f.tier === "act").length;
  return Math.abs(h.dayPct) + (h.volX - 1) * 1.5 + pending * 2;
}

function heat(d: number) {
  const a = Math.min(Math.abs(d) / 5, 1);
  return d >= 0 ? `rgba(95,211,154,${0.12 + a * 0.55})` : `rgba(255,114,114,${0.12 + a * 0.55})`;
}

export default function Portfolio() {
  const [sort, setSort] = useState<Sort>("attention");
  const [open, setOpen] = useState<Holding | null>(null);

  const rows = useMemo(() => {
    const r = [...HOLDINGS];
    if (sort === "attention") r.sort((a, b) => attention(b) - attention(a));
    if (sort === "move") r.sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct));
    if (sort === "weight") r.sort((a, b) => b.weight - a.weight);
    return r;
  }, [sort]);

  const net = HOLDINGS.reduce((s, h) => s + (h.dayPct * h.weight) / 100, 0);

  return (
    <>
      <PageHeader
        eyebrow="18 holdings · end of day"
        title="Portfolio"
        right={
          <div className="num pb-1 text-right">
            <p className={`text-[22px] font-medium leading-none ${tone(net)}`}>{pct(net, 2)}</p>
            <p className="mt-1 text-[11px] text-mute">weighted day</p>
          </div>
        }
      />
      <DataNotice>Prices, moves and weights are sample values. Live end-of-day data arrives with ingestion.</DataNotice>

      <div className="mx-4 grid grid-cols-6 gap-1" aria-label="Day move heat map">
        {[...HOLDINGS].sort((a, b) => b.weight - a.weight).map((h) => (
          <button
            key={h.sym}
            onClick={() => setOpen(h)}
            style={{ background: heat(h.dayPct) }}
            className="num aspect-square rounded-md p-1 text-left"
            title={`${h.sym} ${pct(h.dayPct)}`}
          >
            <span className="block truncate font-mono text-[8.5px] font-semibold">{h.sym}</span>
            <span className="block text-[9.5px]">{pct(h.dayPct, 1).replace("%", "")}</span>
          </button>
        ))}
      </div>

      <div className="scroll-x mt-5 flex items-center gap-2 px-4">
        <span className="eyebrow mr-1 shrink-0">Sort</span>
        <Chip active={sort === "attention"} onClick={() => setSort("attention")}>
          Needs attention
        </Chip>
        <Chip active={sort === "move"} onClick={() => setSort("move")}>
          Day move
        </Chip>
        <Chip active={sort === "weight"} onClick={() => setSort("weight")}>
          Weight
        </Chip>
      </div>

      <ul className="mx-4 mt-3 overflow-hidden rounded-2xl border border-line bg-s1">
        {rows.map((h) => {
          const unusual = h.volX >= 2;
          return (
            <li key={h.sym} className="border-b border-line/70 last:border-0">
              <button onClick={() => setOpen(h)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[13px] font-semibold">{h.sym}</span>
                  <span className="block truncate text-[12px] text-mute">
                    {h.sector} · {h.weight.toFixed(1)}%
                  </span>
                </span>
                <span className="flex w-16 flex-col items-end gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-dim">vol</span>
                  <span className={`num text-[12.5px] ${unusual ? "font-medium text-gold" : "text-mute"}`}>
                    {h.volX.toFixed(1)}×
                  </span>
                </span>
                <span className="num w-[84px] text-right">
                  <span className="block text-[14px]">{price(h.price)}</span>
                  <span className={`block text-[12.5px] ${tone(h.dayPct)}`}>{pct(h.dayPct)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <StockSheet holding={open} onClose={() => setOpen(null)} />
    </>
  );
}

function StockSheet({ holding, onClose }: { holding: Holding | null; onClose: () => void }) {
  const filings = holding ? FEED.filter((f) => f.sym === holding.sym) : [];
  return (
    <AnimatePresence>
      {holding && (
        <>
          <motion.div
            key="bd"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-label={`${holding.sym} details`}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[82dvh] max-w-[430px] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-s1 px-5 pb-8 pt-3"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[13px] font-semibold">{holding.sym}</p>
                <h2 className="font-serif text-[28px] leading-tight">{holding.name}</h2>
                <p className="text-[12px] text-mute">
                  {holding.sector} · {holding.weight.toFixed(1)}% of portfolio
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-full border border-line px-3 py-1.5 text-[12px] text-mute">
                Close
              </button>
            </div>

            <div className="num mt-4 flex items-end justify-between">
              <div>
                <p className="text-[30px] font-medium leading-none">₹{price(holding.price)}</p>
                <p className={`mt-1 text-[13px] ${tone(holding.dayPct)}`}>
                  {pct(holding.dayPct, 2)} today · volume {holding.volX.toFixed(1)}× average
                </p>
              </div>
              <div className="text-right">
                <Sparkline data={sampleSeries(holding.sym, holding.price)} width={120} height={44} />
                <div className="mt-1">
                  <SampleTag label="Sample 30d" />
                </div>
              </div>
            </div>

            <h3 className="eyebrow mb-2 mt-6">Recent filings</h3>
            {filings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[13px] text-mute">
                No filings in the sample feed for this stock.
              </p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-xl border border-line">
                {filings.map((f) => (
                  <li key={f.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Pill tone={f.tier === "act" ? "gold" : "mute"}>{CATEGORY_LABEL[f.cat]}</Pill>
                      <span className="num ml-auto text-[11px] text-dim">{ago(f.hoursAgo)}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug">{f.title}</p>
                  </li>
                ))}
              </ul>
            )}

            <Link
              href={`/research/${holding.sym}`}
              className="mt-6 block rounded-full bg-gold py-3 text-center text-[14px] font-medium text-ink"
            >
              Research {holding.sym}
            </Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
