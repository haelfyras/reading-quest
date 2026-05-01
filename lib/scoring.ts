import type { Difficulty } from "./user";

export type BookLevel = "beginner" | "intermediate" | "advanced";

export const difficultyRules: Record<Difficulty, {
  label: string;
  questionCount: number;
  pointsPerQuestion: number;
  totalPoints: number;
}> = {
  easy: {
    label: "Easy",
    questionCount: 5,
    pointsPerQuestion: 2,
    totalPoints: 10,
  },
  medium: {
    label: "Medium",
    questionCount: 10,
    pointsPerQuestion: 5,
    totalPoints: 50,
  },
  hard: {
    label: "Hard",
    questionCount: 25,
    pointsPerQuestion: 6,
    totalPoints: 150,
  },
};

export const allowedDifficultiesByBookLevel: Record<BookLevel, Difficulty[]> = {
  beginner: ["easy"],
  intermediate: ["easy", "medium"],
  advanced: ["easy", "medium", "hard"],
};

export function isBookLevel(value: string): value is BookLevel {
  return ["beginner", "intermediate", "advanced"].includes(value);
}

export function getAllowedDifficulties(bookLevel: string | null | undefined): Difficulty[] {
  if (!bookLevel || !isBookLevel(bookLevel)) {
    return ["easy"];
  }

  return allowedDifficultiesByBookLevel[bookLevel];
}

export function isDifficultyAllowedForBookLevel(difficulty: string, bookLevel: string | null | undefined) {
  return getAllowedDifficulties(bookLevel).includes(difficulty as Difficulty);
}

export function getNextAllowedDifficulty(difficulty: string, bookLevel: string | null | undefined): Difficulty | null {
  const allowed = getAllowedDifficulties(bookLevel);
  const index = allowed.indexOf(difficulty as Difficulty);
  if (index === -1 || index >= allowed.length - 1) {
    return null;
  }

  return allowed[index + 1];
}

export function getQuestionValue(difficulty: string) {
  return difficultyRules[difficulty as Difficulty]?.pointsPerQuestion ?? difficultyRules.easy.pointsPerQuestion;
}

export function getQuestionCount(difficulty: string) {
  return difficultyRules[difficulty as Difficulty]?.questionCount ?? difficultyRules.easy.questionCount;
}

export function getMaxScore(difficulty: string) {
  return difficultyRules[difficulty as Difficulty]?.totalPoints ?? difficultyRules.easy.totalPoints;
}
