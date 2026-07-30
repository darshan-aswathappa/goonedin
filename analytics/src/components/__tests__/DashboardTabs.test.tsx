import "@testing-library/jest-dom";
import { render, screen, act, fireEvent } from "@testing-library/react";
import DashboardTabs from "@/components/DashboardTabs";

// Mock all chart/data components to avoid SVG/canvas measurement issues in jsdom
jest.mock("@/components/JobVolumeChart", () => () => <div data-testid="job-volume-chart" />);
jest.mock("@/components/CompanyLeaderboard", () => () => <div data-testid="company-leaderboard" />);
jest.mock("@/components/SkillsFrequency", () => () => <div data-testid="skills-frequency" />);
jest.mock("@/components/SoftSkillsPanel", () => () => <div data-testid="soft-skills-panel" />);
jest.mock("@/components/GoodToHavePanel", () => () => <div data-testid="good-to-have" />);
jest.mock("@/components/PostingHeatmap", () => () => <div data-testid="posting-heatmap" />);
jest.mock("@/components/LocationChart", () => () => <div data-testid="location-chart" />);
jest.mock("@/components/VisaStats", () => () => <div data-testid="visa-stats" />);
jest.mock("@/components/IntelPanel", () => () => <div data-testid="intel-panel" />);
jest.mock("@/components/SalaryChart", () => () => <div data-testid="salary-chart" />);
jest.mock("@/components/SeniorityChart", () => () => <div data-testid="seniority-chart" />);
jest.mock("@/components/WeekdayChart", () => () => <div data-testid="weekday-chart" />);
jest.mock("@/components/TitleKeywordsPanel", () => () => <div data-testid="title-keywords" />);
jest.mock("@/components/JobFunctionsChart", () => () => <div data-testid="job-functions" />);
jest.mock("@/components/HiringVelocityChart", () => () => <div data-testid="hiring-velocity" />);
jest.mock("@/components/QueueHealth", () => () => <div data-testid="queue-health" />);
jest.mock("@/components/SkillCooccurrence", () => () => <div data-testid="skill-cooccurrence" />);
jest.mock("@/components/TimeDistributionChart", () => () => <div data-testid="time-distribution" />);
jest.mock("@/components/SkillMomentumTable", () => () => <div data-testid="skill-momentum" />);
jest.mock("@/components/ExperienceDistribution", () => () => <div data-testid="experience-dist" />);
jest.mock("@/components/SalaryByLocationChart", () => () => <div data-testid="salary-by-location" />);
jest.mock("@/components/SalaryByJobFunctionChart", () => () => <div data-testid="salary-by-function" />);
jest.mock("@/components/SkillDemandBar", () => () => <div data-testid="skill-demand-bar" />);
jest.mock("@/components/SkillVelocityScatter", () => () => <div data-testid="skill-velocity-scatter" />);
jest.mock("@/components/MetricCard", () => () => <div data-testid="metric-card" />);
jest.mock("@/components/SafePanel", () => ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div data-testid={`safe-panel-${title}`}>{children}</div>
));

const SWITCH_TAB_EVENT = "dashboard:switchtab";

