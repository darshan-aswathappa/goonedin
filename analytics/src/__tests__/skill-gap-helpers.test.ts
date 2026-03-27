/**
 * TDD — Pure helper functions for the skill-gap feature
 * RED phase: some tests reveal genuine gaps in @/lib/skill-gap-helpers.
 *
 * Functions under test:
 *   computeQuadrant   — classifies a skill into BREAKOUT | DOMINANT | NICHE | FADING
 *   computeMedianTotal — computes median of the `total` field across a skills array
 *   formatGrowth       — formats a growth % number as a signed string
 *   sortSkillsByTotal  — sorts skills descending by total
 *
 * RED tests (implementation gap):
 *   - computeQuadrant with total=0 should return "NICHE" regardless of growth.
 *     The current implementation returns "BREAKOUT" because it only checks
 *     `total > medianTotal`, not the zero-demand edge case.
 */

import {
  computeQuadrant,
  computeMedianTotal,
  formatGrowth,
  sortSkillsByTotal,
} from "@/lib/skill-gap-helpers";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

interface SkillGapItem {
  skill: string;
  must_have: number;
  good_to_have: number;
  total: number;
  recent: number;
  prior: number;
  growth: number;
}

const makeSkill = (overrides: Partial<SkillGapItem>): SkillGapItem => ({
  skill: "python",
  must_have: 100,
  good_to_have: 50,
  total: 150,
  recent: 80,
  prior: 70,
  growth: 14.3,
  ...overrides,
});

// ---------------------------------------------------------------------------
// computeQuadrant
// ---------------------------------------------------------------------------

