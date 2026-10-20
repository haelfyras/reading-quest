"use client";

import { useEffect, useState } from "react";
import { getStoredThemeStyle, setStoredThemeStyle, type ThemeStyle } from "../../lib/themeAssets";

const themeOptions: Array<{ id: ThemeStyle; label: string }> = [
  { id: "library", label: "Library" },
  { id: "fantasy", label: "Fantasy" },
  { id: "sci-fi", label: "Space" },
  { id: "spooky", label: "Spooky" },
];

export default function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ThemeStyle>("library");

  useEffect(() => {
    setTheme(getStoredThemeStyle());
  }, []);

  const chooseTheme = (nextTheme: ThemeStyle) => {
    setTheme(nextTheme);
    setStoredThemeStyle(nextTheme);
  };

  return (
    <div className={compact ? "theme-picker compact" : "theme-picker"}>
      <span className="theme-picker-label">Choose a theme</span>
      <div className="theme-picker-options" aria-label="Reading Quest theme">
        {themeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={theme === option.id ? "theme-choice selected" : "theme-choice"}
            aria-pressed={theme === option.id}
            onClick={() => chooseTheme(option.id)}
          >
            <span className={`theme-swatch ${option.id}`} aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
