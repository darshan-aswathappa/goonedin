import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SalaryChart from "@/components/SalaryChart";

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

const mockBuckets = [
  { label: "$40K–$60K", count: 8 },
  { label: "$60K–$80K", count: 22 },
  { label: "$80K–$100K", count: 41 },
  { label: "$100K–$120K", count: 35 },
  { label: "$120K–$150K", count: 18 },
  { label: "$150K+", count: 9 },
];

describe("SalaryChart", () => {
  it("renders the Salary Distribution header", () => {
    render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={98000}
      />,
    );
    expect(screen.getByText("Salary Distribution")).toBeInTheDocument();
  });

  it("shows the listed rate percentage", () => {
    render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={98000}
      />,
    );
    expect(screen.getByText("42% SHOW SALARY")).toBeInTheDocument();
  });

  it("shows median salary stat when medianEstimate is provided", () => {
    render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={98000}
      />,
    );
    expect(screen.getByText("$98K")).toBeInTheDocument();
  });

  it("does not show salary stat when medianEstimate is null", () => {
    render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={null}
      />,
    );
    expect(screen.queryByText("MEDIAN SALARY")).not.toBeInTheDocument();
  });

  it("renders with data-testid=salary-dist-body container for height anchoring", () => {
    const { container } = render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={null}
      />,
    );
    const body = container.querySelector("[data-testid='salary-dist-body']");
    expect(body).toBeInTheDocument();
  });

  it("renders the panel with height:100% for grid parent sizing", () => {
    const { container } = render(
      <SalaryChart
        buckets={mockBuckets}
        listedRate={42}
        listedCount={133}
        medianEstimate={null}
      />,
    );
    const panel = container.querySelector(".panel");
    expect(panel).toHaveStyle({ height: "100%" });
  });

  it("renders with empty buckets without crashing", () => {
    expect(() =>
      render(
        <SalaryChart
          buckets={[]}
          listedRate={0}
          listedCount={0}
          medianEstimate={null}
        />,
      ),
    ).not.toThrow();
  });
});
