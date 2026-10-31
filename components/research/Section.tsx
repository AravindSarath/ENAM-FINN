"use client";

import { useState, type ReactNode } from "react";

export function Section({
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

export function Pending({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-3.5 py-4 text-[12.5px] leading-snug text-mute">{children}</div>;
}

/** The five kinds of content, so a reader always knows what they are looking at. */
export function Legend() {
  const items: [string, string, string][] = [
    ["ƒ", "text-up", "Calculated by code"],
    ["▪", "text-up", "From the annual report"],
    ["▸", "text-gold", "Management said"],
    ["✎", "text-warn", "Model-written from cited sources"],
    ["–", "text-dim", "Unavailable, with the reason"],
  ];
  return (
    <ul className="mx-4 mb-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-mute" aria-label="Legend">
      {items.map(([g, c, t]) => (
        <li key={t} className="flex items-center gap-1">
          <span className={c}>{g}</span>
          {t}
        </li>
      ))}
    </ul>
  );
}
