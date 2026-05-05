import type { Difficulty } from "./user";

export type BookLevel = "beginner" | "intermediate" | "advanced";

export const difficultyRules: Record<Difficulty, {
  label: string;
  questionCount: number;
  basePoints: number;
}> = {
  easy: {
    label: "Easy",
    questionCount: 5,
    basePoints: 10,
  },
  medium: {
    label: "Medium",
    questionCount: 10,
    basePoints: 40,
  },
  hard: {
    label: "Hard",
    questionCount: 20,
    basePoints: 100,
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
  const rules = difficultyRules[difficulty as Difficulty] ?? difficultyRules.easy;
  return Math.ceil(rules.basePoints / rules.questionCount);
}

export function getQuestionCount(difficulty: string) {
  return difficultyRules[difficulty as Difficulty]?.questionCount ?? difficultyRules.easy.questionCount;
}

export function getMaxScore(difficulty: string) {
  return getQuestionCount(difficulty);
}

export function getBasePoints(difficulty: string) {
  return difficultyRules[difficulty as Difficulty]?.basePoints ?? difficultyRules.easy.basePoints;
}

export function getAccuracyMultiplier(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  const accuracy = score / maxScore;
  if (accuracy < 0.5) return 0.5;
  if (accuracy <= 0.8) return 1;
  if (accuracy <= 0.95) return 1.2;
  return 1.5;
}

export function calculateQuizPoints(details: {
  difficulty: string;
  score: number;
  maxScore: number;
  firstTimeCompletion?: boolean;
}) {
  const basePoints = getBasePoints(details.difficulty);
  const accuracyMultiplier = getAccuracyMultiplier(details.score, details.maxScore);
  const firstTimeMultiplier = details.firstTimeCompletion ? 1.1 : 1;
  return Math.ceil(basePoints * accuracyMultiplier * firstTimeMultiplier);
}
