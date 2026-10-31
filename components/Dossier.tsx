"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { change, inr, pct, tone } from "@/lib/format";
import { HOLDINGS, RELIANCE_DOSSIER as D } from "@/lib/mock";
import { Pill, SampleTag, Sparkline } from "./ui";

/** A citation chip that opens its supporting excerpt inline. */
function Cite({ doc, loc, quote, sample }: { doc: string; loc?: string; quote: string; sample?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="block">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="num inline-flex items-center gap-1 rounded-md border border-line bg-s2 px-1.5 py-[2px] text-[10.5px] text-mute hover:text-fg"
      >
        <span className="text-gold">▸</span>
        {doc}
        {loc ? ` · ${loc}` : ""}
      </button>
      {open && (
        <span className="rise mt-1.5 block border-l-2 border-gold/60 pl-3 text-[12px] italic leading-snug text-fg/80">
          {quote}
          {sample && <span className="ml-2 not-italic"><SampleTag label="Placeholder excerpt" /></span>}
        </span>
      )}
    </span>
  );
}

function Section({
  id,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="scroll-mt-16 border-t border-line px-4 py-4">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <h2 className="font-serif text-[22px] leading-none">{title}</h2>
        {badge}
        <span className={`ml-auto text-dim transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <div className="rise mt-3">{children}</div>}
    </section>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-3.5 py-4 text-[12.5px] leading-snug text-mute">
      {children}
    </div>
  );
}

function Stat({ label, value, sub, subTone, data }: { label: string; value: string; sub: string; subTone: number; data: number[] }) {
  return (
    <div className="rounded-xl border border-line bg-s2 p-3">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-[19px] font-medium leading-none">{value}</p>
      <p className={`num mt-1 text-[11.5px] ${tone(subTone)}`}>{sub}</p>
      <div className="mt-2">
        <Sparkline data={data} width={96} height={24} />
      </div>
    </div>
  );
}

const VERDICT = {
  delivered: { t: "Delivered", tone: "up" },
  partly: { t: "Partly", tone: "warn" },
  missed: { t: "Missed", tone: "down" },
  early: { t: "Too early", tone: "mute" },
} as const;

function RelianceDossier({ from }: { from?: string }) {
  const n = D.revenue.length - 1;
  const opm = D.opProfit.map((o, i) => (o / D.revenue[i]) * 100);
  const revYoY = change(D.revenue[n], D.revenue[0]);
  const revQoQ = change(D.revenue[n], D.revenue[n - 1]);
  const opYoY = change(D.opProfit[n], D.opProfit[0]);
  const patYoY = change(D.pat[n], D.pat[0]);
  const patQoQ = change(D.pat[n], D.pat[n - 1]);
  const intQoQ = change(8481, 8337);
  const maxOpm = Math.max(...opm);

  const pvd = [
    {
      promise: "Margin to improve sequentially from the June quarter",
      actual: `EBITDA margin ${opm[n - 1].toFixed(1)}% → ${opm[n].toFixed(1)}%`,
      v: "delivered" as const,
      note: "Computed from the quarterly table.",
    },
    {
      promise: "Double-digit revenue growth year on year",
      actual: `Revenue ${pct(revYoY)} YoY, ${pct(revQoQ)} QoQ`,
      v: "delivered" as const,
      note: "Computed from the quarterly table.",
    },
    {
      promise: "Finance costs to stabilise",
      actual: `Interest ₹8,337 cr → ₹8,481 cr (${pct(intQoQ)} QoQ)`,
      v: "partly" as const,
      note: "Rising slightly; the pace slowed against the prior year.",
    },
    {
      promise: "Capex intensity to moderate",
      actual: "Needs the half-year cash-flow statement",
      v: "early" as const,
      note: "Not measurable from quarterly data.",
    },
  ];
  const counts = pvd.reduce<Record<string, number>>((a, r) => ((a[r.v] = (a[r.v] ?? 0) + 1), a), {});

  return (
    <>
      {from && (
        <p className="mx-4 mb-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-[12.5px] leading-snug">
          <span className="eyebrow mr-1.5 text-gold">Opened from</span>
          {from}
        </p>
      )}

      <Section id="snapshot" title="Snapshot" badge={<Pill>Sep 2026 qtr</Pill>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Revenue ₹ cr" value={inr(D.revenue[n])} sub={`${pct(revYoY)} YoY`} subTone={revYoY} data={D.revenue} />
          <Stat label="EBITDA*" value={`${opm[n].toFixed(1)}%`} sub={`${pct(opYoY)} YoY`} subTone={opYoY} data={D.opProfit} />
          <Stat label="PAT ₹ cr" value={inr(D.pat[n])} sub={`${pct(patQoQ)} QoQ`} subTone={patQoQ} data={D.pat} />
        </div>
        <p className="mt-2 text-[11.5px] text-dim">
          Consolidated, ₹ crore. *EBITDA margin on operating profit, excludes other income. Real figures from the
          screener.in snapshot.
        </p>
        <div className="mt-2">
          <Cite
            doc="screener.in"
            loc="quarterly results"
            quote={`Sales ${inr(D.revenue[n])} · Operating profit ${inr(D.opProfit[n])} · PAT ${inr(D.pat[n])} (Sep 2026, consolidated, ₹ crore)`}
          />
        </div>
      </Section>

      <Section
        id="promised"
        title="Promised vs delivered"
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(Object.keys(counts) as (keyof typeof VERDICT)[]).map((k) => (
            <Pill key={k} tone={VERDICT[k].tone}>
              {counts[k]} {VERDICT[k].t.toLowerCase()}
            </Pill>
          ))}
        </div>
        <p className="mb-3 rounded-lg border border-dashed border-dim/70 px-3 py-2 text-[11.5px] leading-snug text-mute">
          <span className="mr-1 font-medium uppercase tracking-wider text-gold">Layout preview</span>
          The promise column is placeholder text. In the pull stage it is extracted from the last four concalls, and
          the delivered column is computed in code. Delivered figures here are real.
        </p>
        <ul className="space-y-2.5">
          {pvd.map((r) => (
            <li key={r.promise} className="rounded-xl border border-line bg-s2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Promised</p>
                  <p className="mt-0.5 text-[13.5px] leading-snug">{r.promise}</p>
                </div>
                <Pill tone={VERDICT[r.v].tone}>{VERDICT[r.v].t}</Pill>
              </div>
              <p className="eyebrow mt-3">Delivered</p>
              <p className="num mt-0.5 text-[13.5px] leading-snug">{r.actual}</p>
              <p className="mt-1 text-[11.5px] text-dim">{r.note}</p>
              <div className="mt-2">
                <Cite
                  doc="Q1 FY27 concall"
                  loc="page ref in pull stage"
                  quote="The management statement is quoted here with its document and page once extraction is connected."
                  sample
                />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="trajectory" title="Trajectory" badge={<Pill>5 quarters</Pill>}>
        <p className="eyebrow mb-2">EBITDA margin by quarter</p>
        <div className="flex h-24 items-end gap-2">
          {opm.map((m, i) => (
            <div key={D.quarters[i]} className="flex flex-1 flex-col items-center gap-1">
              <span className="num text-[11px] text-mute">{m.toFixed(1)}</span>
              <div
                className={`w-full rounded-t ${i === n ? "bg-gold" : "bg-s3"}`}
                style={{ height: `${(m / maxOpm) * 62}px` }}
              />
              <span className="num text-[10px] text-dim">{D.quarters[i]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-fg/90">
          Revenue is up <span className="num text-up">{pct(revYoY)}</span> in a year, but margin dipped to{" "}
          {Math.min(...opm).toFixed(1)}% in Mar 2026 before recovering. Until the latest quarter, sales grew faster
          than profit.
        </p>
        <div className="mt-2">
          <Cite doc="screener.in" loc="quarterly results" quote="Operating profit and sales, five quarters Sep 2025 to Sep 2026, consolidated." />
        </div>
      </Section>

      <Section id="bullbear" title="Bull vs bear" badge={<Pill>from numbers on screen</Pill>}>
        <div className="grid gap-2">
          <div className="rounded-xl border border-up/30 bg-up/5 p-3">
            <p className="eyebrow text-up">Bull</p>
            <p className="mt-1 text-[13px] leading-snug">
              Revenue {pct(revYoY)} YoY with margin back to {opm[n].toFixed(1)}%: profit now compounding faster than
              sales, PAT {pct(patYoY)} YoY.
            </p>
          </div>
          <div className="rounded-xl border border-down/30 bg-down/5 p-3">
            <p className="eyebrow text-down">Bear</p>
            <p className="mt-1 text-[13px] leading-snug">
              One strong quarter after a flat year of operating profit ({pct(change(D.opProfit[n - 1], D.opProfit[0]))}{" "}
              Sep 2025 to Jun 2026). Interest cost still rising ({pct(intQoQ)} QoQ).
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] text-dim">The full version cites annual report and concall passages too.</p>
      </Section>

      <Section id="balance" title="Balance sheet" defaultOpen={false} badge={<SampleTag label="Next stage" />}>
        <Pending>
          Debt, debt-to-equity, interest cover and the working-capital cycle will be read from the screener annual
          tables and the annual report notes.
        </Pending>
      </Section>
      <Section id="cash" title="Cash quality" defaultOpen={false} badge={<SampleTag label="Next stage" />}>
        <Pending>Cash from operations against PAT, free cash flow and cash conversion across five years.</Pending>
      </Section>
      <Section id="guidance" title="Guidance" defaultOpen={false} badge={<SampleTag label="Next stage" />}>
        <Pending>
          Explicit forward statements on growth, margins and capex, each with its transcript page and the date it was
          made.
        </Pending>
      </Section>
    </>
  );
}

const STEPS = [
  "Resolving symbol",
  "Fetching fundamentals from screener.in",
  "Locating annual report and concall transcripts",
  "Reading transcripts",
  "Cross-checking claims against numbers",
];

function Unavailable({ sym }: { sym: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length)), 650);
    return () => clearInterval(t);
  }, []);
  const finished = step >= STEPS.length;
  return (
    <div className="px-4">
      <ul className="space-y-2.5 rounded-2xl border border-line bg-s1 p-4">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-3 text-[13px] ${i < step ? "text-mute" : i === step ? "text-fg" : "text-dim"}`}>
            <span
              className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${
                i < step ? "border-gold bg-gold text-ink" : "border-line"
              }`}
            >
              {i < step ? "✓" : ""}
            </span>
            {s}
          </li>
        ))}
      </ul>
      {finished && (
        <div className="rise mt-4 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-serif text-[22px]">Live research isn&apos;t connected yet</p>
          <p className="mx-auto mt-1 max-w-[30ch] text-[13px] leading-snug text-mute">
            The steps above are a preview of what runs for {sym} once the pipeline is built. Try the sample dossier.
          </p>
          <Link href="/research/RELIANCE" className="mt-4 inline-block rounded-full bg-gold px-5 py-2.5 text-[13px] font-medium text-ink">
            Open RELIANCE sample
          </Link>
        </div>
      )}
    </div>
  );
}

const NAV = [
  ["snapshot", "Snapshot"],
  ["promised", "Promised vs delivered"],
  ["trajectory", "Trajectory"],
  ["bullbear", "Bull vs bear"],
  ["balance", "Balance sheet"],
  ["cash", "Cash quality"],
  ["guidance", "Guidance"],
];

export default function Dossier({ sym, from }: { sym: string; from?: string }) {
  const known = HOLDINGS.find((h) => h.sym === sym);
  const isSample = sym === "RELIANCE";
  return (
    <>
      <header className="px-4 pb-3 pt-5">
        <Link href="/research" className="text-[12px] text-mute hover:text-fg">
          ‹ Research
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="font-mono text-[13px] font-semibold tracking-wide text-gold">{sym}</p>
            <h1 className="font-serif text-[32px] leading-none">{isSample ? D.name : (known?.name ?? sym)}</h1>
          </div>
          {isSample && <Pill tone="warn">Sample dossier</Pill>}
        </div>
      </header>

      {isSample && (
        <nav className="scroll-x sticky top-0 z-30 -mt-px flex gap-1.5 border-b border-line bg-ink/92 px-4 py-2.5 backdrop-blur-md" aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-mute hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      )}

      {isSample ? <RelianceDossier from={from} /> : <Unavailable sym={sym} />}
    </>
  );
}
