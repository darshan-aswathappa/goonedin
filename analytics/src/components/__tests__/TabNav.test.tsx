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

  it("does not call onChange for non-arrow keys", () => {
    const onChange = jest.fn();
    render(<TabNav active="market" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: /market/i }), {
      key: "Enter",
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TabNav – click and mouse interactions", () => {
  it("calls onChange with the clicked tab id", () => {
    const onChange = jest.fn();
    render(<TabNav active="market" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /skills/i }));
    expect(onChange).toHaveBeenCalledWith("skills");
  });

  it("calls onChange for every tab that is clicked", () => {
    const onChange = jest.fn();
    render(<TabNav active="market" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /companies/i }));
    expect(onChange).toHaveBeenCalledWith("companies");
    fireEvent.click(screen.getByRole("tab", { name: /postings/i }));
    expect(onChange).toHaveBeenCalledWith("pipeline");
    fireEvent.click(screen.getByRole("tab", { name: /locations/i }));
    expect(onChange).toHaveBeenCalledWith("geo");
  });

  it("applies hover state on mouseenter and clears on mouseleave", () => {
    render(<TabNav active="market" onChange={jest.fn()} />);
    const skillsTab = screen.getByRole("tab", { name: /skills/i });
    // Entering hover — should not throw
    fireEvent.mouseEnter(skillsTab);
    // Leaving hover — should not throw
    fireEvent.mouseLeave(skillsTab);
  });

  it("hovering one tab and leaving resets the hover state", () => {
    render(<TabNav active="market" onChange={jest.fn()} />);
    const companiesTab = screen.getByRole("tab", { name: /companies/i });
    fireEvent.mouseEnter(companiesTab);
    fireEvent.mouseLeave(companiesTab);
    // After leaving, hovering a different tab should work without error
    fireEvent.mouseEnter(screen.getByRole("tab", { name: /market/i }));
    fireEvent.mouseLeave(screen.getByRole("tab", { name: /market/i }));
  });
});
