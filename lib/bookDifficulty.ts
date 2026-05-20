import type { BookLevel } from "./scoring";

export type BookDifficultyRating = {
  level: BookLevel;
  difficultyIndex: number;
  ratingId?: string;
  canonicalKey?: string;
  source?: "known" | "cache" | "ai" | "fallback";
};

export function normalizeBookIdentity(value: string) {
  return value.trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

export function getBookDifficultyKey(details: {
  title: string;
  author?: string;
  isbn?: string;
}) {
  const isbn = details.isbn?.replace(/[^\dXx]/g, "").toUpperCase();
  if (isbn) {
    return `isbn:${isbn}`;
  }

  return [
    "title",
    normalizeBookIdentity(details.title),
    normalizeBookIdentity(details.author ?? ""),
  ].join(":");
}

export function clampDifficultyIndex(value: number) {
  const clamped = Math.min(9.9, Math.max(1, value));
  return Math.round(clamped * 10) / 10;
}

export function getLevelFromDifficultyIndex(score: number): BookLevel {
  if (score <= 3.3) return "beginner";
  if (score <= 6.6) return "intermediate";
  return "advanced";
}

export function getDifficultyIndexRange(level: BookLevel) {
  if (level === "beginner") return "1.0-3.3";
  if (level === "intermediate") return "3.4-6.6";
  return "6.7-9.9";
}

export function normalizeDifficultyRating(score: number): BookDifficultyRating {
  const difficultyIndex = clampDifficultyIndex(score);
  return {
    difficultyIndex,
    level: getLevelFromDifficultyIndex(difficultyIndex),
  };
}
