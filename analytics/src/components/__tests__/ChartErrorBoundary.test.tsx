import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ChartErrorBoundary from "@/components/ChartErrorBoundary";

// Component that throws to trigger the error boundary
function ThrowingComponent({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ChartErrorBoundary", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when no error occurs", () => {
    render(
      <ChartErrorBoundary title="Test Panel">
        <div>Normal content</div>
      </ChartErrorBoundary>
    );
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("shows RENDER ERROR text when a child throws", () => {
    render(
      <ChartErrorBoundary title="Error Panel">
        <ThrowingComponent message="test error" />
      </ChartErrorBoundary>
    );
    expect(screen.getByText("RENDER ERROR")).toBeInTheDocument();
  });

  it("shows the error message when a child throws", () => {
    render(
      <ChartErrorBoundary title="Error Panel">
        <ThrowingComponent message="Something went wrong" />
      </ChartErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows the panel title in error state", () => {
    render(
      <ChartErrorBoundary title="My Chart">
        <ThrowingComponent message="broken" />
      </ChartErrorBoundary>
    );
    expect(screen.getByText("My Chart")).toBeInTheDocument();
  });

  it("does not show children in error state", () => {
    render(
      <ChartErrorBoundary title="Error Panel">
        <ThrowingComponent message="oops" />
      </ChartErrorBoundary>
    );
    // The ThrowingComponent never renders text, but we verify children are gone
    expect(screen.queryByText("Normal content")).not.toBeInTheDocument();
  });
});
