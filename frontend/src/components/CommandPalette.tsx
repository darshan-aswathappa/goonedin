"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Command, CommandGroup } from "@/types/knowledge-base";
import { cn } from "@/lib/utils";
import { Kicker } from "@/components/ds";

// ── Palette open/close event (cross-component) ───────────────────────────────
const OPEN_EVENT = "commandpalette:open";
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// ── Suggested commands ────────────────────────────────────────────────────────
function buildCommands(
  router: ReturnType<typeof useRouter>,
  closeAndNavigate: (path: string) => void,
  onAskAI: () => void
): Command[] {
  return [
    {
      id: "nav-dashboard",
      label: "Dashboard",
      description: "Live job stream",
      group: "NAVIGATE",
      shortcut: "G D",
      action: () => closeAndNavigate("/"),
    },
    {
      id: "nav-analytics",
      label: "Analytics",
      description: "Job market intelligence",
      group: "NAVIGATE",
      shortcut: "G A",
      action: () => closeAndNavigate("/analytics"),
    },
    {
      id: "nav-saved",
      label: "Saved Jobs",
      description: "Your personal shortlist",
      group: "NAVIGATE",
      shortcut: "G S",
      action: () => closeAndNavigate("/saved"),
    },
    {
      id: "nav-settings",
      label: "Settings",
      description: "Configure filters and keywords",
      group: "NAVIGATE",
      shortcut: "G C",
      action: () => closeAndNavigate("/settings"),
    },
    {
      id: "nav-logs",
      label: "Logs",
      description: "Live scraper output",
      group: "NAVIGATE",
      shortcut: "G L",
      action: () => closeAndNavigate("/logs"),
    },
    {
      id: "action-ai",
      label: "Ask AI Companion",
      description: "Query job market with natural language",
      group: "ACTION",
      shortcut: "⌘ K",
      action: onAskAI,
    },
  ];
}

// ── Group label rendering ─────────────────────────────────────────────────────
function GroupLabel({ label }: { label: string }) {
  return (
    <Kicker className="mb-0.5 border-b border-hairline px-3 pb-1 pt-2">
      {label}
    </Kicker>
  );
}

// ── Single command row ────────────────────────────────────────────────────────
function CommandRow({
  command,
  isSelected,
  onSelect,
}: {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onMouseDown={(e) => {
        // prevent input blur before action fires
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 border-l-[3px] px-3 py-2 transition-colors duration-[120ms] hover:bg-paper-sunk",
        isSelected
          ? "border-l-brick bg-paper-sunk"
          : "border-l-transparent bg-transparent"
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            "truncate font-mono text-[13px] tracking-[0.02em]",
            isSelected ? "font-medium text-ink" : "text-ink-2"
          )}
        >
          {command.label}
        </span>
        {command.description && (
          <span className="truncate font-mono text-[11px] text-ink-muted">
            {command.description}
          </span>
        )}
      </div>
      {command.shortcut && (
        <span className="shrink-0 rounded-[4px] border border-hairline bg-paper-card px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
          {command.shortcut}
        </span>
      )}
    </div>
  );
}

// ── Main CommandPalette component ─────────────────────────────────────────────
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const closeAndNavigate = useCallback(
    (path: string) => {
      setOpen(false);
      setQuery("");
      router.push(path);
    },
    [router]
  );

  const onAskAI = useCallback(() => {
    setOpen(false);
    setQuery("");
    router.push("/analytics");
  }, [router]);

  const commands = useMemo(
    () => buildCommands(router, closeAndNavigate, onAskAI),
    [router, closeAndNavigate, onAskAI]
  );

  // Filter, group, and flatten — recomputed only when query or commands change
  const { groups, flatItems } = useMemo(() => {
    const filtered = query.trim()
      ? commands.filter(
          (c) =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            (c.description ?? "").toLowerCase().includes(query.toLowerCase())
        )
      : commands;

    const groupOrder: CommandGroup[] = ["NAVIGATE", "ACTION"];
    const grouped: { label: CommandGroup; items: Command[] }[] = [];
    for (const group of groupOrder) {
      const items = filtered.filter((c) => c.group === group);
      if (items.length > 0) grouped.push({ label: group, items });
    }

    return { groups: grouped, flatItems: grouped.flatMap((g) => g.items) };
  }, [commands, query]);

  // Clamp selectedIndex when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Open via custom event (from "/" key handler or external callers)
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      // Small delay to let Radix finish mounting the portal
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    } else {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev === 0 ? Math.max(flatItems.length - 1, 0) : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatItems[selectedIndex];
      if (cmd) cmd.action();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-[var(--scrim)]" />

        {/* Panel */}
        <Dialog.Content
          aria-label="Command Palette"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-[20%] z-[200] w-full max-w-[560px] -translate-x-1/2 overflow-hidden rounded-[10px] border border-hairline bg-paper-card shadow-[var(--shadow-md)] outline-none"
        >
          {/* Search input row */}
          <div className="flex items-center border-b border-hairline px-3">
            <span
              aria-hidden
              className="mr-2.5 shrink-0 select-none font-mono text-[14px] text-ink-faint"
            >
              &gt;_
            </span>
            <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or navigate..."
              className="flex-1 border-none bg-transparent py-3.5 font-mono text-[13px] tracking-[0.02em] text-ink outline-none placeholder:text-ink-faint"
            />
            <span className="shrink-0 rounded-[4px] border border-hairline bg-paper-sunk px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              ESC
            </span>
          </div>

          {/* Command list */}
          <div ref={listRef} role="listbox" className="max-h-[360px] overflow-y-auto py-1">
            {flatItems.length === 0 ? (
              <div className="px-6 py-8 text-center font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
                No commands found
              </div>
            ) : (
              groups.map((group) => {
                // Running index offset per group
                const groupOffset = flatItems.indexOf(group.items[0]);
                return (
                  <div key={group.label}>
                    <GroupLabel label={group.label} />
                    {group.items.map((cmd, i) => {
                      const globalIndex = groupOffset + i;
                      return (
                        <CommandRow
                          key={cmd.id}
                          command={cmd}
                          isSelected={selectedIndex === globalIndex}
                          onSelect={cmd.action}
                        />
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer hint */}
          <div className="flex justify-end border-t border-hairline bg-paper-sunk px-3 py-1.5">
            <span className="font-mono text-[11px] tracking-[0.09em] text-ink-faint">
              ESC · ↑↓ · ↵
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
