"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ClientDossier } from "@/lib/research/load";
import type { Fact } from "@/lib/research/types";
import { fmtValue } from "./format";

interface CiteApi {
  open: (id: string) => void;
}
const Ctx = createContext<CiteApi>({ open: () => undefined });
export const useCite = () => useContext(Ctx);

const KIND_LABEL: Record<string, string> = {
  guidance: "Guidance",
  forward_looking: "Forward-looking",
  target: "Target",
  commentary: "Commentary",
  business: "Business",
  segment: "Segment",
  outlook: "Outlook",
  debt: "Debt",
  contingent_liability: "Contingent liability",
  related_party: "Related party",
  auditor_remark: "Auditor remark",
  risk: "Risk",
};

export function shortCite(f: Fact): string {
  return f.docKind === "transcript" ? `${f.speaker?.name.split(" ").slice(-1)[0] ?? "Call"} · p${f.page}` : `Annual report · p${f.page}`;
}

/** Wraps a dossier so any citation chip inside it can open the source panel. */
export function CiteProvider({ d, children }: { d: ClientDossier; children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const facts = useMemo(() => new Map(d.facts.map((f) => [f.id, f])), [d.facts]);
  const metrics = useMemo(() => new Map(d.metrics.map((m) => [m.id, m])), [d.metrics]);
  const docs = useMemo(() => new Map(d.sources.docs.map((x) => [x.id, x])), [d.sources.docs]);
  const fact = id ? facts.get(id) : undefined;
  const metric = id ? metrics.get(id) : undefined;
  const doc = fact ? docs.get(fact.docId) : undefined;

  return (
    <Ctx.Provider value={{ open: setId }}>
      {children}
      <AnimatePresence>
        {id && (fact || metric) && (
          <>
            <motion.div key="bd" className="fixed inset-0 z-[60] bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setId(null)} />
            <motion.div
              key="panel"
              role="dialog"
              aria-label="Source"
              className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-h-[86dvh] max-w-[430px] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-s1 px-5 pb-8 pt-3"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
              {fact && doc && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded border px-1.5 py-[1px] text-[10px] uppercase tracking-wider ${fact.docKind === "transcript" ? "border-gold/50 text-gold" : "border-up/40 text-up"}`}>
                        {fact.docKind === "transcript" ? "Management said" : "From the annual report"}
                      </span>
                      <span className="ml-2 text-[11px] uppercase tracking-wider text-dim">{KIND_LABEL[fact.kind] ?? fact.kind}</span>
                    </div>
                    <button onClick={() => setId(null)} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-mute">
                      Close
                    </button>
                  </div>
                  <blockquote className="mt-4 border-l-2 border-gold/70 pl-4 font-serif text-[19px] leading-snug">“{fact.quote}”</blockquote>
                  <dl className="mt-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
                    {fact.speaker && (
                      <>
                        <dt className="text-dim">Speaker</dt>
                        <dd>
                          {fact.speaker.name}
                          {fact.speaker.designation ? `, ${fact.speaker.designation}` : ""}
                          <span className="block text-[11px] text-dim">Identified from the transcript&apos;s own header: “{fact.speaker.header.slice(0, 70)}”</span>
                        </dd>
                      </>
                    )}
                    <dt className="text-dim">Document</dt>
                    <dd>{doc.title}</dd>
                    <dt className="text-dim">Page</dt>
                    <dd className="num">
                      {fact.page} of {doc.pages}
                      {fact.verification.pageCorrected && <span className="ml-2 text-[11px] text-dim">(page corrected by code)</span>}
                    </dd>
                    {fact.scope && (
                      <>
                        <dt className="text-dim">About</dt>
                        <dd>{fact.scope}</dd>
                      </>
                    )}
                    {fact.quantified && (
                      <>
                        <dt className="text-dim">Figure</dt>
                        <dd className="num">
                          {fact.quantified.metric.replace(/_/g, " ")}: {fact.quantified.value}
                          {fact.quantified.valueHigh ? `–${fact.quantified.valueHigh}` : ""} {fact.quantified.unit ?? ""} {fact.quantified.comparator ? `(${fact.quantified.comparator.replace("_", " ")})` : ""}
                          {fact.quantified.period ? ` · ${fact.quantified.period}` : ""}
                          {fact.quantified.horizon ? ` · horizon: ${fact.quantified.horizon}` : ""}
                          {fact.quantified.basis ? ` · ${fact.quantified.basis === "yoy" ? "year on year" : "quarter on quarter"} (stated in the ${fact.quantified.basisSource})` : ""}
                        </dd>
                      </>
                    )}
                  </dl>
                  {fact.statement && (
                    <p className="mt-3 rounded-lg border border-dashed border-dim/70 px-3 py-2 text-[12px] leading-snug text-mute">
                      <span className="mr-1.5 text-[10px] uppercase tracking-wider text-dim">Model restatement</span>
                      {fact.statement}
                    </p>
                  )}
                  <p className="eyebrow mb-1 mt-4">Surrounding text</p>
                  <p className="text-[12px] leading-relaxed text-mute">{fact.context}</p>
                  {fact.verification.adjustments.length > 0 && (
                    <p className="mt-3 text-[11px] leading-snug text-dim">Checks applied by code: {fact.verification.adjustments.join("; ")}.</p>
                  )}
                  <a href={`${doc.url}#page=${fact.page}`} target="_blank" rel="noreferrer" className="mt-5 block rounded-full bg-gold py-3 text-center text-[14px] font-medium text-ink">
                    Open the PDF at page {fact.page} ↗
                  </a>
                  <p className="mt-2 text-center text-[11px] text-dim">Verified verbatim against page {fact.page} by code and by a second PDF reader.</p>
                </>
              )}
              {metric && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded border border-up/40 px-1.5 py-[1px] text-[10px] uppercase tracking-wider text-up">Calculated by code</span>
                    <button onClick={() => setId(null)} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-mute">
                      Close
                    </button>
                  </div>
                  <h3 className="mt-3 font-serif text-[24px] leading-tight">{metric.label}</h3>
                  <p className="mt-2 text-[13px] text-fg/90">
                    <span className="text-dim">Formula: </span>
                    {metric.formula}
                  </p>
                  <p className="mt-1 text-[12px] text-mute">
                    <span className="text-dim">Reads: </span>
                    {metric.inputs.join(" · ")}
                  </p>
                  {metric.note && <p className="mt-2 text-[12px] leading-snug text-warn">{metric.note}</p>}
                  <table className="num mt-4 w-full text-[13px]">
                    <tbody>
                      {metric.values.map((v) => (
                        <tr key={v.periodEnd} className="border-t border-line/70">
                          <td className="py-1.5 text-mute">{v.period}</td>
                          <td className="py-1.5 text-right">{v.value != null ? fmtValue(v.value, metric.unit) : <span className="text-dim">n/a{v.reason ? ` (${v.reason})` : ""}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <a href={metric.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 block rounded-full border border-line py-3 text-center text-[13px] text-mute hover:text-fg">
                    Open the screener.in source ↗
                  </a>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

/** A tappable citation. `id` is a fact id (F) or a metric id (M:…). */
export function CiteChip({ id, d }: { id: string; d: ClientDossier }) {
  const { open } = useCite();
  const f = d.facts.find((x) => x.id === id);
  const m = d.metrics.find((x) => x.id === id);
  if (!f && !m) return <span className="rounded border border-down/40 px-1.5 text-[10px] text-down">missing source</span>;
  const label = f ? shortCite(f) : (m?.label.replace(/ \(screener\)/, "") ?? id);
  return (
    <button onClick={() => open(id)} className="num inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-s2 px-1.5 py-[2px] text-[10.5px] text-mute hover:text-fg" aria-label={`Open source: ${label}`}>
      <span className={f?.docKind === "transcript" ? "text-gold" : "text-up"}>{f ? (f.docKind === "transcript" ? "▸" : "▪") : "ƒ"}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
