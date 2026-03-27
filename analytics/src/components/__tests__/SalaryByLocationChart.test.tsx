import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SalaryByLocationChart from "@/components/SalaryByLocationChart";

// Recharts uses ResizeObserver — mock it for jsdom
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

const mockCities = [
  { city: "San Francisco, CA", median: 185000, count: 42 },
  { city: "New York, NY", median: 172000, count: 38 },
  { city: "Seattle, WA", median: 162000, count: 31 },
];

describe("SalaryByLocationChart", () => {
  it("renders the panel header", () => {
    render(<SalaryByLocationChart cities={mockCities} />);
    expect(screen.getByText(/Salary/)).toBeInTheDocument();
  });

  it("shows the city count", () => {
    render(<SalaryByLocationChart cities={mockCities} />);
    expect(screen.getByText("3 CITIES")).toBeInTheDocument();
  });

  it("renders with a direct height-constrained chart body (no flex:1 wrapper)", () => {
    const { container } = render(<SalaryByLocationChart cities={mockCities} />);
    const body = container.querySelector("[data-testid='salary-chart-body']");
    expect(body).toBeInTheDocument();
    // Body should have explicit height, not rely on flex:1 child chain
    expect(body).toHaveStyle({ height: "calc(100% - 37px)" });
  });

  it("does not render an intermediate flex:1 div wrapping the chart", () => {
    const { container } = render(<SalaryByLocationChart cities={mockCities} />);
    const body = container.querySelector("[data-testid='salary-chart-body']");
    // The body's direct first child should NOT be a div with flex:1 style —
    // it should be the recharts responsive container div
    const firstChild = body?.firstElementChild as HTMLElement | null;
    expect(firstChild?.style?.flex).not.toBe("1");
  });

  it("renders with an empty cities array without crashing", () => {
    expect(() => render(<SalaryByLocationChart cities={[]} />)).not.toThrow();
  });

  it("renders the panel with height:100% for grid parent sizing", () => {
    const { container } = render(<SalaryByLocationChart cities={mockCities} />);
    const panel = container.querySelector(".panel");
    expect(panel).toHaveStyle({ height: "100%" });
  });
});
