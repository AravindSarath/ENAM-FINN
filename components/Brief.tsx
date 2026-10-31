"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDigest } from "@/lib/data/digest";
import type { BriefData } from "@/lib/data/view";
import { ago } from "@/lib/format";
import { evaluate, useRules } from "@/lib/rules";
import { useTriage } from "@/lib/triage";
import { ActCard, NoteRow } from "./FeedCards";
import { Chip, DataNotice, PageHeader } from "./ui";

const WINDOWS = [
  { k: "6h", h: 6 },
  { k: "24h", h: 24 },
  { k: "3d", h: 72 },
  { k: "7d", h: 168 },
];

/** Act cards shown before "show more", so a busy day stays scannable. */
const ACT_VISIBLE = 5;

export default function Brief({ data }: { data: BriefData }) {
  const { feed: FEED, holdings: HOLDINGS, asOfLabel } = data;
  const [win, setWin] = useState("24h");
  const [customH, setCustomH] = useState(48);
  const [showRoutine, setShowRoutine] = useState(false);
  const [showAllAct, setShowAllAct] = useState(false);
  const [rules] = useRules();
  const triage = useTriage();

  const hours = win === "custom" ? customH : win === "unseen" ? 168 : (WINDOWS.find((w) => w.k === win)?.h ?? 24);
  const windowLabel = win === "unseen" ? "unseen, last 7 days" : win === "custom" ? `last ${customH}h` : `last ${win}`;

  const doneSet = useMemo(() => new Set(triage.done), [triage.done]);
  const mutedSet = useMemo(() => new Set(triage.muted), [triage.muted]);
  const seenSet = useMemo(() => new Set(triage.seen), [triage.seen]);

  const inWindow = useMemo(() => FEED.filter((f) => f.hoursAgo <= hours), [FEED, hours]);
  const handled = inWindow.filter((f) => doneSet.has(f.id) || mutedSet.has(`${f.sym}:${f.cat}`));
  const items = useMemo(
    () => inWindow.filter((f) => !doneSet.has(f.id) && !mutedSet.has(`${f.sym}:${f.cat}`) && (win !== "unseen" || !seenSet.has(f.id))),
    [inWindow, doneSet, mutedSet, seenSet, win],
  );
  const unseenCount = useMemo(() => FEED.filter((f) => f.hoursAgo <= 168 && !doneSet.has(f.id) && !mutedSet.has(`${f.sym}:${f.cat}`) && !seenSet.has(f.id)).length, [FEED, doneSet, mutedSet, seenSet]);

  // Act: highest materiality first, recency breaks ties. Noted and Routine: newest first.
  const act = items.filter((i) => i.tier === "act").sort((a, b) => b.score - a.score || a.hoursAgo - b.hoursAgo);
  const note = items.filter((i) => i.tier === "note");
  const routine = items.filter((i) => i.tier === "routine");
  const routineCos = new Set(routine.map((r) => r.sym)).size;
  const digest = useMemo(() => buildDigest(items), [items]);
  const hits = useMemo(() => {
    const byId = new Map(FEED.map((f) => [f.id, f]));
    return evaluate(rules, HOLDINGS, FEED, 24).filter((h) => {
      const f = h.itemId ? byId.get(h.itemId) : undefined;
      return !f || (!doneSet.has(f.id) && !mutedSet.has(`${f.sym}:${f.cat}`));
    });
  }, [rules, HOLDINGS, FEED, doneSet, mutedSet]);

  const shownAct = showAllAct ? act : act.slice(0, ACT_VISIBLE);

  return (
    <>
      <PageHeader
        eyebrow={`As of ${asOfLabel}`}
        title="Brief"
        right={
          <div className="num pb-1 text-right text-[11.5px] leading-tight text-mute">
            <span className="text-fg">{digest.counts.act}</span> need you
            <br />
            <span className="text-fg">{digest.counts.note}</span> noted
          </div>
        }
      />
      <DataNotice label="Real + sample">
        Prices (Yahoo Finance), 30 days of NSE filings and quarterly numbers (screener.in) are real snapshots.
        Reliance&apos;s revenue, PBT and PAT are verified against its filing. The KPITTECH management card is
        sample content, tagged as such. Portfolio weights are illustrative and never used for ranking.
      </DataNotice>

      {hits.length > 0 && (
        <Link href="/alerts" className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2.5">
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
        <Chip active={win === "unseen"} onClick={() => setWin("unseen")}>
          Unseen · {unseenCount}
        </Chip>
      </div>
      {win === "custom" && (
        <div className="rise mx-4 mt-3 flex items-center gap-3 rounded-xl border border-line bg-s1 px-3.5 py-3">
          <span className="text-[13px] text-mute">Last</span>
          <input type="range" min={1} max={168} value={customH} onChange={(e) => setCustomH(Number(e.target.value))} aria-label="Window length in hours" />
          <span className="num w-14 shrink-0 text-right text-[13px]">{customH}h</span>
        </div>
      )}
      {win === "unseen" && (
        <div className="rise mx-4 mt-3 flex items-center justify-between rounded-xl border border-line bg-s1 px-3.5 py-3 text-[12.5px]">
          <span className="text-mute">Cards you haven&apos;t marked as seen.</span>
          <button onClick={() => triage.markSeen(items.map((i) => i.id))} disabled={items.length === 0} className="rounded-full border border-gold/50 px-3 py-1.5 text-gold disabled:opacity-40">
            Mark all seen
          </button>
        </div>
      )}

      <section className="mx-4 mt-4 rounded-2xl border border-line bg-s1 p-4" aria-label="Digest">
        <p className="eyebrow">Digest · {windowLabel}</p>
        <p className="mt-1.5 font-serif text-[20px] leading-snug">{digest.headline}</p>
        <p className="num mt-2 text-[11.5px] text-mute">
          {digest.rawFilings} filings → {digest.cards} cards · {digest.counts.act} Act · {digest.counts.note} Noted · {digest.routineCollapsed} routine collapsed
          {handled.length > 0 && ` · ${handled.length} handled`}
          {digest.sampleExcluded > 0 && ` · ${digest.sampleExcluded} sample card not counted`}
        </p>
        {digest.top.length > 0 && (
          <ul className="mt-3 divide-y divide-line/70 border-t border-line/70">
            {digest.top.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => document.getElementById(`card-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="flex w-full items-baseline gap-2 py-2 text-left"
                >
                  <span className="w-[74px] shrink-0 font-mono text-[11.5px] font-semibold">{t.sym}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
                  <span className="num shrink-0 text-[11px] text-dim" title={t.reason}>
                    {t.score}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {items.length === 0 && (
        <div className="mx-4 mt-6 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-serif text-2xl">Nothing needs you.</p>
          <p className="mt-1 text-[13px] text-mute">Everything in this window is handled, muted or seen. Widen the window to look back.</p>
        </div>
      )}

      {act.length > 0 && (
        <section className="mt-5">
          <h2 className="eyebrow px-4 pb-2 text-gold">Act · {act.length}</h2>
          <div className="space-y-3 px-4">
            {shownAct.map((i) => (
              <ActCard key={i.id} item={i} onDone={() => triage.markDone(i.id)} onMute={() => triage.mute(`${i.sym}:${i.cat}`)} />
            ))}
          </div>
          {act.length > ACT_VISIBLE && (
            <button onClick={() => setShowAllAct(!showAllAct)} className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl border border-line py-2.5 text-[13px] text-mute hover:text-fg">
              {showAllAct ? "Show fewer" : `Show ${act.length - ACT_VISIBLE} more Act cards`}
            </button>
          )}
        </section>
      )}

      {note.length > 0 && (
        <section className="mt-7">
          <h2 className="eyebrow px-4 pb-2">Noted · {note.length}</h2>
          <div className="mx-4 overflow-hidden rounded-2xl border border-line bg-s1">
            {note.map((i) => (
              <NoteRow key={i.id} item={i} onDone={() => triage.markDone(i.id)} onMute={() => triage.mute(`${i.sym}:${i.cat}`)} />
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
                <li key={r.id} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-3">
                    <span className="w-[74px] shrink-0 font-mono text-[11.5px] text-mute">{r.sym}</span>
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-mute">{r.title}</span>
                    <span className="num shrink-0 text-[11px] text-dim">{ago(r.hoursAgo)}</span>
                  </div>
                  <p className="pl-[86px] text-[10.5px] text-dim">
                    {r.reasons.find((x) => /routine paperwork/i.test(x.label))?.label ?? r.reasons[0]?.label.replace(/^Category: /, "Call or meeting material: ")}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="ml-1.5 text-gold/70 hover:text-gold">
                        Filing ↗
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mx-4 mt-2 text-[11.5px] text-dim">Positively identified paperwork, and call or meeting notices. Collapsed, not hidden.</p>
        </section>
      )}
    </>
  );
}
