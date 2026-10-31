"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BriefData } from "@/lib/data/view";
import { CATEGORY_LABEL, ago } from "@/lib/format";
import { DEFAULT_RULES, WATCHABLE, evaluate, useRules } from "@/lib/rules";
import type { Hit } from "@/lib/types";
import { Chip, DataNotice, PageHeader, Pill } from "./ui";

const KIND_LABEL: Record<Hit["kind"], string> = {
  volume: "Volume",
  move: "Price move",
  filing: "Filing",
  simulated: "Simulated",
};

function Threshold({
  label,
  hint,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-s1 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] font-medium">{label}</p>
        <p className="num font-serif text-[34px] leading-none text-gold">
          {value}
          <span className="ml-0.5 text-[18px]">{unit}</span>
        </p>
      </div>
      <p className="mb-4 mt-1 text-[12px] text-mute">{hint}</p>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <div className="num mt-1.5 flex justify-between text-[10.5px] text-dim">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

export default function Alerts({ data }: { data: BriefData }) {
  const { feed: FEED, holdings: HOLDINGS } = data;
  const [rules, setRules] = useRules();
  const [sim, setSim] = useState<Hit | null>(null);

  const hits = useMemo(() => {
    const real = evaluate(rules, HOLDINGS, FEED, 24);
    return sim ? [sim, ...real] : real;
  }, [rules, sim, HOLDINGS, FEED]);

  const simulate = () =>
    setSim({
      id: "sim",
      sym: "DIXON",
      kind: "simulated",
      text: "Price +7.8% on 4.1× volume at the close",
      hoursAgo: 0,
    });

  const toggleCat = (c: (typeof WATCHABLE)[number]) =>
    setRules({ ...rules, cats: { ...rules.cats, [c]: !rules.cats[c] } });

  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_RULES);

  return (
    <>
      <PageHeader
        eyebrow="You decide what's unusual"
        title="Alerts"
        right={
          !isDefault ? (
            <button onClick={() => setRules(DEFAULT_RULES)} className="pb-1 text-[12px] text-mute underline underline-offset-4 hover:text-fg">
              Reset
            </button>
          ) : undefined
        }
      />
      <DataNotice label="Real data, your rules">
        Your thresholds are saved on this device and run against real end-of-day prices and NSE filings from the
        latest ingest. &quot;Simulate a day&quot; adds one clearly labelled demo alert.
      </DataNotice>

      <div className="space-y-3 px-4">
        <Threshold
          label="Unusual volume"
          hint="Alert when a day's volume reaches this multiple of the 20-day average."
          value={rules.volX}
          unit="×"
          min={1.2}
          max={5}
          step={0.1}
          onChange={(v) => setRules({ ...rules, volX: Math.round(v * 10) / 10 })}
        />
        <Threshold
          label="Price move"
          hint="Alert when a stock moves more than this in a single day, up or down."
          value={rules.movePct}
          unit="%"
          min={1}
          max={10}
          step={0.5}
          onChange={(v) => setRules({ ...rules, movePct: v })}
        />
      </div>

      <section className="mt-6">
        <h2 className="eyebrow px-4 pb-2">Announcement types you care about</h2>
        <div className="flex flex-wrap gap-2 px-4">
          {WATCHABLE.map((c) => (
            <Chip key={c} active={!!rules.cats[c]} onClick={() => toggleCat(c)}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between px-4 pb-2">
          <h2 className="eyebrow">
            Would have fired · last 24h · <span className="num text-fg">{hits.length}</span>
          </h2>
          <button
            onClick={simulate}
            className="rounded-full border border-gold/50 px-3 py-1.5 text-[12px] text-gold hover:bg-gold/10"
          >
            Simulate a day
          </button>
        </div>
        {hits.length === 0 ? (
          <div className="mx-4 rounded-2xl border border-dashed border-line px-6 py-8 text-center">
            <p className="font-serif text-xl">Quiet.</p>
            <p className="mt-1 text-[13px] text-mute">No alerts at these thresholds. Lower them to see what would surface.</p>
          </div>
        ) : (
          <ul className="mx-4 overflow-hidden rounded-2xl border border-line bg-s1">
            {hits.map((h) => (
              <li key={h.id} className="border-b border-line/70 last:border-0">
                <Link href={`/research/${h.sym}`} className="flex items-start gap-3 px-4 py-3">
                  <span className="w-[74px] shrink-0 pt-0.5 font-mono text-[12px] font-semibold">{h.sym}</span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center gap-2">
                      <Pill tone={h.kind === "simulated" ? "warn" : h.kind === "filing" ? "gold" : "mute"}>
                        {KIND_LABEL[h.kind]}
                      </Pill>
                      <span className="num text-[11px] text-dim">{h.kind === "simulated" ? "now" : (h.whenLabel ?? ago(h.hoursAgo))}</span>
                    </span>
                    <span className="block text-[13px] leading-snug">{h.text}</span>
                  </span>
                  <span className="mt-1 text-dim">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sim && (
          <button onClick={() => setSim(null)} className="mx-4 mt-2 text-[12px] text-mute underline underline-offset-4">
            Clear simulated alert
          </button>
        )}
      </section>
    </>
  );
}
