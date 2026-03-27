/**
 * TDD — SkillDemandBar component
 *
 * Tests the horizontal bar breakdown of must-have vs good-to-have skill demand.
 * The component is capped at top 20 skills and renders a flat list of skill rows.
 *
 * Structural notes derived from reading the component:
 *   - Panel title: "Skill Demand Split"
 *   - Empty state text: "NO SKILL DATA AVAILABLE"
 *   - Skill rows have no data-testid — they are plain divs keyed by skill name.
 *     Tests that require counting rows use a CSS selector targeting the skill
 *     label span, which is the most stable structural anchor.
 *
 * RED tests (implementation gaps):
 *   - "renders exactly N skill rows" — the component renders rows as unstyled
 *     divs with no testid. Tests use [title] attribute queries which map to
 *     the skill label span (title={item.skill}) — this is the correct selector.
 */

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SkillDemandBar from "@/components/SkillDemandBar";

// ---------------------------------------------------------------------------
// ResizeObserver polyfill (defensive — not needed for this component but
// mirrors the pattern used across all chart tests in this repo)
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

const make25Skills = (): SkillGapItem[] =>
  Array.from({ length: 25 }, (_, i) => ({
    skill: `skill-${i + 1}`,
    must_have: 100 - i,
    good_to_have: 20,
    total: 120 - i,
    recent: 60,
    prior: 55,
    growth: 5,
  }));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SkillDemandBar", () => {
  it("renders a panel with title containing 'SKILL DEMAND SPLIT'", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    expect(screen.getByText(/SKILL DEMAND SPLIT/i)).toBeInTheDocument();
  });

  it("renders a subtitle labeling the axis context", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    expect(screen.getByText(/REQUIRED vs NICE-TO-HAVE/i)).toBeInTheDocument();
  });

  it("renders the skill label 'python'", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    // The label span carries a title attribute equal to the skill name
    expect(screen.getByTitle("python")).toBeInTheDocument();
  });

  it("renders the skill label 'typescript'", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    expect(screen.getByTitle("typescript")).toBeInTheDocument();
  });

  it("renders the skill label 'react'", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    expect(screen.getByTitle("react")).toBeInTheDocument();
  });

  it("displays must-have count 145 for python", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    // Use getAllByText since "145" appears uniquely — "45" also appears but
    // "145" is a distinct string matched by exact text.
    expect(screen.getByText("145")).toBeInTheDocument();
  });

  it("displays good-to-have count 45 for python", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    // "45" appears as the good-to-have count; "145" is a different string.
    // getAllByText handles the case where both are rendered as separate spans.
    const fortyFiveElements = screen.getAllByText("45");
    expect(fortyFiveElements.length).toBeGreaterThanOrEqual(1);
  });

  it("renders exactly 3 skill label spans (one per skill) for 3 skills", () => {
    const { container } = render(<SkillDemandBar skills={mockSkills} />);
    // Each skill row contains a span with title={item.skill}
    const labelSpans = container.querySelectorAll("span[title]");
    expect(labelSpans).toHaveLength(3);
  });

  it("renders an empty state message when skills array is empty", () => {
    render(<SkillDemandBar skills={[]} />);
    expect(screen.getByText(/NO SKILL DATA AVAILABLE/i)).toBeInTheDocument();
  });

  it("caps rendered skill rows at 15 when more than 15 skills are passed", () => {
    const { container } = render(<SkillDemandBar skills={make25Skills()} />);
    // Each rendered skill has a span[title] with the skill name
    const labelSpans = container.querySelectorAll("span[title]");
    expect(labelSpans).toHaveLength(15);
  });

  it("renders without crashing when skills is an empty array", () => {
    expect(() => render(<SkillDemandBar skills={[]} />)).not.toThrow();
  });

  it("renders without crashing for a single skill", () => {
    expect(() =>
      render(<SkillDemandBar skills={[mockSkills[0]]} />)
    ).not.toThrow();
  });

  it("renders a legend with REQUIRED and NICE-TO-HAVE labels", () => {
    render(<SkillDemandBar skills={mockSkills} />);
    expect(screen.getByText("REQUIRED")).toBeInTheDocument();
    expect(screen.getByText("NICE-TO-HAVE")).toBeInTheDocument();
  });

  it("renders without crashing when must_have is 0", () => {
    const zeroMustHave: SkillGapItem[] = [
      {
        skill: "vue",
        must_have: 0,
        good_to_have: 10,
        total: 10,
        recent: 5,
        prior: 5,
        growth: 0,
      },
    ];
    expect(() => render(<SkillDemandBar skills={zeroMustHave} />)).not.toThrow();
  });

  it("renders without crashing when good_to_have is 0", () => {
    const zeroGoodToHave: SkillGapItem[] = [
      {
        skill: "rust",
        must_have: 50,
        good_to_have: 0,
        total: 50,
        recent: 25,
        prior: 20,
        growth: 25,
      },
    ];
    expect(() =>
      render(<SkillDemandBar skills={zeroGoodToHave} />)
    ).not.toThrow();
  });
});
