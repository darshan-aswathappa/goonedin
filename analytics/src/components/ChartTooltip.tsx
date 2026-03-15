"use client";

import type { TooltipProps } from "recharts";
import { TOOLTIP_STYLE } from "@/lib/tokens";

interface Props extends TooltipProps<number, string> {
  /** Color for the header label. Defaults to var(--teal). */
  accentColor?: string;
  /** Custom label formatter. Falls back to payload name or `label` prop. */
  formatLabel?: (payload: any, label?: string) => string;
  /** Custom value formatter. Falls back to `{value} jobs`. */
  formatValue?: (value: number | undefined, payload: any) => string;
}

export default function ChartTooltip({
  active,
  payload,
  label,
  accentColor = "var(--teal)",
  formatLabel,
  formatValue,
}: Props) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const headerColor = entry?.payload?.color ?? accentColor;
  const headerText = formatLabel
    ? formatLabel(entry?.payload, label as string | undefined)
    : (entry?.payload?.company ??
       entry?.payload?.function ??
       entry?.name ??
       label ??
       "");
  const valueText = formatValue
    ? formatValue(entry?.value as number | undefined, entry?.payload)
    : `${(entry?.value as number)?.toLocaleString()} jobs`;

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: headerColor }}>{headerText}</div>
      <div style={{ color: "var(--text)", fontWeight: 700, marginTop: "2px" }}>
        {valueText}
      </div>
    </div>
  );
}
