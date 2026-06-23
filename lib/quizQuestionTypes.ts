export const questionTypes = [
  "character",
  "setting",
  "object",
  "plot_event",
  "simple_motive",
  "character_motivation",
  "cause_effect",
  "problem_solution",
  "relationship",
  "prediction_inference",
  "theme",
  "symbolism",
  "character_arc",
  "moral_analysis",
  "tone_author_intent",
  "cross_story_connection",
] as const;

export type QuestionType = typeof questionTypes[number];

export type QuizDifficultyPlan = {
  quizLength: number;
  poolSize: number;
  purpose: string;
  questionTypes: Array<{
    type: QuestionType;
    label: string;
    percent: number;
  }>;
};

export type QuestionTypeCount = {
  type: QuestionType;
  label: string;
  count: number;
};

export const quizDifficultyPlans: Record<"easy" | "medium" | "hard", QuizDifficultyPlan> = {
  easy: {
    quizLength: 5,
    poolSize: 15,
    purpose: "Recall, basic comprehension, and one simple why question",
    questionTypes: [
      { type: "character", label: "Characters or roles", percent: 40 },
      { type: "setting", label: "Places/settings", percent: 20 },
      { type: "object", label: "Important objects/items", percent: 20 },
      { type: "simple_motive", label: "Simple why/motive", percent: 20 },
    ],
  },
  medium: {
    quizLength: 10,
    poolSize: 30,
    purpose: "Easy-style recall plus event sequence, motivation, and cause/effect",
    questionTypes: [
      { type: "character", label: "Characters, antagonists, or roles", percent: 30 },
      { type: "setting", label: "Places/settings", percent: 10 },
      { type: "object", label: "Important objects/items", percent: 10 },
      { type: "plot_event", label: "Plot events or timeline/when", percent: 30 },
      { type: "character_motivation", label: "Character motivation", percent: 10 },
      { type: "cause_effect", label: "Cause/effect", percent: 10 },
    ],
  },
  hard: {
    quizLength: 20,
    poolSize: 60,
    purpose: "Cumulative full-book mastery",
    questionTypes: [
      { type: "character", label: "Characters, antagonists, real villains, or roles", percent: 20 },
      { type: "setting", label: "Places/settings/world details", percent: 5 },
      { type: "object", label: "Important objects/items", percent: 10 },
      { type: "plot_event", label: "Plot events, timeline, or when questions", percent: 30 },
      { type: "character_motivation", label: "Character motivation", percent: 10 },
      { type: "cause_effect", label: "Cause/effect", percent: 10 },
      { type: "problem_solution", label: "Conflict, climax, or consequence", percent: 5 },
      { type: "symbolism", label: "Clear symbolism", percent: 5 },
      { type: "theme", label: "Theme or lesson", percent: 5 },
    ],
  },
};

const cumulativeBlueprints: Record<"easy" | "medium" | "hard", QuestionTypeCount[]> = {
  easy: [
    { type: "character", label: "Characters or roles", count: 2 },
    { type: "setting", label: "Places/settings", count: 1 },
    { type: "object", label: "Important objects/items", count: 1 },
    { type: "simple_motive", label: "Simple why/motive", count: 1 },
  ],
  medium: [
    { type: "character", label: "Characters, antagonists, or roles", count: 3 },
    { type: "setting", label: "Places/settings", count: 1 },
    { type: "object", label: "Important objects/items", count: 1 },
    { type: "plot_event", label: "Plot events or timeline/when", count: 3 },
    { type: "character_motivation", label: "Character motivation", count: 1 },
    { type: "cause_effect", label: "Cause/effect", count: 1 },
  ],
  hard: [
    { type: "character", label: "Characters, antagonists, real villains, or roles", count: 4 },
    { type: "setting", label: "Places/settings/world details", count: 1 },
    { type: "object", label: "Important objects/items", count: 2 },
    { type: "plot_event", label: "Plot events, timeline, or when questions", count: 6 },
    { type: "character_motivation", label: "Character motivation", count: 2 },
    { type: "cause_effect", label: "Cause/effect", count: 2 },
    { type: "problem_solution", label: "Conflict, climax, or consequence", count: 1 },
    { type: "symbolism", label: "Clear symbolism", count: 1 },
    { type: "theme", label: "Theme or lesson", count: 1 },
  ],
};

export function isQuestionType(value: string): value is QuestionType {
  return questionTypes.includes(value as QuestionType);
}

export function getQuestionTypeCounts(difficulty: string, questionCount: number) {
  const difficultyKey = difficulty as "easy" | "medium" | "hard";
  const blueprint = cumulativeBlueprints[difficultyKey];
  if (blueprint && questionCount === quizDifficultyPlans[difficultyKey].quizLength) {
    return blueprint;
  }

  const plan = quizDifficultyPlans[difficultyKey] ?? quizDifficultyPlans.easy;
  const rawCounts = plan.questionTypes.map((entry) => ({
    ...entry,
    exact: questionCount * (entry.percent / 100),
    count: Math.floor(questionCount * (entry.percent / 100)),
  }));
  let assigned = rawCounts.reduce((total, entry) => total + entry.count, 0);

  return rawCounts
    .sort((a, b) => (b.exact - b.count) - (a.exact - a.count))
    .map((entry) => {
      if (assigned < questionCount) {
        assigned += 1;
        return { type: entry.type, label: entry.label, count: entry.count + 1 };
      }
      return { type: entry.type, label: entry.label, count: entry.count };
    })
    .filter((entry) => entry.count > 0);
}

export function formatQuestionTypePrompt(counts: QuestionTypeCount[]) {
  return counts
    .map((entry) => `- ${entry.count} ${entry.label} question${entry.count === 1 ? "" : "s"} with questionType "${entry.type}"`)
    .join("\n");
}

export function getQuestionTypePrompt(difficulty: string, questionCount: number) {
  return formatQuestionTypePrompt(getQuestionTypeCounts(difficulty, questionCount));
}

export function getFallbackQuestionType(difficulty: string) {
  if (difficulty === "hard") return "plot_event";
  if (difficulty === "medium") return "cause_effect";
  return "plot_event";
}
