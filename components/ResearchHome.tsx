"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataNotice, PageHeader } from "./ui";

const OUTPUTS = [
  ["Business", "what it does, revenue mix"],
  ["Financials", "headline numbers at a glance"],
  ["Trajectory", "what's growing, what's compressing"],
  ["Balance sheet", "debt, leverage, working capital"],
  ["Cash quality", "do profits turn into cash"],
  ["Promised vs delivered", "management against its own words"],
  ["Guidance", "what was explicitly guided"],
  ["Bull vs bear", "a tight case each way"],
];

export interface ResearchIndex {
  portfolio: { sym: string; name: string }[];
  research: { sym: string; name: string }[];
}

export default function ResearchHome({ index }: { index: ResearchIndex }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const sym = q.trim().toUpperCase().replace(/[^A-Z0-9&-]/g, "");

  const go = (s: string) => router.push(`/research/${s}`);

  return (
    <>
      <PageHeader eyebrow="Primary sources only" title="Research" />
      <DataNotice label="Real numbers, analysis next">
        All 22 ingested companies open with real screener.in quarterly data. The commentary sections (promised vs
        delivered, guidance, bull and bear) need the LLM stage and show as &quot;next stage&quot;, except a
        layout preview on RELIANCE. Other tickers are not ingested yet.
      </DataNotice>

      <form
        className="mx-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (sym) go(sym);
        }}
      >
        <label className="flex items-center gap-3 rounded-2xl border border-line bg-s1 px-4 py-3.5 focus-within:border-gold">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mute)" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" strokeLinecap="round" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ticker, e.g. ASIANPAINT"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="NSE ticker"
            className="min-w-0 flex-1 bg-transparent font-mono text-[15px] uppercase outline-none placeholder:normal-case placeholder:text-dim"
          />
          {sym && (
            <button type="submit" className="rounded-full bg-gold px-3.5 py-1.5 text-[12.5px] font-medium text-ink">
              Analyse
            </button>
          )}
        </label>
      </form>

      <section className="mt-7">
        <h2 className="eyebrow px-4 pb-2">Ad-hoc picks</h2>
        <div className="scroll-x flex gap-2 px-4">
          {index.research.map(({ sym: s }) => (
            <Link key={s} href={`/research/${s}`} className="shrink-0 rounded-full border border-line bg-s1 px-3.5 py-2 font-mono text-[12.5px] hover:border-gold">
              {s}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="eyebrow px-4 pb-2">From your portfolio</h2>
        <div className="flex flex-wrap gap-2 px-4">
          {index.portfolio.map((h) => (
            <Link
              key={h.sym}
              href={`/research/${h.sym}`}
              className={`rounded-full border px-3 py-1.5 font-mono text-[12px] ${
                h.sym === "RELIANCE" ? "border-gold/60 text-gold" : "border-line text-mute hover:text-fg"
              }`}
            >
              {h.sym}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 px-4">
        <h2 className="eyebrow pb-2">What every dossier answers</h2>
        <ul className="grid grid-cols-2 gap-2">
          {OUTPUTS.map(([t, d]) => (
            <li key={t} className="rounded-xl border border-line bg-s1 px-3 py-2.5">
              <p className="text-[13px] font-medium">{t}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-mute">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] leading-snug text-dim">
          Grounded in annual reports and concall transcripts. No news, no broker notes, no outside knowledge. Every
          claim carries a citation.
        </p>
      </section>
    </>
  );
}