describe("computeQuadrant", () => {
  it("returns BREAKOUT for high growth and low total (below or at median)", () => {
    // total=50 <= medianTotal=100, growth=20 > 0
    expect(computeQuadrant(50, 20, 100)).toBe("BREAKOUT");
  });

  it("returns DOMINANT for high growth and high total (above median)", () => {
    // total=150 > medianTotal=100, growth=20 > 0
    expect(computeQuadrant(150, 20, 100)).toBe("DOMINANT");
  });

  it("returns FADING for low growth and high total (above median)", () => {
    // total=150 > medianTotal=100, growth=-5 <= 0
    expect(computeQuadrant(150, -5, 100)).toBe("FADING");
  });

  it("returns NICHE for low growth and low total (below or at median)", () => {
    // total=50 <= medianTotal=100, growth=-5 <= 0
    expect(computeQuadrant(50, -5, 100)).toBe("NICHE");
  });

  it("treats zero growth as low growth — NICHE when total is at or below median", () => {
    // total=100 == medianTotal=100, growth=0
    expect(computeQuadrant(100, 0, 100)).toBe("NICHE");
  });

  it("treats zero growth as low growth — FADING when total is above median", () => {
    // total=101 > medianTotal=100, growth=0
    expect(computeQuadrant(101, 0, 100)).toBe("FADING");
  });

  /**
   * RED: This test exposes an implementation gap.
   *
   * A skill with total=0 (zero job postings) should always be NICHE — it has
   * no market presence regardless of computed growth. The current implementation
   * returns "BREAKOUT" because it only checks `total > medianTotal`, and 0 is
   * not greater than 100, so it falls into the "not high count" + "growing"
   * branch → BREAKOUT. The fix requires an explicit zero-total guard.
   */
  it("returns NICHE when total is zero regardless of growth (RED: implementation gap)", () => {
    expect(computeQuadrant(0, 50, 100)).toBe("NICHE");
  });

  it("returns BREAKOUT when total exactly equals median and growth is positive", () => {
    // total <= median boundary + positive growth → BREAKOUT
    expect(computeQuadrant(100, 1, 100)).toBe("BREAKOUT");
  });

  it("handles very large growth values correctly", () => {
    // Classification is by sign and relative total, not magnitude
    expect(computeQuadrant(200, 999, 100)).toBe("DOMINANT");
  });

  it("handles negative total gracefully without throwing", () => {
    // Defensive: negative totals are nonsensical but must not throw
    expect(() => computeQuadrant(-1, 10, 100)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeMedianTotal
// ---------------------------------------------------------------------------

describe("computeMedianTotal", () => {
  it("returns 0 for an empty array", () => {
    expect(computeMedianTotal([])).toBe(0);
  });

  it("returns the single value for a one-item array", () => {
    const skills = [makeSkill({ total: 42 })];
    expect(computeMedianTotal(skills)).toBe(42);
  });

  it("returns the middle value for an odd-count array", () => {
    // totals: [10, 30, 50] → sorted → median = 30
    const skills = [
      makeSkill({ total: 50 }),
      makeSkill({ total: 10 }),
      makeSkill({ total: 30 }),
    ];
    expect(computeMedianTotal(skills)).toBe(30);
  });

  it("returns the average of the two middle values for an even-count array", () => {
    // totals: [10, 20, 30, 40] → sorted → median = (20+30)/2 = 25
    const skills = [
      makeSkill({ total: 40 }),
      makeSkill({ total: 10 }),
      makeSkill({ total: 20 }),
      makeSkill({ total: 30 }),
    ];
    expect(computeMedianTotal(skills)).toBe(25);
  });

  it("handles identical total values", () => {
    const skills = [
      makeSkill({ total: 100 }),
      makeSkill({ total: 100 }),
      makeSkill({ total: 100 }),
    ];
    expect(computeMedianTotal(skills)).toBe(100);
  });

  it("handles a two-item array (even count boundary)", () => {
    // totals: [80, 120] → median = (80+120)/2 = 100
    const skills = [makeSkill({ total: 80 }), makeSkill({ total: 120 })];
    expect(computeMedianTotal(skills)).toBe(100);
  });

  it("does not mutate the original array", () => {
    const skills = [
      makeSkill({ total: 30 }),
      makeSkill({ total: 10 }),
      makeSkill({ total: 20 }),
    ];
    const originalOrder = skills.map((s) => s.total);
    computeMedianTotal(skills);
    expect(skills.map((s) => s.total)).toEqual(originalOrder);
  });
});

// ---------------------------------------------------------------------------
// formatGrowth
// ---------------------------------------------------------------------------

describe("formatGrowth", () => {
  it("prefixes positive growth with + and formats to one decimal place", () => {
    expect(formatGrowth(14.1)).toBe("+14.1%");
  });

  it("prefixes negative growth with - and formats to one decimal place", () => {
    expect(formatGrowth(-5.2)).toBe("-5.2%");
  });

  it("formats zero growth as 0.0%", () => {
    expect(formatGrowth(0)).toBe("0.0%");
  });

  it("formats 100% growth correctly", () => {
    expect(formatGrowth(100)).toBe("+100.0%");
  });

  it("formats output with exactly one decimal digit", () => {
    // The key contract: always exactly one decimal digit, with sign prefix
    const result = formatGrowth(14.15);
    expect(result).toMatch(/^[+\-]?\d+\.\d%$/);
  });

  it("handles very small positive growth", () => {
    expect(formatGrowth(0.1)).toBe("+0.1%");
  });

  it("handles very small negative growth", () => {
    expect(formatGrowth(-0.1)).toBe("-0.1%");
  });

  it("handles large negative growth", () => {
    expect(formatGrowth(-100)).toBe("-100.0%");
  });
});

// ---------------------------------------------------------------------------
// sortSkillsByTotal
// ---------------------------------------------------------------------------

describe("sortSkillsByTotal", () => {
  it("returns an empty array when given an empty array", () => {
    expect(sortSkillsByTotal([])).toEqual([]);
  });

  it("returns a single-item array with the same skill", () => {
    const skills = [makeSkill({ skill: "python", total: 100 })];
    const result = sortSkillsByTotal(skills);
    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe("python");
  });

  it("sorts skills in descending order by total", () => {
    const skills = [
      makeSkill({ skill: "react", total: 140 }),
      makeSkill({ skill: "python", total: 190 }),
      makeSkill({ skill: "typescript", total: 128 }),
    ];
    const result = sortSkillsByTotal(skills);
    expect(result[0].skill).toBe("python");
    expect(result[1].skill).toBe("react");
    expect(result[2].skill).toBe("typescript");
  });

  it("handles skills with equal totals without throwing", () => {
    const skills = [
      makeSkill({ skill: "a", total: 100 }),
      makeSkill({ skill: "b", total: 100 }),
    ];
    expect(() => sortSkillsByTotal(skills)).not.toThrow();
    expect(sortSkillsByTotal(skills)).toHaveLength(2);
  });

  it("places the highest total first regardless of input order", () => {
    const skills = [
      makeSkill({ total: 10 }),
      makeSkill({ total: 500 }),
      makeSkill({ total: 250 }),
    ];
    const result = sortSkillsByTotal(skills);
    expect(result[0].total).toBe(500);
    expect(result[result.length - 1].total).toBe(10);
  });

  it("does not mutate the original array", () => {
    const skills = [
      makeSkill({ skill: "b", total: 50 }),
      makeSkill({ skill: "a", total: 100 }),
    ];
    const originalFirstSkill = skills[0].skill;
    sortSkillsByTotal(skills);
    expect(skills[0].skill).toBe(originalFirstSkill);
  });
});
