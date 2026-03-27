import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import TitleKeywordsPanel from "@/components/TitleKeywordsPanel";

const mockData = [
  { word: "Senior", count: 120 },
  { word: "Engineer", count: 95 },
  { word: "Manager", count: 78 },
  { word: "Lead", count: 64 },
  { word: "Staff", count: 42 },
];

// Mock ResizeObserver — not available in jsdom
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

beforeAll(() => {
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
  // Mock canvas getContext for layoutWords (uses offscreen canvas)
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    measureText: jest.fn(() => ({ width: 60 })),
    font: "",
    fillText: jest.fn(),
    fillStyle: "",
    globalAlpha: 1,
    textBaseline: "",
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    translate: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    shadowColor: "",
    shadowBlur: 0,
  })) as any;
});

describe("TitleKeywordsPanel", () => {
  it("renders the panel header with 'Top Job Titles'", () => {
    const { getByText } = render(<TitleKeywordsPanel data={mockData} />);
    expect(getByText("Top Job Titles")).toBeInTheDocument();
  });

  it("renders the canvas element for word cloud", () => {
    const { container } = render(<TitleKeywordsPanel data={mockData} />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });

  it("renders the canvas container with correct height style for sizing", () => {
    const { container } = render(<TitleKeywordsPanel data={mockData} />);
    // The container div that holds the canvas must have height: calc(100% - 37px)
    // so the canvas has an explicit parent height on all viewport sizes
    const canvasContainer = container.querySelector(
      "[data-testid='title-keywords-canvas-container']",
    );
    expect(canvasContainer).toBeInTheDocument();
    expect(canvasContainer).toHaveStyle({ height: "calc(100% - 37px)" });
  });

  it("renders the panel with height: 100% so grid parent controls its size", () => {
    const { container } = render(<TitleKeywordsPanel data={mockData} />);
    const panel = container.querySelector(".panel");
    expect(panel).toHaveStyle({ height: "100%" });
  });

  it("renders without crashing on empty data", () => {
    expect(() => render(<TitleKeywordsPanel data={[]} />)).not.toThrow();
  });
});
