"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY_LABEL, ago, change, inr, pct, tone } from "@/lib/format";
import type { FeedItem } from "@/lib/types";
import { Pill, SampleTag, Sparkline } from "./ui";

export function digHref(item: FeedItem) {
  return `/research/${item.sym}?from=${encodeURIComponent(item.title)}`;
}

function ResultsBody({ item }: { item: FeedItem }) {
  const r = item.results!;
  const rev = r.rows[0];
  const ebitda = r.rows[1];
  const m = (ebitda.cur / rev.cur) * 100;
  const mQ = (ebitda.prevQ / rev.prevQ) * 100;
  return (
    <div className="mt-3 rounded-xl border border-line bg-s2 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">
          {r.period} · {r.basis} · ₹ crore
        </span>
      </div>
      <table className="num w-full text-[13px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-dim">
            <th className="pb-1.5 text-left font-normal" />
            <th className="pb-1.5 text-right font-normal">Now</th>
            <th className="pb-1.5 text-right font-normal">QoQ</th>
            <th className="pb-1.5 text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => {
            const q = change(row.cur, row.prevQ);
            const y = change(row.cur, row.yearAgo);
            return (
              <tr key={row.label} className="border-t border-line/70">
                <td className="py-2 text-mute">{row.label}</td>
                <td className="py-2 text-right font-medium">{inr(row.cur)}</td>
                <td className={`py-2 text-right ${tone(q)}`}>{pct(q)}</td>
                <td className={`py-2 text-right ${tone(y)}`}>{pct(y)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="num mt-2 text-[11.5px] text-mute">
        EBITDA margin <span className="text-fg">{m.toFixed(1)}%</span>{" "}
        <span className={tone(m - mQ)}>({m - mQ > 0 ? "+" : ""}{(m - mQ).toFixed(1)} pp QoQ)</span>
        <span className="text-dim"> · *Operating profit, excludes other income</span>
      </p>
    </div>
  );
}

function MgmtBody({ item }: { item: FeedItem }) {
  const m = item.mgmt!;
  return (
    <div className="mt-3 rounded-xl border border-line bg-s2 p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <p className="eyebrow">Out</p>
          <p className="text-[15px] text-mute line-through decoration-dim">{m.outgoing}</p>
        </div>
        <span className="text-dim">→</span>
        <div>
          <p className="eyebrow text-gold">In</p>
          <p className="text-[15px] font-medium">{m.incoming}</p>
        </div>
      </div>
      <p className="eyebrow mb-1 mt-3">Who is {m.incoming}</p>
      <ul className="space-y-1 text-[13px] leading-snug text-fg/90">
        {m.bio.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoveBody({ item }: { item: FeedItem }) {
  const mv = item.move!;
  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-s2 p-3">
      <div className="num">
        <p className="text-[26px] font-medium leading-none">{mv.volX.toFixed(1)}×</p>
        <p className="mt-1 text-[11px] text-mute">volume vs 20-day avg</p>
      </div>
      <Sparkline data={mv.series} width={120} height={40} />
      <div className="num text-right">
        <p className={`text-[26px] font-medium leading-none ${tone(mv.dayPct)}`}>{pct(mv.dayPct)}</p>
        <p className="mt-1 text-[11px] text-mute">today</p>
      </div>
    </div>
  );
}

export function ActCard({
  item,
  onDone,
  onMute,
}: {
  item: FeedItem;
  onDone: () => void;
  onMute: () => void;
}) {
  return (
    <article className="rise rounded-2xl border border-line bg-s1 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-wide">{item.sym}</span>
        <Pill tone="gold">{CATEGORY_LABEL[item.cat]}</Pill>
        {item.sample && <SampleTag />}
        <span className="num ml-auto text-[11.5px] text-dim">{ago(item.hoursAgo)}</span>
      </div>
      <h3 className="mt-2 font-serif text-[22px] leading-[1.15]">{item.title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-snug text-fg/85">{item.soWhat}</p>

      {item.kind === "results" && <ResultsBody item={item} />}
      {item.kind === "mgmt" && <MgmtBody item={item} />}
      {item.kind === "move" && <MoveBody item={item} />}

      <p className="mt-3 text-[11.5px] leading-snug text-dim">
        <span className="uppercase tracking-wider text-mute">Ranked here: </span>
        {item.why}
      </p>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <Link
          href={digHref(item)}
          className="rounded-full bg-gold px-4 py-2 text-[13px] font-medium text-ink"
        >
          Dig in
        </Link>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-line px-3.5 py-2 text-[13px] text-mute hover:text-fg"
          >
            Filing ↗
          </a>
        )}
        <button onClick={onMute} className="ml-auto text-[12px] text-dim hover:text-mute">
          Mute type
        </button>
        <button
          onClick={onDone}
          className="rounded-full border border-line px-3 py-2 text-[12px] text-mute hover:text-fg"
        >
          Done
        </button>
      </div>
    </article>
  );
}

export function NoteRow({
  item,
  onDone,
  onMute,
}: {
  item: FeedItem;
  onDone: () => void;
  onMute: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/70 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <span className="w-[74px] shrink-0 pt-[1px] font-mono text-[12px] font-semibold">{item.sym}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug">{item.title}</span>
          <span className="mt-0.5 block text-[12px] text-mute">
            {CATEGORY_LABEL[item.cat]} · {ago(item.hoursAgo)}
          </span>
        </span>
        <span className={`mt-1 text-dim transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && (
        <div className="rise px-4 pb-3 pl-[102px]">
          <p className="text-[13px] leading-snug text-fg/85">{item.soWhat}</p>
          <p className="mt-1.5 text-[11.5px] text-dim">{item.why}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <Link href={digHref(item)} className="rounded-full border border-gold/50 px-3 py-1.5 text-[12px] text-gold">
              Dig in
            </Link>
            {item.url && (
              <a href={item.url} target="_blank" rel="noreferrer" className="text-[12px] text-mute hover:text-fg">
                Filing ↗
              </a>
            )}
            {item.sample && <SampleTag />}
            <button onClick={onMute} className="ml-auto text-[12px] text-dim hover:text-mute">
              Mute type
            </button>
            <button onClick={onDone} className="text-[12px] text-mute hover:text-fg">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
