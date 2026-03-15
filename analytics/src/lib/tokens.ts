/**
 * Design tokens for the analytics dashboard.
 * Single source of truth for colors, spacing, and typography constants
 * used across all chart/panel components.
 */

/* ── Color tiers for ranked list components ─────────────────────── */
export const TIER_COLORS = [
  "var(--teal)",      // ranks 1–4  (primary amber/orange)
  "var(--green)",     // ranks 5–8  (yellow)
  "var(--blue)",      // ranks 9–12 (cyan)
  "var(--purple)",    // ranks 13–16 (magenta)
  "var(--amber)",     // ranks 17+  (gold)
] as const;

/** Get a tier color by rank index (0-based). Cycles every 4 items. */
export function tierColor(index: number): string {
  return TIER_COLORS[Math.floor(index / 4)] ?? TIER_COLORS[TIER_COLORS.length - 1];
}

/* ── Momentum / delta colors ────────────────────────────────────── */
export const MOMENTUM = {
  up: "var(--green)",
  down: "var(--red)",
  flat: "var(--text-dim)",
  none: "var(--muted)",
} as const;

/* ── Chart axis tick style (reusable across all Recharts components) */
export const AXIS_TICK = {
  fontSize: 9,
  fontFamily: "var(--font-mono)",
  fill: "var(--muted)",
} as const;

export const AXIS_TICK_SM = {
  ...AXIS_TICK,
  fontSize: 8,
} as const;

/* ── Bar cursor highlight ───────────────────────────────────────── */
export const BAR_CURSOR = { fill: "rgba(255,255,255,0.04)" } as const;

/* ── Tooltip style (for components that can't use ChartTooltip) ── */
export const TOOLTIP_STYLE = {
  background: "var(--bg-panel)",
  border: "1px solid var(--border-bright)",
  padding: "7px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  borderRadius: "var(--radius)",
} as const;

/* ── Standard bar animation duration ────────────────────────────── */
export const CHART_ANIM_MS = 600;

/* ── Easing for skill/rank bars ─────────────────────────────────── */
export const BAR_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