const fullProps = {
  overview: {
    total: 1000,
    analyzed: 800,
    completionRate: 80,
    uniqueCompanies: 50,
    avgJobsPerDay: 33,
    jobs30d: 990,
  },
  companies: {
    topCompanies: [{ company: "Acme Corp", count: 100 }],
    hourlyDistribution: [{ hour: 9, count: 50 }],
  },
  skills: {
    techSkills: [{ keyword: "Python", count: 500 }],
    softSkills: [{ skill: "Communication", count: 200 }],
    goodToHave: [{ keyword: "Docker", count: 100 }],
    cooccurrencePairs: [{ a: "Python", b: "SQL", count: 50 }],
  },
  timeline: { timeline: [{ day: "2026-03-01", count: 30 }] },
  locations: { locations: [{ city: "San Francisco", count: 200 }] },
  visa: {
    visa: [{ label: "H-1B", count: 100, color: "var(--teal)" }],
    total: 200,
    sponsorshipRate: 50,
  },
  salary: {
    buckets: [{ label: "$100k-$150k", count: 50 }],
    listedRate: 40,
    listedCount: 400,
    medianEstimate: 125000,
  },
  seniority: {
    seniority: [{ level: "Senior", count: 200, color: "var(--teal)" }],
    titleKeywords: [{ word: "Engineer", count: 500 }],
    jobFunctions: [{ function: "Engineering", count: 400, color: "var(--teal)" }],
  },
  weekday: { weekday: [{ day: "Monday", count: 100 }], peakDay: "Monday" },
  queue: {
    completed: 800,
    failed: 10,
    pending: 190,
    total: 1000,
    successRate: 80,
    withVisa: 100,
    withSalary: 400,
    analyzedCount: 800,
  },
  skillMomentum: {
    skills: [{ skill: "Python", total: 500, daily: [{ day: "2026-03-01", count: 30 }] }],
    dailyJobs: [{ day: "2026-03-01", count: 30 }],
    dateRange: { start: "2026-03-01", end: "2026-03-27" },
  },
  experience: {
    distribution: [{ label: "3-5 years", count: 200 }],
    matched: 200,
    total: 1000,
    matchRate: 20,
  },
  salaryByLocation: { cities: [{ city: "San Francisco", median: 150000, count: 50 }] },
  hiringVelocity: {
    companies: [{ name: "Acme Corp", color: "var(--teal)" }],
    data: [{ day: "2026-03-01", "Acme Corp": 5 }],
  },
  salaryByFunction: {
    functions: [{ function: "Full Stack", median: 140000, count: 50, color: "var(--teal)" }],
  },
  skillGap: {
    skills: [
      { skill: "python", must_have: 145, good_to_have: 45, total: 190, recent: 89, prior: 78, growth: 14.1 },
    ],
    dateRange: { start: "2026-02-27", end: "2026-03-27" },
  },
};

const defaultProps = {
  overview: null,
  companies: null,
  skills: null,
  timeline: null,
  locations: null,
  visa: null,
  salary: null,
  seniority: null,
  weekday: null,
  queue: null,
  skillMomentum: null,
  experience: null,
  salaryByLocation: null,
  hiringVelocity: null,
  salaryByFunction: null,
  skillGap: null,
};

describe("DashboardTabs – tab switching via custom event", () => {
  it("defaults to the market tab on initial render", () => {
    render(<DashboardTabs {...defaultProps} />);
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches to the skills tab when dashboard:switchtab fires with 'skills'", () => {
    render(<DashboardTabs {...defaultProps} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SWITCH_TAB_EVENT, { detail: "skills" })
      );
    });
    expect(screen.getByRole("tab", { name: /skills/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("switches to the companies tab when dashboard:switchtab fires with 'companies'", () => {
    render(<DashboardTabs {...defaultProps} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SWITCH_TAB_EVENT, { detail: "companies" })
      );
    });
    expect(screen.getByRole("tab", { name: /companies/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches to the pipeline tab when dashboard:switchtab fires with 'pipeline'", () => {
    render(<DashboardTabs {...defaultProps} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SWITCH_TAB_EVENT, { detail: "pipeline" })
      );
    });
    expect(screen.getByRole("tab", { name: /postings/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches to the geo tab when dashboard:switchtab fires with 'geo'", () => {
    render(<DashboardTabs {...defaultProps} />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SWITCH_TAB_EVENT, { detail: "geo" })
      );
    });
    expect(screen.getByRole("tab", { name: /locations/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("removes the event listener on unmount (no state-update warning)", () => {
    const { unmount } = render(<DashboardTabs {...defaultProps} />);
    unmount();
    // Dispatching after unmount should not throw or warn
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SWITCH_TAB_EVENT, { detail: "skills" })
      );
    });
  });
});

