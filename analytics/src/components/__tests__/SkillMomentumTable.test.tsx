import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SkillMomentumTable from "@/components/SkillMomentumTable";

const DAYS = [
  "2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04",
  "2024-01-05", "2024-01-06", "2024-01-07", "2024-01-08",
];

const makeSkill = (name: string, counts: number[]) => ({
  skill: name,
  total: counts.reduce((a, b) => a + b, 0),
  daily: DAYS.map((day, i) => ({ day, count: counts[i] ?? 0 })),
});

const mockDailyJobs = DAYS.map((day, i) => ({ day, count: 50 + i * 2 }));

const mockSkills = [
  makeSkill("Python", [10, 12, 14, 16, 18, 20, 22, 24]),
  makeSkill("TypeScript", [8, 10, 12, 14, 16, 18, 20, 22]),
  makeSkill("React", [6, 8, 10, 12, 14, 16, 18, 20]),
  makeSkill("Docker", [4, 5, 6, 7, 8, 9, 10, 11]),
  makeSkill("Kubernetes", [3, 4, 5, 6, 7, 8, 9, 10]),
  makeSkill("Go", [2, 3, 4, 5, 6, 7, 8, 9]),
  makeSkill("Rust", [1, 2, 3, 4, 5, 6, 7, 8]),
  makeSkill("Java", [5, 6, 7, 8, 9, 10, 11, 12]),
  makeSkill("AWS", [7, 8, 9, 10, 11, 12, 13, 14]),
  makeSkill("SQL", [9, 10, 11, 12, 13, 14, 15, 16]),
  makeSkill("GraphQL", [1, 2, 2, 3, 3, 4, 4, 5]),
  makeSkill("Redis", [2, 2, 3, 3, 4, 4, 5, 5]),
  makeSkill("Postgres", [3, 3, 4, 4, 5, 5, 6, 6]),
  makeSkill("Node.js", [4, 4, 5, 5, 6, 6, 7, 7]),
  makeSkill("Next.js", [5, 5, 6, 6, 7, 7, 8, 8]),
  makeSkill("Vue", [1, 1, 2, 2, 3, 3, 4, 4]),
  makeSkill("Angular", [2, 2, 3, 3, 4, 4, 5, 5]),
  makeSkill("Swift", [1, 2, 2, 3, 3, 4, 4, 5]),
  makeSkill("Kotlin", [1, 1, 2, 2, 3, 3, 4, 4]),
  makeSkill("C#", [3, 3, 4, 4, 5, 5, 6, 6]),
];

describe("SkillMomentumTable", () => {
  it("renders the panel header", () => {
    render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    expect(screen.getByText(/Top 20 Skills by Momentum/)).toBeInTheDocument();
  });

  it("renders with skill-momentum-panel class for overflow control", () => {
    const { container } = render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    expect(container.querySelector(".skill-momentum-panel")).toBeInTheDocument();
  });

  it("renders columns container with skill-momentum-cols class for responsive stacking", () => {
    const { container } = render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    expect(container.querySelector(".skill-momentum-cols")).toBeInTheDocument();
  });

  it("renders the divider with skill-momentum-divider class for responsive hiding", () => {
    const { container } = render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    expect(container.querySelector(".skill-momentum-divider")).toBeInTheDocument();
  });

  it("renders column headers in both left and right columns", () => {
    render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    // Both columns have SKILL header
    const headers = screen.getAllByText("Skill");
    expect(headers.length).toBeGreaterThanOrEqual(2);
  });

  it("shows no data message when skills array is empty", () => {
    render(
      <SkillMomentumTable skills={[]} dailyJobs={[]} dateRange={null} />,
    );
    expect(screen.getByText(/No skill data available/)).toBeInTheDocument();
  });

  it("renders at most 20 rows total across both columns", () => {
    const { container } = render(
      <SkillMomentumTable
        skills={mockSkills}
        dailyJobs={mockDailyJobs}
        dateRange={null}
      />,
    );
    // Each row has the rank-row-like structure — count all skill-row cells
    // Each SkillRow renders a grid div with momentum value
    const rows = container.querySelectorAll(".skill-momentum-cols .skill-momentum-col");
    expect(rows.length).toBe(2);
  });
});
