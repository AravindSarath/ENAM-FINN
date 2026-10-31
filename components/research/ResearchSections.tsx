"use client";

import { useEffect, useRef, useState } from "react";
import { inr, tone } from "@/lib/format";
import type { GuidanceItem, Verdict } from "@/lib/research/guidance";
import type { Metric } from "@/lib/research/metrics";
import type { ClientDossier } from "@/lib/research/load";
import type { Fact } from "@/lib/research/types";
import { Pill, SampleTag } from "../ui";
import { CiteChip } from "./Cite";
import { fmtValue } from "./format";
import { Pending, Section } from "./Section";

const VERDICT_UI: Record<Verdict, { label: string; tone: "up" | "down" | "warn" | "mute" }> = {
  consistent: { label: "Consistent", tone: "up" },
  diverges: { label: "Diverges", tone: "down" },
  delivered: { label: "Delivered", tone: "up" },
  partly: { label: "Partly", tone: "warn" },
  missed: { label: "Missed", tone: "down" },
  too_early: { label: "Too early", tone: "mute" },
  not_compared: { label: "Not compared", tone: "warn" },
  not_measurable: { label: "Not measurable", tone: "mute" },
};

const MODEL_BADGE = (
  <span className="rounded border border-warn/40 px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-warn">✎ Written by the model from cited sources</span>
);

/** A quote, who said it or where it is printed, and its citation chip. */
function FactRow({ f, d, showSpeaker = true }: { f: Fact; d: ClientDossier; showSpeaker?: boolean }) {
  const doc = d.sources.docs.find((x) => x.id === f.docId);
  return (
    <li className="rounded-xl border border-line bg-s2 p-3">
      <p className="font-serif text-[16px] leading-snug">“{f.quote}”</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] text-mute">
        <CiteChip id={f.id} d={d} />
        {showSpeaker && f.speaker && (
          <span>
            {f.speaker.name}
            {f.speaker.designation ? `, ${f.speaker.designation.split(",")[0]}` : ""}
          </span>
        )}
        {doc && <span className="text-dim">{doc.periodLabel ? `${doc.periodLabel} · ` : ""}{f.docKind === "transcript" ? `call ${doc.label}` : doc.title}</span>}
      </div>
    </li>
  );
}

