"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORY_LABEL, ago, change, inr, pct, tone } from "@/lib/format";
import type { FeedItem, ResultsRow } from "@/lib/types";
import { Pill, SampleTag, Sparkline } from "./ui";

export function digHref(item: FeedItem) {
  return `/research/${item.sym}?from=${encodeURIComponent(item.title)}`;
}

const pillText = (item: FeedItem) => item.label ?? CATEGORY_LABEL[item.cat];

function Delta({ cur, base }: { cur: number | null; base: number | null }) {
  const d = cur != null && base != null ? change(cur, base) : NaN;
  return <span className={Number.isFinite(d) ? tone(d) : "text-dim"}>{Number.isFinite(d) ? pct(d) : "n/a"}</span>;
}

function ResultRow({ row, strong }: { row: ResultsRow; strong?: boolean }) {
  return (
    <tr className="border-t border-line/70">
      <td className={`py-2 pr-2 ${strong ? "text-fg/90" : "text-mute"}`} title={row.reason ?? row.defn}>
        {row.label}
      </td>
      <td className={`py-2 text-right ${strong ? "font-medium" : ""}`}>{row.cur != null ? inr(row.cur) : <span className="text-dim">n/a</span>}</td>
      <td className="py-2 pl-3 text-right">
        <Delta cur={row.cur} base={row.prevQ} />
      </td>
      <td className="py-2 pl-3 text-right">
        <Delta cur={row.cur} base={row.yearAgo} />
      </td>
    </tr>
  );
}

function ResultsBody({ item }: { item: FeedItem }) {
  const r = item.results!;
  const [defs, setDefs] = useState(false);

  if (r.pending) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-line bg-s2 p-3">
        <p className="eyebrow">{r.periodLabel}</p>
        <p className="mt-1.5 text-[13px] leading-snug text-mute">
          <span className="mr-1.5 rounded border border-dashed border-dim px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-dim">
            Numbers unavailable
          </span>
          {r.pending}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-s2 p-3">
      <p className="eyebrow mb-2">
        {r.periodLabel} · {r.basis ?? "basis unknown"} · ₹ crore
      </p>
      <table className="num w-full text-[13px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-dim">
            <th className="pb-1.5 text-left font-normal" />
            <th className="pb-1.5 text-right font-normal">Now</th>
            <th className="pb-1.5 pl-3 text-right font-normal">QoQ</th>
            <th className="pb-1.5 pl-3 text-right font-normal">YoY</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((row) => (
            <ResultRow key={row.label} row={row} strong />
          ))}
        </tbody>
      </table>

      {r.margin && (
        <p className="num mt-2 text-[11.5px] text-mute">
          Operating margin <span className="text-fg">{r.margin.cur.toFixed(1)}%</span>
          {r.margin.prevQ != null && (
            <span className={tone(r.margin.cur - r.margin.prevQ)}>
              {" "}
              ({r.margin.cur - r.margin.prevQ > 0 ? "+" : ""}
              {(r.margin.cur - r.margin.prevQ).toFixed(1)} pp QoQ)
            </span>
          )}
          <span className="text-dim"> · on revenue net of excise</span>
        </p>
      )}

      {r.extras.length > 0 && (
        <table className="num mt-2 w-full text-[12px]">
          <tbody>
            {r.extras.map((row) => (
              <ResultRow key={row.label} row={row} />
            ))}
          </tbody>
        </table>
      )}
      {r.extras.some((e) => e.reason) && <p className="mt-1 text-[11px] text-dim">{r.extras.find((e) => e.reason)!.reason}</p>}

      <button onClick={() => setDefs(!defs)} aria-expanded={defs} className="mt-2 text-[11.5px] text-mute underline underline-offset-4 hover:text-fg">
        {defs ? "Hide definitions" : "Definitions and sources"}
      </button>
      {defs && (
        <div className="rise mt-2 space-y-1.5 text-[11.5px] leading-snug text-mute">
          {[...r.rows, ...r.extras].map((row) => (
            <p key={row.label}>
              <span className="text-fg/90">{row.label}.</span> {row.reason ?? row.defn}
            </p>
          ))}
          {r.notes.map((n) => (
            <p key={n} className="text-dim">
              {n}
            </p>
          ))}
          {r.sourceUrls.map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-gold/80 hover:text-gold">
              Source {i + 1} ↗ {u.replace(/^https?:\/\//, "").slice(0, 52)}
            </a>
          ))}
        </div>
      )}
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
        <p className="text-[26px] font-medium leading-none">{mv.volX != null ? `${mv.volX.toFixed(1)}×` : "n/a"}</p>
        <p className="mt-1 text-[11px] text-mute">volume vs 20-day avg</p>
      </div>
      {mv.series.length > 1 && <Sparkline data={mv.series} width={120} height={40} />}
      <div className="num text-right">
        <p className={`text-[26px] font-medium leading-none ${tone(mv.dayPct)}`}>{pct(mv.dayPct)}</p>
        <p className="mt-1 text-[11px] text-mute">{mv.asOfLabel} close</p>
      </div>
    </div>
  );
}

