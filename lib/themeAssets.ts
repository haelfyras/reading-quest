export type ThemeStyle = "fantasy" | "sci-fi" | "spooky" | "library";

const chestFilePrefixes: Record<ThemeStyle, string> = {
  fantasy: "Fantasy",
  "sci-fi": "Scifi",
  spooky: "Spooky",
  library: "Library",
};

export function normalizeThemeStyle(value: string | null | undefined): ThemeStyle {
  if (value === "horror") return "spooky";
  if (value === "fantasy" || value === "sci-fi" || value === "spooky" || value === "library") {
    return value;
  }
  return "library";
}

export function getStoredThemeStyle(): ThemeStyle {
  if (typeof window === "undefined") return "library";
  return normalizeThemeStyle(localStorage.getItem("readingQuestTheme") ?? document.documentElement.getAttribute("data-theme-style"));
}

export function setStoredThemeStyle(theme: ThemeStyle) {
  if (typeof window === "undefined") return;
  const normalizedTheme = normalizeThemeStyle(theme);
  document.documentElement.setAttribute("data-theme-style", normalizedTheme);
  localStorage.setItem("readingQuestTheme", normalizedTheme);
  window.dispatchEvent(new Event("readingQuestProfileUpdated"));
}

export function getChestImageSrc(theme: ThemeStyle, isOpen: boolean) {
  return `/images/${chestFilePrefixes[theme]}-chest-${isOpen ? "open" : "close"}.png`;
}

export function getShelfImageSrc(theme: ThemeStyle) {
  return `/images/${chestFilePrefixes[theme]}-Shelf.png`;
}

export function getHotStreakImageSrc() {
  return "/images/hot-streak.png";
}