describe("DashboardTabs – data-present branches (chart components rendered)", () => {
  it("renders market tab charts when timeline and weekday data exist", () => {
    render(<DashboardTabs {...fullProps} />);
    expect(screen.getByTestId("job-volume-chart")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-chart")).toBeInTheDocument();
  });

  it("renders skills tab charts when all skills data exists", () => {
    render(<DashboardTabs {...fullProps} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "skills" }));
    });
    expect(screen.getByTestId("skills-frequency")).toBeInTheDocument();
    expect(screen.getByTestId("good-to-have")).toBeInTheDocument();
    expect(screen.getByTestId("soft-skills-panel")).toBeInTheDocument();
    expect(screen.getByTestId("skill-cooccurrence")).toBeInTheDocument();
    expect(screen.getByTestId("skill-momentum")).toBeInTheDocument();
  });

  it("renders companies tab charts when company data exists", () => {
    render(<DashboardTabs {...fullProps} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "companies" }));
    });
    expect(screen.getByTestId("company-leaderboard")).toBeInTheDocument();
    expect(screen.getByTestId("intel-panel")).toBeInTheDocument();
    expect(screen.getByTestId("queue-health")).toBeInTheDocument();
  });

  it("renders pipeline tab charts when seniority, salary and experience data exist", () => {
    render(<DashboardTabs {...fullProps} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "pipeline" }));
    });
    expect(screen.getByTestId("seniority-chart")).toBeInTheDocument();
    expect(screen.getByTestId("experience-dist")).toBeInTheDocument();
    expect(screen.getByTestId("job-functions")).toBeInTheDocument();
    expect(screen.getByTestId("salary-chart")).toBeInTheDocument();
    expect(screen.getByTestId("title-keywords")).toBeInTheDocument();
  });

  it("renders geo tab charts when location, visa and salary-by-location data exist", () => {
    render(<DashboardTabs {...fullProps} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "geo" }));
    });
    expect(screen.getByTestId("location-chart")).toBeInTheDocument();
    expect(screen.getByTestId("visa-stats")).toBeInTheDocument();
    expect(screen.getByTestId("salary-by-location")).toBeInTheDocument();
  });

  it("keeps visited tab mounted but hidden when switching to another tab", () => {
    render(<DashboardTabs {...fullProps} />);
    // Visit skills, companies, pipeline, geo — then return to market
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "skills" }));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "companies" }));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "pipeline" }));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "geo" }));
    });
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "market" }));
    });
    // Market tab is active
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    // All previously visited tab content is still mounted (kept alive)
    expect(screen.getByTestId("skills-frequency")).toBeInTheDocument();
    expect(screen.getByTestId("company-leaderboard")).toBeInTheDocument();
    expect(screen.getByTestId("seniority-chart")).toBeInTheDocument();
    expect(screen.getByTestId("visa-stats")).toBeInTheDocument();
  });

  it("renders EmptyPanel for experience when all distribution counts are zero", () => {
    const props = {
      ...fullProps,
      experience: {
        distribution: [{ label: "3-5 years", count: 0 }],
        matched: 0,
        total: 1000,
        matchRate: 0,
      },
    };
    render(<DashboardTabs {...props} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "pipeline" }));
    });
    expect(screen.queryByTestId("experience-dist")).not.toBeInTheDocument();
  });
});

describe("DashboardTabs – edge case branches", () => {
  it("ignores dashboard:switchtab event when detail is an empty string", () => {
    render(<DashboardTabs {...defaultProps} />);
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "" }));
    });
    // Active tab should remain 'market'
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("does not recreate visitedTabs Set when the active tab is dispatched again", () => {
    render(<DashboardTabs {...defaultProps} />);
    // 'market' is in the initial Set — dispatching it again hits the early-return branch
    act(() => {
      window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: "market" }));
    });
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches tab via direct click on TabNav", () => {
    render(<DashboardTabs {...defaultProps} />);
    fireEvent.click(screen.getByRole("tab", { name: /skills/i }));
    expect(screen.getByRole("tab", { name: /skills/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});
