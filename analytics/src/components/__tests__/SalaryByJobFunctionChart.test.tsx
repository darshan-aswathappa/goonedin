import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SalaryByJobFunctionChart from "@/components/SalaryByJobFunctionChart";

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

const mockData = [
  { function: "ML/AI", median: 182000, count: 28, color: "var(--series-4)" },
  { function: "Backend", median: 155000, count: 64, color: "var(--series-2)" },
  { function: "Full Stack", median: 138000, count: 41, color: "var(--series-1)" },
  { function: "Frontend", median: 122000, count: 33, color: "var(--series-3)" },
  { function: "General SW", median: 119000, count: 87, color: "var(--muted)" },
];

describe("SalaryByJobFunctionChart", () => {
  it("renders the panel header", () => {
    render(<SalaryByJobFunctionChart data={mockData} />);
    expect(screen.getByText(/Salary by Function/i)).toBeInTheDocument();
  });

  it("shows the function count badge", () => {
    render(<SalaryByJobFunctionChart data={mockData} />);
    expect(screen.getByText("5 FUNCTIONS")).toBeInTheDocument();
  });

  it("renders the chart body with correct height for Recharts sizing", () => {
    const { container } = render(<SalaryByJobFunctionChart data={mockData} />);
    const body = container.querySelector("[data-testid='salary-by-fn-body']");
    expect(body).toBeInTheDocument();
    expect(body).toHaveStyle({ height: "calc(100% - 37px)" });
  });

  it("renders with height:100% for grid parent sizing", () => {
    const { container } = render(<SalaryByJobFunctionChart data={mockData} />);
    const panel = container.querySelector(".panel");
    expect(panel).toHaveStyle({ height: "100%" });
  });

  it("renders without crashing when given empty data", () => {
    expect(() => render(<SalaryByJobFunctionChart data={[]} />)).not.toThrow();
  });

  it("shows '0 FUNCTIONS' badge when data is empty", () => {
    render(<SalaryByJobFunctionChart data={[]} />);
    expect(screen.getByText("0 FUNCTIONS")).toBeInTheDocument();
  });

  it("renders a single function without crashing", () => {
    const single = [{ function: "Backend", median: 150000, count: 5, color: "var(--series-2)" }];
    expect(() => render(<SalaryByJobFunctionChart data={single} />)).not.toThrow();
  });
});
