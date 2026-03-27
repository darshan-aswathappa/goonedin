export interface SkillGapItem {
  skill: string;
  must_have: number;
  good_to_have: number;
  total: number;
  recent: number;
  prior: number;
  growth: number;
}

export type Quadrant = "BREAKOUT" | "DOMINANT" | "NICHE" | "FADING";

/**
 * Compute quadrant based on total demand and growth rate.
 * X-axis: total (left=low, right=high)
 * Y-axis: growth rate % (bottom=negative, top=positive)
 *
 * BREAKOUT:  low total, positive growth  (learn now - emerging)
 * DOMINANT:  high total, positive growth (established and growing)
 * FADING:    high total, negative/zero growth (established but declining)
 * NICHE:     low total, negative/zero growth (small, flat)
 */
export function computeQuadrant(
  total: number,
  growth: number,
  medianTotal: number
): Quadrant {
  if (total === 0) return "NICHE";
  const isHighCount = total > medianTotal;
  const isGrowing = growth > 0;

  if (isGrowing && !isHighCount) return "BREAKOUT";
  if (isGrowing && isHighCount) return "DOMINANT";
  if (!isGrowing && isHighCount) return "FADING";
  return "NICHE";
}

export function computeMedianTotal(skills: SkillGapItem[]): number {
  if (skills.length === 0) return 0;
  const sorted = [...skills].map((s) => s.total).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function formatGrowth(growth: number): string {
  const prefix = growth > 0 ? "+" : "";
  return `${prefix}${growth.toFixed(1)}%`;
}

export function sortSkillsByTotal(skills: SkillGapItem[]): SkillGapItem[] {
  return [...skills].sort((a, b) => b.total - a.total);
}
