import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import EmptyPanel from "@/components/EmptyPanel";

describe("EmptyPanel", () => {
  it("renders title in panel-header", () => {
    render(<EmptyPanel title="Skills Distribution" />);
    expect(screen.getByText("Skills Distribution")).toBeInTheDocument();
  });

  it("renders default message when no message prop given", () => {
    render(<EmptyPanel title="Test Panel" />);
    expect(screen.getByText("No data available yet")).toBeInTheDocument();
  });

  it("renders default suggestion when no suggestion prop given", () => {
    render(<EmptyPanel title="Test Panel" />);
    expect(
      screen.getByText("Data will appear here once jobs are collected and analyzed.")
    ).toBeInTheDocument();
  });

  it("renders custom message", () => {
    render(<EmptyPanel title="Test Panel" message="Custom message here" />);
    expect(screen.getByText("Custom message here")).toBeInTheDocument();
  });

  it("renders custom suggestion", () => {
    render(<EmptyPanel title="Test Panel" suggestion="Try adding more jobs first." />);
    expect(screen.getByText("Try adding more jobs first.")).toBeInTheDocument();
  });

  it("renders 3 animated dot elements", () => {
    const { container } = render(<EmptyPanel title="Test Panel" />);
    // The dots container has display flex with 3 child divs that have borderRadius 50%
    const dotsContainer = container.querySelector('[style*="borderRadius: \\"50%\\""]');
    // Query all divs that have the animation style with empty-pulse
    const allDivs = container.querySelectorAll("div");
    const dotDivs = Array.from(allDivs).filter((d) => {
      const style = d.getAttribute("style") ?? "";
      return style.includes("empty-pulse");
    });
    expect(dotDivs).toHaveLength(3);
  });
});
