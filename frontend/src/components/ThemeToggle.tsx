"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="brutal-border brutal-btn-hover p-2 bg-card shadow-[2px_2px_0px_0px_var(--border)] h-[42px] w-[42px] flex items-center justify-center"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun weight="bold" className="h-5 w-5 text-[#FFB30F]" />
      ) : (
        <Moon weight="bold" className="h-5 w-5 text-[#2E4057]" />
      )}
    </button>
  );
}
