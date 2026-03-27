import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import SafePanel from "@/components/SafePanel";

function ThrowingComponent(): never {
  throw new Error("child error");
}

describe("SafePanel", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children normally", () => {
    render(
      <SafePanel title="My Panel">
        <div>Child content</div>
      </SafePanel>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows error UI when child throws", () => {
    render(
      <SafePanel title="Broken Panel">
        <ThrowingComponent />
      </SafePanel>
    );
    expect(screen.getByText("RENDER ERROR")).toBeInTheDocument();
  });

  it("shows panel title in error state", () => {
    render(
      <SafePanel title="Broken Panel">
        <ThrowingComponent />
      </SafePanel>
    );
    expect(screen.getByText("Broken Panel")).toBeInTheDocument();
  });

  it("shows error message in error state", () => {
    render(
      <SafePanel title="Broken Panel">
        <ThrowingComponent />
      </SafePanel>
    );
    expect(screen.getByText("child error")).toBeInTheDocument();
  });
});
