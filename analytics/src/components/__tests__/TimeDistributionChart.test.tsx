import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import TimeDistributionChart from "@/components/TimeDistributionChart";

// Mock fetch for hourly-by-day endpoint
beforeAll(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: false } as Response)
  );

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

const mockFallback = [
  { hour: 9, count: 42 },
  { hour: 10, count: 58 },
  { hour: 14, count: 35 },
  { hour: 15, count: 28 },
];

describe("TimeDistributionChart", () => {
  it("renders the panel header with chart title", () => {
    render(<TimeDistributionChart fallbackData={mockFallback} />);
    expect(screen.getByText("Posting Times by Day")).toBeInTheDocument();
  });

  it("renders all 8 day-filter buttons (All + Mon–Sun)", () => {
    render(<TimeDistributionChart fallbackData={mockFallback} />);
    const buttons = ["All", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    buttons.forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("renders filter buttons in a scrollable overflow container for mobile", () => {
    const { container } = render(
      <TimeDistributionChart fallbackData={mockFallback} />,
    );
    const filterRow = container.querySelector(".time-filter-row");
    expect(filterRow).toBeInTheDocument();
  });

  it("renders title in a panel-header-title span to prevent text wrapping on mobile", () => {
    const { container } = render(
      <TimeDistributionChart fallbackData={mockFallback} />,
    );
    const titleSpan = container.querySelector(".panel-header-title");
    expect(titleSpan).toBeInTheDocument();
    expect(titleSpan?.textContent).toBe("Posting Times by Day");
  });

  it("renders panel with height:100% for grid parent sizing", () => {
    const { container } = render(
      <TimeDistributionChart fallbackData={mockFallback} />,
    );
    const panel = container.querySelector(".panel");
    expect(panel).toHaveStyle({ height: "100%" });
  });

  it("renders chart body container for explicit height anchoring", () => {
    const { container } = render(
      <TimeDistributionChart fallbackData={mockFallback} />,
    );
    const body = container.querySelector(".panel-body-chart");
    expect(body).toBeInTheDocument();
  });

  it("renders with empty fallbackData without crashing", () => {
    expect(() =>
      render(<TimeDistributionChart fallbackData={[]} />),
    ).not.toThrow();
  });
});
