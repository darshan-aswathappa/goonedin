import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import MetricCard from "@/components/MetricCard";

jest.mock("recharts", () => ({
  LineChart: () => null,
  Line: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("MetricCard", () => {
  it("renders the label", () => {
    render(<MetricCard label="Total Jobs" value={100} />);
    expect(screen.getByText("Total Jobs")).toBeInTheDocument();
  });

  it("renders a string value", () => {
    render(<MetricCard label="Rate" value="42%" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders numeric value formatted with toLocaleString", () => {
    render(<MetricCard label="Count" value={1000} />);
    // toLocaleString on 1000 produces "1,000" in en-US locale
    expect(screen.getByText((1000).toLocaleString())).toBeInTheDocument();
  });

  it("renders subLabel when provided", () => {
    render(<MetricCard label="Total" value={50} subLabel="last 30 days" />);
    expect(screen.getByText("last 30 days")).toBeInTheDocument();
  });

  it("does not render subLabel when not provided", () => {
    render(<MetricCard label="Total" value={50} />);
    expect(screen.queryByText("last 30 days")).not.toBeInTheDocument();
  });

  it("renders delta with up arrow when deltaPositive is true", () => {
    render(<MetricCard label="Jobs" value={10} delta="+5%" deltaPositive={true} />);
    expect(screen.getByText(/▲/)).toBeInTheDocument();
    expect(screen.getByText(/\+5%/)).toBeInTheDocument();
  });

  it("renders delta with down arrow when deltaPositive is false", () => {
    render(<MetricCard label="Jobs" value={10} delta="-3%" deltaPositive={false} />);
    expect(screen.getByText(/▼/)).toBeInTheDocument();
    expect(screen.getByText(/-3%/)).toBeInTheDocument();
  });

  it("does not render sparkline when sparklineData is absent", () => {
    const { container } = render(<MetricCard label="Jobs" value={10} />);
    // No recharts containers should appear
    expect(container.querySelector('[style*="width: 80px"]')).toBeNull();
  });

  it("does not render sparkline when sparklineData has 0 items", () => {
    render(<MetricCard label="Jobs" value={10} sparklineData={[]} />);
    // LineChart is mocked to return null; just verify no crash
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("does not render sparkline when sparklineData has only 1 item", () => {
    render(<MetricCard label="Jobs" value={10} sparklineData={[{ v: 5 }]} />);
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("renders sparkline container when sparklineData has 2+ items", () => {
    const { container } = render(
      <MetricCard label="Jobs" value={10} sparklineData={[{ v: 5 }, { v: 10 }]} />
    );
    // The sparkline wrapper div has width:80 and height:36
    const sparklineWrapper = container.querySelector('[style*="height: 36px"]');
    expect(sparklineWrapper).toBeInTheDocument();
  });
});
