import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import TabNav from "@/components/TabNav";

describe("TabNav – keyboard navigation", () => {
  it("marks the active tab with aria-selected=true", () => {
    render(<TabNav active="market" onChange={jest.fn()} />);
    expect(screen.getByRole("tab", { name: /market/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /skills/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("calls onChange with the next tab id on ArrowRight", () => {
    const onChange = jest.fn();
    render(<TabNav active="market" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /market/i }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("skills");
  });

  it("calls onChange with the previous tab id on ArrowLeft", () => {
    const onChange = jest.fn();
    render(<TabNav active="skills" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /skills/i }), {
      key: "ArrowLeft",
    });
    expect(onChange).toHaveBeenCalledWith("market");
  });

  it("wraps from the first tab to the last on ArrowLeft", () => {
    const onChange = jest.fn();
    render(<TabNav active="market" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /market/i }), {
      key: "ArrowLeft",
    });
    // Last tab is "geo" (LOCATIONS)
    expect(onChange).toHaveBeenCalledWith("geo");
  });

  it("wraps from the last tab to the first on ArrowRight", () => {
    const onChange = jest.fn();
    render(<TabNav active="geo" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /locations/i }), {
      key: "ArrowRight",
    });
    expect(onChange).toHaveBeenCalledWith("market");
  });
});
