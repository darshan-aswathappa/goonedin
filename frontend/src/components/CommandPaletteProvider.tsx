"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { openCommandPalette } from "@/components/CommandPalette";

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
  // Prevent SSR hydration mismatch — only render the palette client-side
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if the event is part of IME composition
      if (e.isComposing) return;

      // Ignore if focus is on an interactive input element
      if (isEditableElement(document.activeElement)) return;

      // "/" opens the palette (no modifier keys)
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
