/**
 * Design tokens for the analytics dashboard.
 * Single source of truth for colors, spacing, and typography constants
 * used across all chart/panel components.
 *
 * Values resolve against the paper token layer in src/app/globals.css.
 * Warm editorial paper, light mode only, one brick-red accent.
 */

/* ── Color tiers for ranked list components ─────────────────────────
   Ordered so adjacent tiers stay distinguishable on a light background.
   Deliberately earthy and desaturated — not a rainbow. */
export const TIER_COLORS = [
  "var(--teal)",      // ranks 1–4   (brick — the accent, top of the list)
  "var(--green)",     // ranks 5–8   (forest)
  "var(--blue)",      // ranks 9–12  (slate)
  "var(--purple)",    // ranks 13–16 (mauve)
  "var(--amber)",     // ranks 17+   (ochre)
] as const;

/** Get a tier color by rank index (0-based). Cycles every 4 items. */
export function tierColor(index: number): string {
  return TIER_COLORS[Math.floor(index / 4)] ?? TIER_COLORS[TIER_COLORS.length - 1];
}

/* ── Momentum / delta colors ────────────────────────────────────────
   Forest green is success; brick red is negative. */
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

/* ── Bar cursor highlight ───────────────────────────────────────────
   An ink wash. A white overlay is invisible on paper. */
export const BAR_CURSOR = { fill: "rgba(28,27,25,0.04)" } as const;

/* ── Tooltip style (for components that can't use ChartTooltip) ──
   The only place a shadow is allowed: transient popovers lift off the page. */
export const TOOLTIP_STYLE = {
  background: "var(--paper-card)",
  border: "1px solid var(--border-hairline)",
  padding: "7px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  borderRadius: "var(--radius)",
  boxShadow: "0 8px 24px rgba(28,27,25,0.10)",
} as const;

/* ── Standard bar animation duration ────────────────────────────── */
export const CHART_ANIM_MS = 600;

/* ── Easing for skill/rank bars ─────────────────────────────────── */
export const BAR_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
