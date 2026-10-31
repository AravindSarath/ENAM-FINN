"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { BriefData } from "@/lib/data/view";
import { CATEGORY_LABEL, ago, pct, price, tone } from "@/lib/format";
import type { FeedItem, Holding } from "@/lib/types";
import { Chip, DataNotice, PageHeader, Pill, Sparkline } from "./ui";

type Sort = "attention" | "move" | "weight";

function heat(d: number | null) {
  if (d == null) return "rgba(120,125,135,0.12)";
  const a = Math.min(Math.abs(d) / 5, 1);
  return d >= 0 ? `rgba(95,211,154,${0.12 + a * 0.55})` : `rgba(255,114,114,${0.12 + a * 0.55})`;
}

const NA = <span className="text-dim">n/a</span>;

export default function Portfolio({ data }: { data: BriefData }) {
  const { holdings, feed } = data;
  const [sort, setSort] = useState<Sort>("attention");
  const [open, setOpen] = useState<Holding | null>(null);

  const attention = (h: Holding) => {
    const pending = feed.filter((f) => f.sym === h.sym && f.tier === "act" && !f.sample).length;
    return Math.abs(h.dayPct ?? 0) + ((h.volX ?? 1) - 1) * 1.5 + pending * 2;
  };

  const rows = useMemo(() => {
    const r = [...holdings];
    if (sort === "attention") r.sort((a, b) => attention(b) - attention(a));
    if (sort === "move") r.sort((a, b) => Math.abs(b.dayPct ?? 0) - Math.abs(a.dayPct ?? 0));
    if (sort === "weight") r.sort((a, b) => b.weight - a.weight);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, holdings, feed]);

  const covered = holdings.filter((h) => h.dayPct != null);
  const net = covered.reduce((s, h) => s + ((h.dayPct as number) * h.weight) / 100, 0);
  const asOf = holdings.map((h) => h.priceAsOf).filter(Boolean).sort().pop();

  return (
    <>
      <PageHeader
        eyebrow={`${holdings.length} holdings · end of day${asOf ? ` · ${asOf}` : ""}`}
        title="Portfolio"
        right={
          <div className="num pb-1 text-right">
            <p className={`text-[22px] font-medium leading-none ${tone(net)}`}>{pct(net, 2)}</p>
            <p className="mt-1 text-[11px] text-mute">weighted day</p>
          </div>
        }
      />
      <DataNotice label="Real prices">
        End-of-day prices and volume come from Yahoo Finance ({asOf ?? "n/a"} close). The weights are
        illustrative, since there is no real portfolio behind them. &quot;n/a&quot; means the data was
        unavailable, not zero.
      </DataNotice>

      <div className="mx-4 grid grid-cols-6 gap-1" aria-label="Day move heat map">
        {[...holdings].sort((a, b) => b.weight - a.weight).map((h) => (
          <button
            key={h.sym}
            onClick={() => setOpen(h)}
            style={{ background: heat(h.dayPct) }}
            className="num aspect-square rounded-md p-1 text-left"
            title={`${h.sym} ${h.dayPct != null ? pct(h.dayPct) : "n/a"}`}
          >
            <span className="block truncate font-mono text-[8.5px] font-semibold">{h.sym}</span>
            <span className="block text-[9.5px]">{h.dayPct != null ? pct(h.dayPct, 1).replace("%", "") : "n/a"}</span>
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
          const unusual = h.volX != null && h.volX >= 2;
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
                    {h.volX != null ? `${h.volX.toFixed(1)}×` : NA}
                  </span>
                </span>
                <span className="num w-[84px] text-right">
                  <span className="block text-[14px]">{h.price != null ? price(h.price) : NA}</span>
                  <span className={`block text-[12.5px] ${h.dayPct != null ? tone(h.dayPct) : ""}`}>
                    {h.dayPct != null ? pct(h.dayPct) : NA}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <StockSheet holding={open} feed={feed} onClose={() => setOpen(null)} />
    </>
  );
}

function StockSheet({ holding, feed, onClose }: { holding: Holding | null; feed: FeedItem[]; onClose: () => void }) {
  const filings = holding ? feed.filter((f) => f.sym === holding.sym && !f.sample && f.kind !== "move") : [];
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
                  {holding.sector} · {holding.weight.toFixed(1)}% (illustrative weight)
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-full border border-line px-3 py-1.5 text-[12px] text-mute">
                Close
              </button>
            </div>

            {holding.price != null && holding.dayPct != null ? (
              <div className="num mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[30px] font-medium leading-none">₹{price(holding.price)}</p>
                  <p className={`mt-1 text-[13px] ${tone(holding.dayPct)}`}>
                    {pct(holding.dayPct, 2)} on the day
                    {holding.volX != null ? ` · volume ${holding.volX.toFixed(1)}× average` : " · volume multiple n/a"}
                  </p>
                </div>
                <div className="text-right">
                  {holding.series.length > 1 && <Sparkline data={holding.series} width={120} height={44} />}
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-dim">
                    Yahoo · last {holding.series.length} sessions · {holding.priceAsOf}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-4 text-[13px] text-mute">
                Price data unavailable{holding.reason ? `: ${holding.reason}` : ""}.
              </p>
            )}

            <h3 className="eyebrow mb-2 mt-6">NSE filings · last 30 days</h3>
            {filings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[13px] text-mute">No filings in the last 30 days.</p>
            ) : (
              <ul className="divide-y divide-line/70 rounded-xl border border-line">
                {filings.map((f) => (
                  <li key={f.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Pill tone={f.tier === "act" ? "gold" : "mute"}>{f.label ?? CATEGORY_LABEL[f.cat]}</Pill>
                      <span className="num ml-auto text-[11px] text-dim">{ago(f.hoursAgo)}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug">{f.title}</p>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11.5px] text-mute hover:text-fg">
                        Filing ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Link href={`/research/${holding.sym}`} className="mt-6 block rounded-full bg-gold py-3 text-center text-[14px] font-medium text-ink">
              Research {holding.sym}
            </Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
