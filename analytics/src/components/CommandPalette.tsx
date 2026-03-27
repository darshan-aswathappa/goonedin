"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command, CommandGroup } from "@/types/knowledge-base";

// ── Palette open/close event (cross-component) ───────────────────────────────
const OPEN_EVENT = "commandpalette:open";
const AI_TOGGLE_EVENT = "ai:toggle";
const SWITCH_TAB_EVENT = "dashboard:switchtab";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function toggleAICompanion() {
  window.dispatchEvent(new Event(AI_TOGGLE_EVENT));
}

export function switchDashboardTab(tabId: string) {
  window.dispatchEvent(new CustomEvent(SWITCH_TAB_EVENT, { detail: tabId }));
}

// ── Suggested commands ────────────────────────────────────────────────────────
function buildCommands(
  onClose: () => void,
  onAskAI: () => void
): Command[] {
  return [
    {
      id: "action-ai",
      label: "Ask AI Companion",
      description: "Ask questions about your job market",
      group: "ACTION",
      shortcut: "\u2318 J",
      action: onAskAI,
    },
    {
      id: "nav-top",
      label: "Scroll to Top",
      description: "Jump to KPI cards",
      group: "NAVIGATE",
      action: () => {
        onClose();
        switchDashboardTab("market");
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
    {
      id: "nav-skills",
      label: "Skills Section",
      description: "Technical skills, co-occurrence, momentum",
      group: "NAVIGATE",
      action: () => {
        onClose();
        switchDashboardTab("skills");
      },
    },
    {
      id: "nav-companies",
      label: "Companies Section",
      description: "Top employers and locations",
      group: "NAVIGATE",
      action: () => {
        onClose();
        switchDashboardTab("companies");
      },
    },
    {
      id: "nav-salary",
      label: "Compensation Section",
      description: "Salary ranges, location pay",
      group: "NAVIGATE",
      action: () => {
        onClose();
        switchDashboardTab("pipeline");
      },
    },
    {
      id: "nav-system",
      label: "System Health",
      description: "Queue health and market intel",
      group: "NAVIGATE",
      action: () => {
        onClose();
        switchDashboardTab("companies");
      },
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
      id={`cmd-option-${command.id}`}
      role="option"
      aria-selected={isSelected}
      onMouseDown={(e) => {
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const onClose = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const onAskAI = useCallback(() => {
    setOpen(false);
    setQuery("");
    toggleAICompanion();
  }, []);

  const commands = buildCommands(onClose, onAskAI);

  // Filter by query
  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          (c.description ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  // Group filtered commands
  const groups: { label: CommandGroup; items: Command[] }[] = [];
  const groupOrder: CommandGroup[] = ["ACTION", "NAVIGATE"];
  for (const group of groupOrder) {
    const items = filtered.filter((c) => c.group === group);
    if (items.length > 0) groups.push({ label: group, items });
  }

  // Flatten for index tracking
  const flatItems = groups.flatMap((g) => g.items);

  // Clamp selectedIndex when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view when navigating with keyboard
  useEffect(() => {
    const selected = flatItems[selectedIndex];
    if (!selected) return;
    const el = document.getElementById(`cmd-option-${selected.id}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open via custom event
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
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
              placeholder="Type a command or search..."
              role="combobox"
              aria-expanded={flatItems.length > 0}
              aria-controls="cmd-listbox"
              aria-activedescendant={
                flatItems[selectedIndex]
                  ? `cmd-option-${flatItems[selectedIndex].id}`
                  : undefined
              }
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
            id="cmd-listbox"
            role="listbox"
            aria-label="Commands"
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
              ESC \u00b7 \u2191\u2193 \u00b7 \u21b5
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
