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

export const quizDifficultyPlans: Record<"easy" | "medium" | "hard", QuizDifficultyPlan> = {
  easy: {
    quizLength: 5,
    poolSize: 15,
    purpose: "Recall and basic comprehension",
    questionTypes: [
      { type: "character", label: "Characters", percent: 30 },
      { type: "setting", label: "Places/settings", percent: 20 },
      { type: "object", label: "Important objects/items", percent: 20 },
      { type: "plot_event", label: "Plot events", percent: 20 },
      { type: "simple_motive", label: "Simple emotions/motives", percent: 10 },
    ],
  },
  medium: {
    quizLength: 10,
    poolSize: 30,
    purpose: "Inference and cause/effect",
    questionTypes: [
      { type: "character_motivation", label: "Character motivation", percent: 25 },
      { type: "cause_effect", label: "Cause/effect", percent: 25 },
      { type: "problem_solution", label: "Problem/solution", percent: 20 },
      { type: "relationship", label: "Relationships", percent: 15 },
      { type: "prediction_inference", label: "Predictions/inference", percent: 15 },
    ],
  },
  hard: {
    quizLength: 20,
    poolSize: 60,
    purpose: "Themes, symbolism, and author intent",
    questionTypes: [
      { type: "theme", label: "Themes", percent: 25 },
      { type: "symbolism", label: "Symbolism", percent: 20 },
      { type: "character_arc", label: "Character arcs", percent: 20 },
      { type: "moral_analysis", label: "Moral/ethical analysis", percent: 15 },
      { type: "tone_author_intent", label: "Tone/author intent", percent: 10 },
      { type: "cross_story_connection", label: "Cross-story connections", percent: 10 },
    ],
  },
};

export function isQuestionType(value: string): value is QuestionType {
  return questionTypes.includes(value as QuestionType);
}

export function getQuestionTypeCounts(difficulty: string, questionCount: number) {
  const plan = quizDifficultyPlans[difficulty as "easy" | "medium" | "hard"] ?? quizDifficultyPlans.easy;
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

export function getQuestionTypePrompt(difficulty: string, questionCount: number) {
  return getQuestionTypeCounts(difficulty, questionCount)
    .map((entry) => `- ${entry.count} ${entry.label} question${entry.count === 1 ? "" : "s"} with questionType "${entry.type}"`)
    .join("\n");
}

export function getFallbackQuestionType(difficulty: string) {
  if (difficulty === "hard") return "theme";
  if (difficulty === "medium") return "cause_effect";
  return "plot_event";
}
