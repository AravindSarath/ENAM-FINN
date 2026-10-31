import { inr } from "@/lib/format";

export type MetricUnit = "percent" | "x" | "INR_crore" | "days";

/** Compact, so five years fit on a phone. The unit is shown beside the row label, not in every cell. */
export function fmtValue(v: number, unit: MetricUnit): string {
  switch (unit) {
    case "percent":
      return `${v.toFixed(1)}%`;
    case "x":
      return `${v.toFixed(2)}×`;
    case "days":
      return `${Math.round(v)}d`;
    default:
      return inr(Math.round(v));
  }
}
