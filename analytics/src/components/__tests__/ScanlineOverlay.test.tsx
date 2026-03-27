import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import ScanlineOverlay from "@/components/ScanlineOverlay";

describe("ScanlineOverlay", () => {
  it("renders a div with className scanline-overlay", () => {
    const { container } = render(<ScanlineOverlay />);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeInTheDocument();
    expect(div.className).toBe("scanline-overlay");
  });

  it("has aria-hidden set to true", () => {
    const { container } = render(<ScanlineOverlay />);
    const div = container.firstChild as HTMLElement;
    expect(div).toHaveAttribute("aria-hidden", "true");
  });

  it("renders exactly one element", () => {
    const { container } = render(<ScanlineOverlay />);
    expect(container.children).toHaveLength(1);
  });
});
