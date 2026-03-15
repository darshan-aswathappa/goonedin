"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { openCommandPalette, toggleAICompanion } from "@/components/CommandPalette";

// Active element tag names that should block "/" from opening the palette
const BLOCKING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (BLOCKING_TAGS.has(tag)) return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      // Cmd+K / Ctrl+K always opens the palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        openCommandPalette();
        return;
      }

      // Cmd+J / Ctrl+J toggles AI companion directly
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleAICompanion();
        return;
      }

      // Ignore "/" if focus is on an interactive input element
      if (isEditableElement(document.activeElement)) return;

      // "/" opens the palette
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {children}
      {mounted && <CommandPalette />}
    </>
  );
}
