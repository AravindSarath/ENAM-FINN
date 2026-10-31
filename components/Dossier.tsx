"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DossierView } from "@/lib/data/dossier";
import { change, inr, pct, tone } from "@/lib/format";
import type { ClientDossier } from "@/lib/research/load";
import { CiteProvider } from "./research/Cite";
import ResearchSections from "./research/ResearchSections";
import { Legend, Pending, Section } from "./research/Section";
import { Pill, SampleTag, Sparkline } from "./ui";

/** A citation chip that opens its supporting excerpt inline. */
function Cite({ doc, loc, quote, href, sample }: { doc: string; loc?: string; quote: string; href?: string; sample?: boolean }) {
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
          {href && (
            <a href={href} target="_blank" rel="noreferrer" className="ml-2 not-italic text-gold/80 hover:text-gold">
              Open ↗
            </a>
          )}
          {sample && (
            <span className="ml-2 not-italic">
              <SampleTag label="Placeholder excerpt" />
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function Stat({ label, value, sub, subTone, data }: { label: string; value: string; sub: string; subTone: number | null; data: (number | null)[] }) {
  const clean = data.filter((v): v is number => v != null);
  return (
    <div className="rounded-xl border border-line bg-s2 p-3">
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-[19px] font-medium leading-none">{value}</p>
      <p className={`num mt-1 text-[11.5px] ${subTone != null ? tone(subTone) : "text-dim"}`}>{sub}</p>
      <div className="mt-2 h-6">{clean.length > 1 && <Sparkline data={clean} width={96} height={24} />}</div>
    </div>
  );
}

const VERDICT = {
  delivered: { t: "Delivered", tone: "up" },
  partly: { t: "Partly", tone: "warn" },
  missed: { t: "Missed", tone: "down" },
  early: { t: "Too early", tone: "mute" },
} as const;

const NEXT = <SampleTag label="Next stage" />;

function Sections({ v, from, reportedRevYoY, research }: { v: DossierView; from?: string; reportedRevYoY: number | null; research: ClientDossier | null }) {
  const n = v.quarters.length - 1;
  const last = <T,>(a: (T | null)[]) => a[n] ?? null;
  const rev = last(v.revenue);
  const revYoY = n >= 4 ? change(v.revenue[n] ?? NaN, v.revenue[0] ?? NaN) : NaN;
  const revQoQ = n >= 1 ? change(v.revenue[n] ?? NaN, v.revenue[n - 1] ?? NaN) : NaN;
  const patYoY = n >= 4 ? change(v.pat[n] ?? NaN, v.pat[0] ?? NaN) : NaN;
  const patQoQ = n >= 1 ? change(v.pat[n] ?? NaN, v.pat[n - 1] ?? NaN) : NaN;
  const m = last(v.margin);
  const mYoY = n >= 4 && v.margin[n] != null && v.margin[0] != null ? (v.margin[n] as number) - (v.margin[0] as number) : null;
  const marginVals = v.margin.filter((x): x is number => x != null);
  const maxM = marginVals.length ? Math.max(...marginVals) : 1;
  const isReliance = v.sym === "RELIANCE";
  const finite = (x: number) => Number.isFinite(x);

  const intQoQ = v.interest && v.interest[n] != null && v.interest[n - 1] != null ? change(v.interest[n] as number, v.interest[n - 1] as number) : NaN;
  const opYoYtext = v.operatingProfit && v.operatingProfit[n] != null && v.operatingProfit[0] != null ? change(v.operatingProfit[n] as number, v.operatingProfit[0] as number) : NaN;

  const pvd = isReliance
    ? [
        {
          promise: "Margin to improve sequentially from the June quarter",
          actual: m != null && v.margin[n - 1] != null ? `${v.marginLabel} ${(v.margin[n - 1] as number).toFixed(1)}% → ${m.toFixed(1)}%` : "Unavailable",
          v: m != null && v.margin[n - 1] != null ? ((m as number) > (v.margin[n - 1] as number) ? ("delivered" as const) : ("missed" as const)) : ("early" as const),
          note: "Computed from the screener.in quarterly table (revenue net of excise).",
        },
        {
          promise: "Double-digit revenue growth year on year",
          actual: finite(revYoY) ? `Revenue ${pct(revYoY)} YoY, ${pct(revQoQ)} QoQ (net of excise)` : "Unavailable",
          v: finite(revYoY) ? (revYoY >= 10 ? ("delivered" as const) : ("missed" as const)) : ("early" as const),
          note: reportedRevYoY != null ? `Reported revenue from operations grew ${pct(reportedRevYoY)} YoY on the filing basis.` : "Reported revenue not available.",
        },
        {
          promise: "Finance costs to stabilise",
          actual: v.interest ? `Interest ₹${inr(v.interest[n - 1] ?? 0)} cr → ₹${inr(v.interest[n] ?? 0)} cr (${pct(intQoQ)} QoQ)` : "Unavailable",
          v: finite(intQoQ) ? (Math.abs(intQoQ) <= 2 ? ("partly" as const) : intQoQ > 2 ? ("missed" as const) : ("delivered" as const)) : ("early" as const),
          note: "Within a 2% band counts as partly. A rising figure is not stabilisation.",
        },
        {
          promise: "Capex intensity to moderate",
          actual: "Needs the half-year cash-flow statement",
          v: "early" as const,
          note: "Not measurable from quarterly data.",
        },
      ]
    : [];
  const counts = pvd.reduce<Record<string, number>>((a, r) => ((a[r.v] = (a[r.v] ?? 0) + 1), a), {});

  return (
    <>
      {from && (
        <p className="mx-4 mb-3 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-[12.5px] leading-snug">
          <span className="eyebrow mr-1.5 text-gold">Opened from</span>
          {from}
        </p>
      )}

      <div className="mx-4 mb-3 flex flex-wrap items-center gap-1.5">
        <Pill tone="up">Real data</Pill>
        <Pill>{v.basis ?? "basis unknown"}</Pill>
        <Pill>latest quarter {v.asOf}</Pill>
        {v.status === "partial" && <Pill tone="warn">{v.reason}</Pill>}
      </div>

      <Section id="snapshot" title="Snapshot" badge={<Pill>{v.quarters[n]}</Pill>}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Revenue ₹ cr" value={rev != null ? inr(rev) : "n/a"} sub={finite(revYoY) ? `${pct(revYoY)} YoY` : "YoY n/a"} subTone={finite(revYoY) ? revYoY : null} data={v.revenue} />
          <Stat label={v.marginLabel} value={m != null ? `${m.toFixed(1)}%` : "n/a"} sub={mYoY != null ? `${mYoY > 0 ? "+" : ""}${mYoY.toFixed(1)} pp YoY` : "YoY n/a"} subTone={mYoY} data={v.margin} />
          <Stat label="Net profit ₹ cr" value={v.pat[n] != null ? inr(v.pat[n] as number) : "n/a"} sub={finite(patQoQ) ? `${pct(patQoQ)} QoQ` : "QoQ n/a"} subTone={finite(patQoQ) ? patQoQ : null} data={v.pat} />
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-dim">
          {v.basis ?? "Basis unknown"}, ₹ crore, screener.in standardised figures. Revenue is net of excise duty.{" "}
          {v.operatingProfit
            ? "Margin is operating profit ÷ revenue; operating profit excludes other income and is not EBITDA."
            : "This is a bank or NBFC: screener has no operating profit for it, so the margin shown is net profit ÷ revenue."}{" "}
          {isReliance ? "Reliance's reported revenue, PBT and PAT are verified against its filing on the Brief card." : "Net profit's treatment of non-controlling interest is not verified for this company."}
        </p>
        {v.topRatios.length > 0 && (
          <ul className="num mt-3 grid grid-cols-3 gap-x-2 gap-y-2 text-[12px]">
            {v.topRatios.map((r) => (
              <li key={r.name}>
                <span className="block text-[10px] uppercase tracking-wider text-dim">{r.name}</span>
                {r.text}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Cite
            doc="screener.in"
            loc={`quarterly results · ${v.quarters[n]}`}
            quote={`Fetched ${v.fetchedAt.slice(0, 16).replace("T", " ")} UTC. Revenue ${rev != null ? inr(rev) : "n/a"}, net profit ${v.pat[n] != null ? inr(v.pat[n] as number) : "n/a"} (₹ crore, ${v.basis}).`}
            href={v.latestQuarterSourceUrl ?? v.sourceUrl}
          />
        </div>
      </Section>

      {!research && (
        <>
      <Section id="promised" title="Promised vs delivered" defaultOpen={isReliance} badge={isReliance ? undefined : NEXT}>
        {isReliance ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(Object.keys(counts) as (keyof typeof VERDICT)[]).map((k) => (
                <Pill key={k} tone={VERDICT[k].tone}>
                  {counts[k]} {VERDICT[k].t.toLowerCase()}
                </Pill>
              ))}
            </div>
            <p className="mb-3 rounded-lg border border-dashed border-dim/70 px-3 py-2 text-[11.5px] leading-snug text-mute">
              <span className="mr-1 font-medium uppercase tracking-wider text-gold">Layout preview</span>
              The promise column is placeholder text. In the pull stage it is extracted from the last four concalls. The
              delivered column is computed in code from real figures.
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
                    <Cite doc="Q1 FY27 concall" loc="page ref in pull stage" quote="The management statement is quoted here with its document and page once extraction is connected." sample />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Pending>What management promised on recent concalls, set against what the numbers delivered. Needs transcript extraction (LLM stage).</Pending>
        )}
      </Section>
        </>
      )}

      <Section id="trajectory" title="Trajectory" badge={<Pill>{v.quarters.length} quarters</Pill>}>
        <p className="eyebrow mb-2">{v.marginLabel} by quarter, %</p>
        {marginVals.length > 0 ? (
          <div className="flex h-24 items-end gap-2">
            {v.margin.map((x, i) => (
              <div key={v.quarters[i]} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[11px] text-mute">{x != null ? x.toFixed(1) : "n/a"}</span>
                <div className={`w-full rounded-t ${i === n ? "bg-gold" : "bg-s3"}`} style={{ height: `${x != null ? Math.max(2, (Math.max(x, 0) / Math.max(maxM, 1)) * 62) : 2}px` }} />
                <span className="num text-[10px] text-dim">{v.quarters[i].replace(" 20", " ’")}</span>
              </div>
            ))}
          </div>
        ) : (
          <Pending>Margin unavailable: the source table has no usable profit row for this company.</Pending>
        )}
        <p className="mt-3 text-[13px] leading-snug text-fg/90">
          {finite(revYoY) ? (
            <>
              Revenue is <span className={`num ${tone(revYoY)}`}>{pct(revYoY)}</span> over {n >= 4 ? "a year" : "the period"}
              {finite(opYoYtext) && (
                <>
                  ; operating profit is <span className={`num ${tone(opYoYtext)}`}>{pct(opYoYtext)}</span>
                </>
              )}
              {finite(patYoY) && (
                <>
                  ; net profit <span className={`num ${tone(patYoY)}`}>{pct(patYoY)}</span>
                </>
              )}
              .
            </>
          ) : (
            "Not enough quarters to show a year-on-year trend."
          )}
        </p>
        <div className="mt-2">
          <Cite doc="screener.in" loc="quarterly results" quote={`${v.quarters[0]} to ${v.quarters[n]}, ${v.basis}, figures in ₹ crore.`} href={v.sourceUrl} />
        </div>
      </Section>

      {research && <ResearchSections d={research} />}
      {!research && (
        <>
      <Section id="bullbear" title="Bull vs bear" defaultOpen={isReliance} badge={isReliance ? <Pill>from numbers on screen</Pill> : NEXT}>
        {isReliance && finite(revYoY) ? (
          <>
            <div className="grid gap-2">
              <div className="rounded-xl border border-up/30 bg-up/5 p-3">
                <p className="eyebrow text-up">Bull</p>
                <p className="mt-1 text-[13px] leading-snug">
                  Revenue {pct(revYoY)} YoY with {v.marginLabel.toLowerCase()} back to {m?.toFixed(1)}%: profit now growing faster than sales
                  {finite(patYoY) ? `, net profit ${pct(patYoY)} YoY` : ""}.
                </p>
              </div>
              <div className="rounded-xl border border-down/30 bg-down/5 p-3">
                <p className="eyebrow text-down">Bear</p>
                <p className="mt-1 text-[13px] leading-snug">
                  One strong quarter after a flat year of operating profit
                  {v.operatingProfit && v.operatingProfit[n - 1] != null && v.operatingProfit[0] != null ? ` (${pct(change(v.operatingProfit[n - 1] as number, v.operatingProfit[0] as number))} Sep 2025 to Jun 2026)` : ""}.
                  {finite(intQoQ) ? ` Interest cost still rising (${pct(intQoQ)} QoQ).` : ""}
                </p>
              </div>
            </div>
            <p className="mt-2 text-[11.5px] text-dim">The full version cites annual report and concall passages too.</p>
          </>
        ) : (
          <Pending>A tight case each way, grounded in the annual report and concalls with citations. Next stage.</Pending>
        )}
      </Section>

      <Section id="balance" title="Balance sheet" defaultOpen={false} badge={NEXT}>
        <Pending>Debt, debt-to-equity, interest cover and the working-capital cycle. The annual tables are already in the snapshot; the analysis comes next.</Pending>
      </Section>
      <Section id="cash" title="Cash quality" defaultOpen={false} badge={NEXT}>
        <Pending>Cash from operations against profit, free cash flow and cash conversion across years.</Pending>
      </Section>
      <Section id="guidance" title="Guidance" defaultOpen={false} badge={NEXT}>
        <Pending>Explicit forward statements on growth, margins and capex, each with its transcript page and the date it was made.</Pending>
      </Section>
        </>
      )}
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
            <span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${i < step ? "border-gold bg-gold text-ink" : "border-line"}`}>
              {i < step ? "✓" : ""}
            </span>
            {s}
          </li>
        ))}
      </ul>
      {finished && (
        <div className="rise mt-4 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
          <p className="font-serif text-[22px]">{sym} isn&apos;t in the ingested set</p>
          <p className="mx-auto mt-1 max-w-[32ch] text-[13px] leading-snug text-mute">
            The steps above preview what will run for any NSE ticker once live research is built. Today only the 22
            ingested companies have real data.
          </p>
          <Link href="/research" className="mt-4 inline-block rounded-full bg-gold px-5 py-2.5 text-[13px] font-medium text-ink">
            Pick an ingested company
          </Link>
        </div>
      )}
    </div>
  );
}

const NAV_BASIC = [
  ["snapshot", "Snapshot"],
  ["promised", "Promised vs delivered"],
  ["trajectory", "Trajectory"],
  ["bullbear", "Bull vs bear"],
  ["balance", "Balance sheet"],
  ["cash", "Cash quality"],
  ["guidance", "Guidance"],
];

const NAV_RESEARCH = [
  ["snapshot", "Snapshot"],
  ["business", "Business"],
  ["trajectory", "Quarterly trend"],
  ["trajectory-annual", "Trajectory"],
  ["balance", "Balance sheet"],
  ["cash", "Cash flow"],
  ["promised", "Promised vs delivered"],
  ["bullbear", "Bull vs bear"],
  ["sources", "Sources"],
];

export default function Dossier({ sym, from, view, reportedRevYoY = null, research = null }: { sym: string; from?: string; view: DossierView | null; reportedRevYoY?: number | null; research?: ClientDossier | null }) {
  const NAV = research ? NAV_RESEARCH : NAV_BASIC;
  const body = (
    <>
      <header className="px-4 pb-3 pt-5">
        <Link href="/research" className="text-[12px] text-mute hover:text-fg">
          ‹ Research
        </Link>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[13px] font-semibold tracking-wide text-gold">{sym}</p>
            <h1 className="font-serif text-[32px] leading-none">{view?.name ?? sym}</h1>
          </div>
          {view && <Pill tone={research ? "up" : "warn"}>{research ? "Researched from filings and calls" : "Real numbers · analysis next"}</Pill>}
        </div>
      </header>

      {view && (
        <nav className="scroll-x sticky top-0 z-30 -mt-px flex gap-1.5 border-b border-line bg-ink/92 px-4 py-2.5 backdrop-blur-md" aria-label="Sections">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-mute hover:text-fg">
              {label}
            </a>
          ))}
        </nav>
      )}

      {research && <div className="pt-3"><Legend /></div>}
      {view ? <Sections v={view} from={from} reportedRevYoY={reportedRevYoY} research={research} /> : <Unavailable sym={sym} />}
    </>
  );
  return research ? <CiteProvider d={research}>{body}</CiteProvider> : body;
}