function PointList({ points, d }: { points: { text: string; cites: string[] }[]; d: ClientDossier }) {
  return (
    <ul className="space-y-2.5">
      {points.map((p, i) => (
        <li key={i} className="rounded-xl border border-line bg-s2 p-3">
          <p className="text-[13.5px] leading-snug">{p.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.cites.map((c) => (
              <CiteChip key={c} id={c} d={d} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function MetricTable({ metrics, d }: { metrics: Metric[]; d: ClientDossier }) {
  const [open, setOpen] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Start scrolled to the newest years, the ones a reader wants first.
  useEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth;
  }, []);
  const periods = [...new Set(metrics.flatMap((m) => m.values.map((v) => v.period)))].filter((p) => /^FY\d\d$/.test(p)).slice(-5);
  return (
    <div ref={box} className="scroll-x -mx-1 px-1">
      <table className="num w-full min-w-[360px] text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wider text-dim">
            <th className="pb-1.5 text-left font-normal" />
            {periods.map((p) => (
              <th key={p} className="pb-1.5 pl-2 text-right font-normal">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.id} className="border-t border-line/70 align-top">
              <td className="min-w-[116px] py-2 pr-2">
                <button onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id} className="text-left text-fg/90 hover:text-gold">
                  <span className="mr-1 text-up">ƒ</span>
                  {m.label}
                  {m.unit === "INR_crore" && <span className="text-dim"> (₹ cr)</span>}
                </button>
                {open === m.id && (
                  <span className="rise mt-1 block text-[10.5px] leading-snug text-dim">
                    {m.formula}. {m.note ? `${m.note} ` : ""}
                    <CiteChip id={m.id} d={d} />
                  </span>
                )}
              </td>
              {periods.map((p) => {
                const v = m.values.find((x) => x.period === p);
                return (
                  <td key={p} className="py-2 pl-2 text-right">
                    {v?.value != null ? fmtValue(v.value, m.unit) : <span className="text-dim">n/a</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function verdictLine(g: GuidanceItem): string {
  const s = g.stated;
  const cmp = s.comparator ? `${s.comparator.replace("_", " ")} ` : "";
  const unit = s.unit === "percent" ? "%" : s.unit === "inr_crore" ? " crore" : s.unit ? ` ${s.unit}` : "";
  const range = s.valueHigh != null ? `–${s.valueHigh}` : "";
  return `${cmp}${s.value}${range}${unit}`;
}

function GuidanceCard({ g, d }: { g: GuidanceItem; d: ClientDossier }) {
  const f = d.facts.find((x) => x.id === g.factId);
  const v = VERDICT_UI[g.verdict];
  if (!f) return null;
  return (
    <li className="rounded-xl border border-line bg-s2 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-serif text-[15.5px] leading-snug">“{f.quote}”</p>
        <Pill tone={v.tone}>{v.label}</Pill>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] text-mute">
        <CiteChip id={f.id} d={d} />
        <span>
          {f.speaker?.name}
          {g.period ? ` · ${g.period}` : ""}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <dt className="text-dim">Stated</dt>
        <dd className="num">
          {g.metric.replace(/_/g, " ")}: {verdictLine(g)}
          {g.horizon ? ` · horizon ${g.horizon}` : ""}
        </dd>
        {g.actual && (
          <>
            <dt className="text-dim">Calculated</dt>
            <dd className="num">
              {g.actual.unit === "percent" ? `${g.actual.value.toFixed(1)}%` : `₹${inr(Math.round(g.actual.value))} cr`} ({g.actual.period}) <CiteChip id={g.actual.metricId} d={d} />
            </dd>
          </>
        )}
        {g.reference && (
          <>
            <dt className="text-dim">For reference</dt>
            <dd className="num text-mute">
              {g.reference.label}, {g.reference.period}: {g.reference.value.toFixed(1)}% <span className="text-dim">(different definition; not a verdict)</span>
            </dd>
          </>
        )}
        <dt className="text-dim">Why</dt>
        <dd className="text-mute">{g.reason}</dd>
      </dl>
    </li>
  );
}

const byKind = (d: ClientDossier, ...kinds: string[]) => d.facts.filter((f) => kinds.includes(f.kind));

/** Everything the research pipeline produced for one company. Rendered only when a dossier exists. */
export default function ResearchSections({ d }: { d: ClientDossier }) {
  const m = (...groups: Metric["group"][]) => d.metrics.filter((x) => groups.includes(x.group) && x.frequency === "annual");
  const tested = d.guidance.filter((g) => ["consistent", "diverges", "delivered", "missed", "partly"].includes(g.verdict));
  const notCompared = d.guidance.filter((g) => g.verdict === "not_compared" || g.verdict === "too_early");
  const notMeasurable = d.guidance.filter((g) => g.verdict === "not_measurable");
  const forward = d.facts.filter((f) => f.docKind === "transcript" && ["guidance", "target", "forward_looking"].includes(f.kind));
  const [showAllForward, setShowAllForward] = useState(false);
  const [showNM, setShowNM] = useState(false);
  const syn = d.synthesis;
  const usage = d.usage;
  const cov = d.coverage;

  return (
    <>
      <Section id="business" title="Business snapshot" badge={<Pill>annual report FY26</Pill>}>
        {syn && syn.business.length > 0 ? (
          <>
            <div className="mb-2">{MODEL_BADGE}</div>
            <PointList points={syn.business} d={d} />
          </>
        ) : (
          <Pending>No business summary could be written from verified sources.</Pending>
        )}
        <p className="eyebrow mb-2 mt-5">What the annual report says</p>
        <ul className="space-y-2.5">
          {byKind(d, "business", "segment").slice(0, 8).map((f) => (
            <FactRow key={f.id} f={f} d={d} />
          ))}
        </ul>
      </Section>

      <Section id="trajectory-annual" title="Financial trajectory" badge={<Pill>5 years</Pill>}>
        <MetricTable metrics={m("growth", "profitability")} d={d} />
        <p className="mt-2 text-[11.5px] leading-snug text-dim">
          Calculated from screener.in&apos;s consolidated tables. Operating profit is screener&apos;s figure and is not EBITDA. Tap a row for its formula and source.
        </p>
      </Section>

      <Section id="balance" title="Balance sheet" badge={<Pill>{m("balance_sheet", "efficiency").length} metrics</Pill>}>
        <MetricTable metrics={m("balance_sheet", "efficiency")} d={d} />
        <p className="eyebrow mb-2 mt-5">Borrowings, from the financial statements</p>
        <ul className="space-y-2.5">
          {byKind(d, "debt").slice(0, 6).map((f) => (
            <FactRow key={f.id} f={f} d={d} />
          ))}
        </ul>
        <p className="eyebrow mb-2 mt-5">Contingent liabilities</p>
        {byKind(d, "contingent_liability").length ? (
          <ul className="space-y-2.5">
            {byKind(d, "contingent_liability").slice(0, 5).map((f) => (
              <FactRow key={f.id} f={f} d={d} />
            ))}
          </ul>
        ) : (
          <Pending>No contingent-liability statement could be verified from the selected pages.</Pending>
        )}
        <p className="eyebrow mb-2 mt-5">Auditors&apos; reports</p>
        {byKind(d, "auditor_remark").length ? (
          <ul className="space-y-2.5">
            {byKind(d, "auditor_remark").slice(0, 7).map((f) => (
              <FactRow key={f.id} f={f} d={d} />
            ))}
          </ul>
        ) : (
          <Pending>No auditor remark could be verified from the selected pages.</Pending>
        )}
        <p className="mt-3 text-[11.5px] text-dim">Related-party transactions were not extracted.</p>
      </Section>

      <Section id="cash" title="Cash flow and conversion" badge={<Pill>{m("cash").length} metrics</Pill>}>
        <MetricTable metrics={m("cash")} d={d} />
        <p className="mt-2 text-[11.5px] leading-snug text-dim">Implied capital spending is the gap between cash from operations and screener&apos;s free cash flow, not a reported capex line.</p>
      </Section>

      <Section id="promised" title="Promised vs delivered" badge={<Pill>{tested.length} tested</Pill>}>
        <p className="mb-3 text-[12.5px] leading-snug text-mute">
          {d.guidance.length} numeric management statements across {d.sources.docs.filter((x) => x.kind === "transcript").length} calls. A verdict is computed only where the metric, definition, period and growth basis all match a calculated figure.{" "}
          <span className="text-fg">{tested.length}</span> tested, <span className="text-fg">{notCompared.length}</span> not compared (definitions or basis differ), <span className="text-fg">{notMeasurable.length}</span> not measurable from our sources.
        </p>
        {tested.length > 0 ? (
          <ul className="space-y-2.5">
            {tested.map((g) => (
              <GuidanceCard key={g.id} g={g} d={d} />
            ))}
          </ul>
        ) : (
          <Pending>No statement could be tested like-for-like.</Pending>
        )}
        {notCompared.length > 0 && (
          <>
            <p className="eyebrow mb-2 mt-5">Not compared, and why</p>
            <ul className="space-y-2.5">
              {notCompared.map((g) => (
                <GuidanceCard key={g.id} g={g} d={d} />
              ))}
            </ul>
          </>
        )}
        {notMeasurable.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowNM(!showNM)} aria-expanded={showNM} className="text-[12px] text-mute underline underline-offset-4 hover:text-fg">
              {showNM ? "Hide" : "Show"} {notMeasurable.length} statements that cannot be measured from our sources
            </button>
            {showNM && (
              <ul className="rise mt-2 space-y-2.5">
                {notMeasurable.map((g) => (
                  <GuidanceCard key={g.id} g={g} d={d} />
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="eyebrow mb-2 mt-6">Forward-looking statements by management</p>
        <ul className="space-y-2.5">
          {(showAllForward ? forward : forward.slice(0, 6)).map((f) => (
            <FactRow key={f.id} f={f} d={d} />
          ))}
        </ul>
        {forward.length > 6 && (
          <button onClick={() => setShowAllForward(!showAllForward)} className="mt-3 text-[12px] text-mute underline underline-offset-4 hover:text-fg">
            {showAllForward ? "Show fewer" : `Show all ${forward.length}`}
          </button>
        )}
      </Section>

      <Section id="bullbear" title="Bull vs bear" badge={<Pill tone="warn">model-written</Pill>}>
        {syn && (syn.bull.length > 0 || syn.bear.length > 0) ? (
          <>
            <div className="mb-3">{MODEL_BADGE}</div>
            <p className="eyebrow mb-2 text-up">Bull</p>
            <PointList points={syn.bull} d={d} />
            <p className="eyebrow mb-2 mt-5 text-down">Bear</p>
            <PointList points={syn.bear} d={d} />
            <p className="mt-3 text-[11.5px] leading-snug text-dim">
              Every point cites verified facts or calculated metrics, and any point with a number its sources lack was discarded ({syn.dropped.length} discarded). This is a selection and framing of the cited sources, not extra evidence.
            </p>
          </>
        ) : (
          <Pending>No bull or bear point survived verification.</Pending>
        )}
      </Section>

      <Section id="sources" title="Sources and method" defaultOpen={false} badge={<SampleTag label="Audit trail" />}>
        <ul className="space-y-2">
          {d.sources.docs.map((x) => (
            <li key={x.id} className="rounded-xl border border-line bg-s2 p-3 text-[12.5px]">
              <p className="font-medium">{x.title}</p>
              <p className="num mt-0.5 text-[11.5px] text-mute">
                {x.pages} pages · {d.coverage.factsByDoc[x.id] ?? 0} verified statements
                {x.kind === "annual_report" ? ` · pages read: ${d.sources.annualReportSelection.reduce((s, t) => s + t.pages.length, 0)} of ${x.pages}` : ""}
              </p>
              <a href={x.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11.5px] text-gold/80 hover:text-gold">
                Open the document ↗
              </a>
            </li>
          ))}
          {d.sources.unavailable.map((u) => (
            <li key={u.what} className="rounded-xl border border-dashed border-line p-3 text-[12.5px] text-mute">
              <span className="mr-1.5 rounded border border-dashed border-dim px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-dim">Unavailable</span>
              {u.what}: {u.reason}
            </li>
          ))}
        </ul>

        <p className="eyebrow mb-2 mt-5">Annual-report pages read</p>
        <ul className="space-y-1.5 text-[11.5px] text-mute">
          {d.sources.annualReportSelection.map((s) => (
            <li key={s.topic}>
              <span className="text-fg/90">{s.topic.replace("_", " & ")}</span>: pages {s.pages.join(", ")}
              <span className="block text-dim">{s.rule}</span>
            </li>
          ))}
        </ul>

        <p className="eyebrow mb-2 mt-5">Verification</p>
        <p className="text-[12.5px] leading-snug text-mute">
          The model proposed <span className="num text-fg">{cov.proposed}</span> statements. Code kept <span className="num text-fg">{cov.verified}</span>: each quote is verbatim on its cited page, spoken by a management speaker identified from the transcript headers (analyst questions are excluded), and every structured number, unit, comparator, metric and growth basis is supported by the quote. {cov.dropped} were dropped (
          {Object.entries(cov.droppedByReason).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ") || "none"}).
        </p>
        <p className="eyebrow mb-2 mt-4">Management speakers</p>
        <ul className="text-[11.5px] text-mute">
          {cov.managementSpeakers.map((s) => (
            <li key={s.name}>
              {s.name}
              {s.designation ? `, ${s.designation}` : ""} <span className="num text-dim">· {s.statements}</span>
            </li>
          ))}
        </ul>

        <p className="eyebrow mb-2 mt-5">Models and token use (measured)</p>
        <p className="num text-[12px] leading-snug text-mute">
          Extraction: gemini-3.5-flash-lite. Synthesis: gemini-3.5-flash, thinking level low. {usage.calls} calls, {inr(usage.promptTokens)} prompt tokens, {inr(usage.outputTokens)} output tokens, {usage.thoughtTokens} thinking tokens. Rate-limit or overload errors retried:{" "}
          {usage.retriedStatuses.length ? usage.retriedStatuses.join(", ") : "none"}.
        </p>

        <p className="eyebrow mb-2 mt-5">Limitations</p>
        <ul className="list-disc space-y-1 pl-4 text-[11.5px] leading-snug text-mute">
          {d.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className={`mt-3 text-[11px] ${tone(0)}`}>Generated {d.generatedAt.slice(0, 10)}.</p>
      </Section>
    </>
  );
}
