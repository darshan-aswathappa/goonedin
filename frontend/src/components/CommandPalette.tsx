"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Command, CommandGroup } from "@/types/knowledge-base";

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
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "9px",
        letterSpacing: "0.18em",
        color: "#555555",
        textTransform: "uppercase",
        padding: "8px 12px 4px",
        borderBottom: "1px solid #1c1c1c",
        marginBottom: "2px",
      }}
    >
      {label}
    </div>
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
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        cursor: "pointer",
        background: isSelected ? "#111111" : "transparent",
        borderLeft: isSelected ? "2px solid #ff8c00" : "2px solid transparent",
        transition: "background 0.08s",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
            color: isSelected ? "#f0f0f0" : "#aaaaaa",
            fontWeight: isSelected ? 600 : 400,
            letterSpacing: "0.04em",
          }}
        >
          {command.label}
        </span>
        {command.description && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "#555555",
              letterSpacing: "0.06em",
            }}
          >
            {command.description}
          </span>
        )}
      </div>
      {command.shortcut && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "#555555",
            border: "1px solid #2a2a2a",
            padding: "2px 6px",
            letterSpacing: "0.1em",
            flexShrink: 0,
          }}
        >
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
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(2px)",
            zIndex: 200,
          }}
        />

        {/* Panel */}
        <Dialog.Content
          aria-label="Command Palette"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: "560px",
            background: "#0a0a0a",
            border: "1px solid #2a2a2a",
            borderRadius: 0,
            boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            zIndex: 200,
            outline: "none",
            overflow: "hidden",
          }}
        >
          {/* Search input row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid #1c1c1c",
              padding: "0 12px",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "14px",
                color: "#ff8c00",
                marginRight: "10px",
                userSelect: "none",
                flexShrink: 0,
              }}
            >
              &gt;_
            </span>
            <Dialog.Title style={{ display: "none" }}>
              Command Palette
            </Dialog.Title>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or navigate..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f0f0f0",
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                letterSpacing: "0.02em",
                padding: "14px 0",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "#555555",
                border: "1px solid #2a2a2a",
                padding: "2px 6px",
                flexShrink: 0,
                letterSpacing: "0.08em",
              }}
            >
              ESC
            </span>
          </div>

          {/* Command list */}
          <div
            ref={listRef}
            role="listbox"
            style={{
              maxHeight: "360px",
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {flatItems.length === 0 ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#555555",
                  textAlign: "center",
                  padding: "24px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                NO COMMANDS FOUND
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
          <div
            style={{
              borderTop: "1px solid #1c1c1c",
              padding: "6px 12px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                color: "#555555",
                letterSpacing: "0.1em",
              }}
            >
              ESC · ↑↓ · ↵
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
