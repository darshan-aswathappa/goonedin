"use client";

import { useEffect } from "react";
import { CommandPalette, openCommandPalette } from "@/components/CommandPalette";

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
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
      <CommandPalette />
    </>
  );
}
