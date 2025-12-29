"use client";

import { useEffect, useState } from "react";
import { AppButton } from "@/components/app-ui/app-button";

type Theme = "light" | "dark";

function getTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem("theme", theme);
}

export function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  return (
    <AppButton
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        setTheme(next);
        setThemeState(next);
      }}
      className="dark:bg-white/10 dark:text-white dark:hover:bg-yuzu-main/30"
      aria-label="Toggle dark mode"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </AppButton>
  );
}



