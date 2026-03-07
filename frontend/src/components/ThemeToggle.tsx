"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="brutal-border p-2 bg-card hover:bg-muted transition-colors shadow-[2px_2px_0px_0px_var(--border)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none h-[42px] w-[42px] flex items-center justify-center"
      title="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun weight="bold" className="h-5 w-5 text-[#FFB30F]" />
      ) : (
        <Moon weight="bold" className="h-5 w-5 text-[#2E4057]" />
      )}
    </button>
  );
}
