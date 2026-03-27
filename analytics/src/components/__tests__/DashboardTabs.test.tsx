import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
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
jest.mock("@/components/MetricCard", () => () => <div data-testid="metric-card" />);
jest.mock("@/components/SafePanel", () => ({ children, title }: { children: React.ReactNode; title: string }) => (
  <div data-testid={`safe-panel-${title}`}>{children}</div>
));

const SWITCH_TAB_EVENT = "dashboard:switchtab";

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
