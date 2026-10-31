"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ago } from "@/lib/format";
import { evaluate, useRules } from "@/lib/rules";
import type { BriefData } from "@/lib/data/view";
import type { Category } from "@/lib/types";
import { ActCard, NoteRow } from "./FeedCards";
import { Chip, DataNotice, PageHeader } from "./ui";

const WINDOWS = [
  { k: "6h", h: 6 },
  { k: "24h", h: 24 },
  { k: "3d", h: 72 },
  { k: "7d", h: 168 },
];

export default function Brief({ data }: { data: BriefData }) {
  const { feed: FEED, holdings: HOLDINGS, asOfLabel } = data;
  const [win, setWin] = useState("24h");
  const [customH, setCustomH] = useState(48);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [showRoutine, setShowRoutine] = useState(false);
  const [rules] = useRules();

  const hours = win === "custom" ? customH : (WINDOWS.find((w) => w.k === win)?.h ?? 24);

  const items = useMemo(
    () => FEED.filter((f) => f.hoursAgo <= hours && !done.has(f.id) && !muted.has(`${f.sym}:${f.cat}`)),
    [FEED, hours, done, muted],
  );
  const act = items.filter((i) => i.tier === "act");
  const note = items.filter((i) => i.tier === "note");
  const routine = items.filter((i) => i.tier === "routine");
  const routineCos = new Set(routine.map((r) => r.sym)).size;

  const hits = useMemo(() => evaluate(rules, HOLDINGS, FEED, 24), [rules, HOLDINGS, FEED]);

  const markDone = (id: string) => setDone((s) => new Set(s).add(id));
  const mute = (sym: string, cat: Category) => setMuted((s) => new Set(s).add(`${sym}:${cat}`));

  return (
    <>
      <PageHeader
        eyebrow={`As of ${asOfLabel}`}
        title="Brief"
        right={
          <div className="num pb-1 text-right text-[11.5px] leading-tight text-mute">
            <span className="text-fg">{act.length}</span> need you
            <br />
            <span className="text-fg">{note.length}</span> noted
          </div>
        }
      />
      <DataNotice label="Real + sample">
        Prices (Yahoo Finance), 30 days of NSE filings and quarterly numbers (screener.in) are real snapshots.
        Reliance&apos;s revenue, PBT and PAT are verified against its filing. The KPITTECH management card is
        sample content, tagged as such. Portfolio weights are illustrative.
      </DataNotice>

      {hits.length > 0 && (
        <Link
          href="/alerts"
          className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
          </span>
          <span className="min-w-0 flex-1 text-[13px]">
            <span className="font-medium text-gold">{hits.length} alerts fired</span>
            <span className="text-mute"> · latest: {hits[0].sym}, {hits[0].text}</span>
          </span>
          <span className="text-gold">›</span>
        </Link>
      )}

      <div className="scroll-x flex items-center gap-2 px-4 pb-1">
        <span className="eyebrow mr-1 shrink-0">Window</span>
        {WINDOWS.map((w) => (
          <Chip key={w.k} active={win === w.k} onClick={() => setWin(w.k)}>
            {w.k}
          </Chip>
        ))}
        <Chip active={win === "custom"} onClick={() => setWin("custom")}>
          Custom
        </Chip>
      </div>
      {win === "custom" && (
        <div className="rise mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-s1 px-3.5 py-3">
          <span className="text-[13px] text-mute">Last</span>
          <input
            type="range"
            min={1}
            max={168}
            value={customH}
            onChange={(e) => setCustomH(Number(e.target.value))}
            aria-label="Window length in hours"
          />
          <span className="num w-14 shrink-0 text-right text-[13px]">{customH}h</span>
        </div>
      )}

      {items.length === 0 && (
        <div className="mx-4 mt-10 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-serif text-2xl">Nothing needs you.</p>
          <p className="mt-1 text-[13px] text-mute">Everything in this window is handled or muted. Widen the window to look back.</p>
        </div>
      )}

      {act.length > 0 && (
        <section className="mt-5">
          <h2 className="eyebrow px-4 pb-2 text-gold">Act · {act.length}</h2>
          <div className="space-y-3 px-4">
            {act.map((i) => (
              <ActCard key={i.id} item={i} onDone={() => markDone(i.id)} onMute={() => mute(i.sym, i.cat)} />
            ))}
          </div>
        </section>
      )}

      {note.length > 0 && (
        <section className="mt-7">
          <h2 className="eyebrow px-4 pb-2">Noted · {note.length}</h2>
          <div className="mx-4 overflow-hidden rounded-2xl border border-line bg-s1">
            {note.map((i) => (
              <NoteRow key={i.id} item={i} onDone={() => markDone(i.id)} onMute={() => mute(i.sym, i.cat)} />
            ))}
          </div>
        </section>
      )}

      {routine.length > 0 && (
        <section className="mt-7">
          <button
            onClick={() => setShowRoutine(!showRoutine)}
            aria-expanded={showRoutine}
            className="mx-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl border border-line px-4 py-3 text-left"
          >
            <span>
              <span className="num text-[14px]">{routine.length} routine filings</span>
              <span className="text-[13px] text-mute"> across {routineCos} companies</span>
            </span>
            <span className={`text-dim transition-transform ${showRoutine ? "rotate-90" : ""}`}>›</span>
          </button>
          {showRoutine && (
            <ul className="rise mx-4 mt-2 divide-y divide-line/70 rounded-2xl border border-line/70">
              {routine.map((r) => (
                <li key={r.id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="w-[74px] shrink-0 font-mono text-[11.5px] text-mute">{r.sym}</span>
                  <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-mute">{r.title}</span>
                  <span className="num shrink-0 text-[11px] text-dim">{ago(r.hoursAgo)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mx-4 mt-2 text-[11.5px] text-dim">
            Paperwork that doesn&apos;t move a stock. Collapsed, not hidden.
          </p>
        </section>
      )}
    </>
  );
}
