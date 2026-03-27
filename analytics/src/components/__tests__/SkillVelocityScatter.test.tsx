/**
 * TDD — SkillVelocityScatter component
 *
 * Tests a 2-axis scatter plot (total vs growth) with four quadrant labels:
 * BREAKOUT, DOMINANT, NICHE, FADING.
 *
 * Structural notes from reading the component:
 *   - Title: "Skill Velocity Matrix"
 *   - Subtitle: "14D GROWTH vs TOTAL DEMAND"
 *   - Insufficient data guard: when skills.length < 3, the chart renders
 *     "INSUFFICIENT DATA" instead of the scatter chart.
 *   - Quadrant labels are aria-hidden divs overlaid on the chart area.
 *     They appear in the DOM and can be queried; screen readers skip them.
 *   - Date range footer shows a formatted string like:
 *       "VELOCITY WINDOW: 01/01 — 01/28"
 *     (month/day slice, not the full year)
 *   - The scatter chart renders a Recharts ResponsiveContainer → SVG in jsdom.
 *
 * RED tests (implementation gaps):
 *   - "renders an empty state message for empty array" — the component currently
 *     shows "INSUFFICIENT DATA" only for < 3 skills. An empty array (0 items)
 *     triggers the same guard. The test verifies the correct message text.
 *   - "does not render SVG when skills is empty" — verifies the chart branch
 *     is fully suppressed, not just hidden.
 *   - "renders date range showing formatted window" — the dateRange prop is
 *     rendered as a footer with year stripped. Test asserts footer presence
 *     via the "VELOCITY WINDOW" prefix which is always present.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SkillVelocityScatter from "@/components/SkillVelocityScatter";

// ---------------------------------------------------------------------------
// ResizeObserver polyfill (required by Recharts in jsdom)
// ---------------------------------------------------------------------------

beforeAll(() => {
  class MockResizeObserver {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
});

// ---------------------------------------------------------------------------
// Fixtures
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

const mockSkills: SkillGapItem[] = [
  {
    skill: "python",
    must_have: 145,
    good_to_have: 45,
    total: 190,
    recent: 89,
    prior: 78,
    growth: 14.1,
  },
  {
    skill: "typescript",
    must_have: 98,
    good_to_have: 30,
    total: 128,
    recent: 60,
    prior: 70,
    growth: -14.3,
  },
  {
    skill: "react",
    must_have: 80,
    good_to_have: 60,
    total: 140,
    recent: 0,
    prior: 0,
    growth: 0,
  },
];

const singleSkill: SkillGapItem[] = [
  {
    skill: "golang",
    must_have: 40,
    good_to_have: 20,
    total: 60,
    recent: 35,
    prior: 28,
    growth: 25,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillVelocityScatter", () => {
  it("renders the panel title containing 'SKILL VELOCITY MATRIX'", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.getByText(/SKILL VELOCITY MATRIX/i)).toBeInTheDocument();
  });

  it("renders the subtitle '14D GROWTH vs TOTAL DEMAND'", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.getByText("14D GROWTH vs TOTAL DEMAND")).toBeInTheDocument();
  });

  it("renders the BREAKOUT quadrant label", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    // aria-hidden divs are in the DOM but skipped by screen readers
    expect(screen.getByText("BREAKOUT")).toBeInTheDocument();
  });

  it("renders the DOMINANT quadrant label", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.getByText("DOMINANT")).toBeInTheDocument();
  });

  it("renders the NICHE quadrant label", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.getByText("NICHE")).toBeInTheDocument();
  });

  it("renders the FADING quadrant label", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.getByText("FADING")).toBeInTheDocument();
  });

  it("renders the Recharts scatter chart container when 3+ skills are present", () => {
    const { container } = render(
      <SkillVelocityScatter skills={mockSkills} dateRange={null} />
    );
    // ResponsiveContainer renders at 0x0 in jsdom so no SVG is produced, but
    // the recharts-responsive-container wrapper div is always present when the
    // chart branch is active. This confirms the chart branch renders, not the
    // fallback "INSUFFICIENT DATA" branch.
    const rechartWrapper = container.querySelector(
      ".recharts-responsive-container"
    );
    expect(rechartWrapper).toBeInTheDocument();
  });

  it("shows 'INSUFFICIENT DATA' when skills array is empty", () => {
    render(<SkillVelocityScatter skills={[]} dateRange={null} />);
    expect(screen.getByText("INSUFFICIENT DATA")).toBeInTheDocument();
  });

  it("does not render the recharts chart container when skills array is empty", () => {
    const { container } = render(
      <SkillVelocityScatter skills={[]} dateRange={null} />
    );
    // When skills < 3 the fallback branch renders — no ResponsiveContainer mounts
    const rechartWrapper = container.querySelector(
      ".recharts-responsive-container"
    );
    expect(rechartWrapper).not.toBeInTheDocument();
  });

  it("shows 'INSUFFICIENT DATA' when only one skill is provided (< 3 threshold)", () => {
    render(<SkillVelocityScatter skills={singleSkill} dateRange={null} />);
    expect(screen.getByText("INSUFFICIENT DATA")).toBeInTheDocument();
  });

  it("renders the date range footer when dateRange is provided", () => {
    render(
      <SkillVelocityScatter
        skills={mockSkills}
        dateRange={{ start: "2025-01-01", end: "2025-01-28" }}
      />
    );
    // Footer always starts with "VELOCITY WINDOW:"
    expect(screen.getByText(/VELOCITY WINDOW/i)).toBeInTheDocument();
  });

  it("formats the date range as MM/DD — MM/DD (year stripped)", () => {
    render(
      <SkillVelocityScatter
        skills={mockSkills}
        dateRange={{ start: "2025-01-01", end: "2025-01-28" }}
      />
    );
    expect(screen.getByText(/01\/01/)).toBeInTheDocument();
    expect(screen.getByText(/01\/28/)).toBeInTheDocument();
  });

  it("does not render the date range footer when dateRange is null", () => {
    render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />);
    expect(screen.queryByText(/VELOCITY WINDOW/i)).not.toBeInTheDocument();
  });

  it("renders without crashing when dateRange prop is null", () => {
    expect(() =>
      render(<SkillVelocityScatter skills={mockSkills} dateRange={null} />)
    ).not.toThrow();
  });

  it("renders without crashing when all skills have zero growth", () => {
    const flatSkills: SkillGapItem[] = mockSkills.map((s) => ({
      ...s,
      growth: 0,
    }));
    expect(() =>
      render(<SkillVelocityScatter skills={flatSkills} dateRange={null} />)
    ).not.toThrow();
  });

  it("renders without crashing when all skills have the same total", () => {
    const uniformSkills: SkillGapItem[] = mockSkills.map((s) => ({
      ...s,
      total: 100,
    }));
    expect(() =>
      render(<SkillVelocityScatter skills={uniformSkills} dateRange={null} />)
    ).not.toThrow();
  });

  it("renders without crashing when growth values are extreme (very high / very low)", () => {
    const extremeSkills: SkillGapItem[] = [
      { ...mockSkills[0], growth: 10000 },
      { ...mockSkills[1], growth: -10000 },
      { ...mockSkills[2], growth: 5000 },
    ];
    expect(() =>
      render(<SkillVelocityScatter skills={extremeSkills} dateRange={null} />)
    ).not.toThrow();
  });
});