function Related({ item }: { item: FeedItem }) {
  const [open, setOpen] = useState(false);
  if (!item.related?.length) return null;
  return (
    <div className="mt-3">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="text-[12px] text-mute underline underline-offset-4 hover:text-fg">
        {open ? "Hide" : "Show"} {item.related.length} related filing{item.related.length > 1 ? "s" : ""}
      </button>
      {open && (
        <ul className="rise mt-2 space-y-1.5">
          {item.related.map((r, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[12px] text-mute">
              <span className="num w-12 shrink-0 text-[11px] text-dim">{ago(r.hoursAgo)}</span>
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-fg">
                  {r.title} ↗
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ActCard({ item, onDone, onMute }: { item: FeedItem; onDone: () => void; onMute: () => void }) {
  return (
    <article className="rise rounded-2xl border border-line bg-s1 p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold tracking-wide">{item.sym}</span>
        <Pill tone="gold">{pillText(item)}</Pill>
        {item.sample && <SampleTag />}
        <span className="num ml-auto text-[11.5px] text-dim">{ago(item.hoursAgo)}</span>
      </div>
      <h3 className="mt-2 font-serif text-[22px] leading-[1.15]">{item.title}</h3>
      {item.soWhat && <p className="mt-1.5 text-[13.5px] leading-snug text-fg/85">{item.soWhat}</p>}

      {item.kind === "results" && <ResultsBody item={item} />}
      {item.kind === "mgmt" && <MgmtBody item={item} />}
      {item.kind === "move" && <MoveBody item={item} />}
      <Related item={item} />

      <p className="mt-3 text-[11.5px] leading-snug text-dim">
        <span className="uppercase tracking-wider text-mute">Ranked here: </span>
        {item.why}
      </p>
      {item.sourceLabel && <p className="mt-1 text-[11px] text-dim">{item.sourceLabel}</p>}

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <Link href={digHref(item)} className="rounded-full bg-gold px-4 py-2 text-[13px] font-medium text-ink">
          Dig in
        </Link>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3.5 py-2 text-[13px] text-mute hover:text-fg">
            Filing ↗
          </a>
        )}
        <button onClick={onMute} className="ml-auto text-[12px] text-dim hover:text-mute">
          Mute type
        </button>
        <button onClick={onDone} className="rounded-full border border-line px-3 py-2 text-[12px] text-mute hover:text-fg">
          Done
        </button>
      </div>
    </article>
  );
}

export function NoteRow({ item, onDone, onMute }: { item: FeedItem; onDone: () => void; onMute: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line/70 last:border-0">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="w-[74px] shrink-0 pt-[1px] font-mono text-[12px] font-semibold">{item.sym}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug">{item.title}</span>
          <span className="mt-0.5 block text-[12px] text-mute">
            {pillText(item)} · {ago(item.hoursAgo)}
          </span>
        </span>
        <span className={`mt-1 text-dim transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && (
        <div className="rise px-4 pb-3 pl-[102px]">
          {item.soWhat && <p className="text-[13px] leading-snug text-fg/85">{item.soWhat}</p>}
          <p className="mt-1.5 text-[11.5px] text-dim">{item.why}</p>
          {item.sourceLabel && <p className="mt-1 text-[11px] text-dim">{item.sourceLabel}</p>}
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
