import "@testing-library/jest-dom";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { CommandPalette, openCommandPalette } from "@/components/CommandPalette";

// Simplify Radix Dialog so it renders inline when open
jest.mock("@radix-ui/react-dialog", () => ({
  Root: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <>{children}</> : null),
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Overlay: () => null,
  Content: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <div role="dialog" {...rest}>{children}</div>,
  Title: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

const SWITCH_TAB_EVENT = "dashboard:switchtab";

function captureTabEvents(): CustomEvent[] {
  const captured: CustomEvent[] = [];
  const handler = (e: Event) => captured.push(e as CustomEvent);
  window.addEventListener(SWITCH_TAB_EVENT, handler);
  return captured;
}

describe("CommandPalette – navigation commands switch tabs instead of scrolling", () => {
  beforeEach(() => {
    // Ensure palette is closed before each test
    fireEvent(window, new Event("keydown"));
  });

  it("'Skills Section' command dispatches dashboard:switchtab with 'skills'", async () => {
    const events = captureTabEvents();
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByText("Skills Section")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("Skills Section"));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("skills");
  });

  it("'Companies Section' command dispatches dashboard:switchtab with 'companies'", async () => {
    const events = captureTabEvents();
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByText("Companies Section")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("Companies Section"));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("companies");
  });

  it("'Compensation Section' command dispatches dashboard:switchtab with 'pipeline'", async () => {
    const events = captureTabEvents();
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByText("Compensation Section")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("Compensation Section"));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("pipeline");
  });

  it("'System Health' command dispatches dashboard:switchtab with 'companies'", async () => {
    const events = captureTabEvents();
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByText("System Health")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("System Health"));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("companies");
  });

  it("'Scroll to Top' command dispatches dashboard:switchtab with 'market'", async () => {
    const events = captureTabEvents();
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByText("Scroll to Top")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("Scroll to Top"));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toBe("market");
  });

  it("navigation commands close the palette after executing", async () => {
    render(<CommandPalette />);

    act(() => { openCommandPalette(); });

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    );

    fireEvent.mouseDown(screen.getByText("Skills Section"));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });
});
