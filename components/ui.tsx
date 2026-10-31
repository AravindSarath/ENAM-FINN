"use client";

import type { ReactNode } from "react";

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`num shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
        active
          ? "border-gold bg-gold text-ink font-medium"
          : "border-line bg-s1 text-mute hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function Pill({ children, tone = "mute" }: { children: ReactNode; tone?: "mute" | "gold" | "up" | "down" | "warn" }) {
  const cls = {
    mute: "border-line text-mute",
    gold: "border-gold/40 text-gold bg-gold/10",
    up: "border-up/40 text-up bg-up/10",
    down: "border-down/40 text-down bg-down/10",
    warn: "border-warn/40 text-warn bg-warn/10",
  }[tone];
  return (
    <span className={`inline-block rounded-full border px-2 py-[1px] text-[10.5px] uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

/** Marks content that is illustrative, not from a real filing or feed. */
export function SampleTag({ label = "Sample" }: { label?: string }) {
  return (
    <span className="rounded border border-dashed border-dim px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-dim">
      {label}
    </span>
  );
}

export function Sparkline({
  data,
  width = 96,
  height = 28,
  color,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 3 - ((v - min) / span) * (height - 6)}`);
  const up = data[data.length - 1] >= data[0];
  const c = color ?? (up ? "var(--up)" : "var(--down)");
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={c} />
    </svg>
  );
}

export function PageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between px-4 pb-3 pt-6">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="font-serif text-[34px] leading-none tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function DataNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mx-4 mb-3 rounded-lg border border-dashed border-dim/70 px-3 py-2 text-[11.5px] leading-snug text-mute">
      <span className="mr-1.5 font-medium uppercase tracking-wider text-gold">Mock data</span>
      {children}
    </p>
  );
}
