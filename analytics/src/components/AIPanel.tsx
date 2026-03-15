"use client";

import { useEffect, useState } from "react";
import { AICompanion } from "@/components/AICompanion";

const AI_TOGGLE_EVENT = "ai:toggle";

export default function AIPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setOpen((prev) => !prev);
    window.addEventListener(AI_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(AI_TOGGLE_EVENT, handleToggle);
  }, []);

  // Close on Escape when panel is open (handled globally, not inside input)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only close if not typing in an input
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "TEXTAREA") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 150,
            transition: "opacity 0.2s",
          }}
        />
      )}

      {/* Slide-in panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "min(480px, 92vw)",
          height: "100vh",
          zIndex: 160,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
        }}
      >
        <AICompanion onClose={() => setOpen(false)} />
      </div>
    </>
  );
}
