import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";
import {
  getAllowedDifficulties,
  getQuestionCount,
  isDifficultyAllowedForBookLevel,
} from "../../../lib/scoring";
import { getBookDifficultyKey } from "../../../lib/bookDifficulty";
import {
  getFactSheetPrompt,
  getOrCreateBookFactSheet,
  getUnsupportedQuizTerms,
  isFactSheetUsableForDifficulty,
  type BookFactSheet,
} from "../../../lib/bookFacts";
import { QUESTION_POOL_VERSION } from "../../../lib/quizPool";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import {
  getFallbackQuestionType,
  formatQuestionTypePrompt,
  getQuestionTypeCounts,
  getQuestionTypePrompt,
  isQuestionType,
  quizDifficultyPlans,
  type QuestionTypeCount,
  type QuestionType,
} from "../../../lib/quizQuestionTypes";

export const maxDuration = 60;

const difficultyMap = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";
const poolTopUpCounts: Record<"easy" | "medium" | "hard", number> = {
  easy: 2,
  medium: 3,
  hard: 5,
};

type BookDetails = {
  title: string;
  author?: string;
  year?: string;
  isbn?: string;
};

const goalMap: Record<string, string> = {
  habit_formation: "Habit Forming: prioritize confidence, completion, and encouraging the child to read more. Ask approachable questions about obvious story moments, main characters, and broad events. Avoid trick questions.",
  basic_recollection: "Basic Recollection: focus on names, places, objects, characters, settings, and clear events from the story.",
  basic_comprehension: "Basic Recollection: focus on names, places, objects, characters, settings, and clear events from the story.",
  further_understanding: "Further Understanding: focus on why characters did something, why they went somewhere, cause and effect, motivations, and how actions connect to story outcomes.",
  deeper_understanding: "Further Understanding: focus on why characters did something, why they went somewhere, cause and effect, motivations, and how actions connect to story outcomes.",
  full_understanding: "Full Understanding: focus on the bigger picture of the work, including themes, lessons, symbolism, character growth, social context, and how events or choices support the meaning of the book.",
  literary_analysis: "Full Understanding: focus on the bigger picture of the work, including themes, lessons, symbolism, character growth, social context, and how events or choices support the meaning of the book.",
};

const readingQuestQuizPhilosophy = `Reading Quest quiz philosophy:
- The goal is not trivia, tricks, or difficulty for difficulty's sake.
- The goal is to verify that a reader genuinely read and understood the story.
- A reader who completed the book should feel the questions are fair, clear, age-appropriate, and directly connected to the book.
- A reader who did not read the book should struggle because the questions depend on major story comprehension.
- Test reading comprehension, major story elements, important events, cause and effect, character motivations, and only clearly supported themes on Hard.
- Do not test obscure facts, tiny details, author biography, publication facts, adaptation knowledge, fan theories, personal opinion, or literary criticism.
- If a teacher or parent would say "that question feels unfair," replace it.`;

const objectiveQuestionContract = `Objective-question rules:
- Every question must have exactly one objectively correct answer, not one "best" answer.
- Ask: Could a reasonable reader defend another answer from the book? If yes, the question is invalid.
- Avoid opinion wording such as strongest, best, most important, true meaning, biggest lesson, better, powerful, or main message unless the wording makes the answer objective and text-supported.
- Use recognizable character names from the book. If the book mainly uses nicknames, titles, or first names, use the same naming convention.
- Each question must test unique knowledge. Do not ask two questions that measure the same fact, same answer, or same story moment.
- Questions should test comprehension rather than memorization of tiny details.`;

const answerChoiceContract = `Answer choice consistency rules:
- Each question must have exactly one defensible correct answer.
- The three wrong choices must be clearly false for the question being asked.
- Wrong choices may be plausible, but they cannot be partially correct, technically correct, broader categories, narrower examples, synonyms, restatements, or "also true" answers.
- All four choices must be the same kind of answer: all characters, all places, all causes, all themes, all events, or all short claims.
- Do not mix a specific answer with a broad category that could include it.
- Do not mix several positive traits, feelings, motivations, or themes that are all true of the same character or scene.
- Do not use "all of the above", "none of the above", joke answers, obviously unrelated answers, or vague answers like "a person", "a thing", "a number", "something bad", or "because of choices".
- If more than one choice could be defended by a reasonable reader, replace the question or the choices.
- Incorrect answers should be believable and may come from the story, but they must be clearly false for this exact question.
- Incorrect answers must not be true in another book, movie, TV version, game, adaptation, or fan theory.
- Hard questions should be thoughtful for upper elementary, middle school, and high school readers, not graduate-level, obscure, or ambiguous.`;

const youngReaderAnswerabilityContract = `Young-reader answerability rules:
- The question must be easy to understand before looking at the answer choices.
- Prefer concrete wording: who, what, where, when, which object, what happens next, or what directly causes an event.
- When asking "when," include enough scene context to remove ambiguity if the event happens more than once.
- For Easy, avoid broad questions about motivation, symbolism, theme, lessons, or feelings unless the answer is plainly stated in the book.
- For Medium, motivation and cause/effect questions must name a specific event or action and ask for the most direct reason.
- For Hard, theme and symbolism questions are allowed, but the answer choices must be distinct and only one can be defended from the scene.
- Avoid broad wording like "What motivates..." when several true motives exist; ask "What most directly causes..." or "Why does the character do this specific thing?"
- Avoid questions where a reader could say "both are true" or "that answer is also reasonable."
- If a question depends on interpretation, make the wording narrower or replace it with a clearer book-knowledge question.`;

const themeSymbolismContract = `Theme and symbolism rules:
- If a question asks what something symbolizes, represents, suggests, reveals, means, or shows about a theme, the correct answer must be an abstract meaning, theme, trait, lesson, or idea.
- Do not mark a literal plot result, direct consequence, physical outcome, or next event as correct for a symbolism/theme question.
- Do not mix abstract thematic choices with literal event/result choices in the same question.
- If the intended answer is a direct result of an action, ask a cause/effect question instead of a symbolism/theme question.
- If the intended answer is symbolic, every choice must be the same kind of abstract answer and only one may be defensible.
- Avoid "what does this symbolize" questions when the scene supports more than one reasonable interpretation; ask a clearer theme question instead.`;

const cumulativeDifficultyContract = `Cumulative difficulty rules:
- Easy, Medium, and Hard are cumulative. Higher difficulties must still ask grounded book-knowledge questions.
- Easy should mostly ask who/what/where questions, with one simple why question.
- Medium must build on Easy: it should still confirm major characters, places, objects, and events, then add timeline/when, motivation, and cause/effect.
- Medium should avoid theme, symbolism, literary analysis, and subjective interpretation.
- Hard must build on Easy and Medium: it should still prove major story knowledge, then add climax/consequences and only clearly supported themes or symbolism.
- Hard should prove full-book mastery: recall, antagonists/roles, places, objects, timeline/when, cause/effect, climax/consequences, and clearly supported themes.
- Hard must not become only symbolism, lessons, or character growth.
- Timeline/when questions should ask about story sequence or when something happens in the plot, not obscure publication dates.
- If a "when" question could refer to more than one scene, meeting, return, departure, discovery, fight, or repeated event, the question must include a clear time reference such as "the first time," "after they split up," "near the end," "before the journey," or the specific event being asked about.
- Do not ask broad "When did X meet Y?" questions when characters meet more than once; ask about the first meeting or a clearly named later meeting.
- The correct answer to a timeline/when question must be a story sequence, scene, or plot moment, not a vague answer like "later," "at some point," or "during the story."
- Questions about villains or antagonists should distinguish primary obstacle, surface antagonist, and deeper/true antagonist only when the book clearly supports that distinction.`;

const prompt = (
  book: BookDetails,
  difficulty: string,
  bookLevel: string,
  learningGoal: string,
  questionCount: number,
  section?: { number: number; total: number; previousQuestions: string[] },
  qualityNotes = "",
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(book);
  const typePlan = getQuestionTypePrompt(difficulty, questionCount);
  const poolSize = quizDifficultyPlans[difficulty as "easy" | "medium" | "hard"]?.poolSize ?? questionCount;
  const sectionInstruction = section
    ? `\n\nThis is section ${section.number} of ${section.total}. Create exactly ${questionCount} new questions for this section only. Do not repeat these earlier questions: ${section.previousQuestions.length ? section.previousQuestions.map((question) => `"${question}"`).join("; ") : "none"}.`
    : "";

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}. The questions array must contain exactly ${questionCount} complete question objects. Do not return fewer than ${questionCount}. Each question must have: question, questionKey, questionType, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation, qualityScore, questionVersion.\n\nCanonical book to quiz: ${bookIdentity}. Test difficulty: ${difficulty}. Book level: ${bookLevel}. Testing goal: ${goalDescription}. Long-term curated pool target for this difficulty: ${poolSize} questions.${qualityNotes ? `\n\nCritical book guardrails:\n${qualityNotes}` : ""}\n\nQuestion type plan:\n${typePlan}\n\n${readingQuestQuizPhilosophy}\n\n${objectiveQuestionContract}\n\n${answerChoiceContract}\n\n${youngReaderAnswerabilityContract}\n\n${themeSymbolismContract}\n\n${cumulativeDifficultyContract}\n\nRules:\n- questionKey must be a short lowercase stable question identifier for the question idea, like "frodo-sam-trust" or "rohan-aid-reason". Treat it like a future Supabase questionId.\n- questionType must exactly match the requested type plan.\n- qualityScore must be a number from 0.75 to 1.0 based on answerability, clarity, and single-correct-answer confidence.\n- questionVersion must be ${QUESTION_POOL_VERSION}.\n- Use only the exact book above, not films, soundtracks, games, adaptations, sequels, prequels, or other series installments.\n- If a fact may come from another book in the series or a movie adaptation, do not use it.\n- Keep every question under 18 words, every choice under 7 words, every explanation under 14 words.\n- answerIndex must point to answerText exactly.\n- Every question must be answerable from the exact book and have one clear correct answer.\n- Do not ask impossible, obscure, trick, spoiler-only, or repeated/rephrased questions.\n- Counting-question answers must be numbers.\n- Avoid "what potion/item/spell" questions unless the exact book clearly names it.\n- Choices must be plausible and fit the exact book, but only one can be correct.\n- Before returning, privately test each wrong choice by asking: "Could this also be correct, partly correct, or reasonable?" If yes, replace it.\n- For Easy and Medium, prefer clear book facts over debatable interpretation.\n- Never use joke or unrelated pop-culture answers unless they truly appear in the exact book.\n- Use child-friendly language for ages 7-18.\n- Silently count the questions before returning JSON and make sure there are exactly ${questionCount}.${sectionInstruction}`;
};

function describeBook(book: BookDetails) {
  const parts = [`"${book.title}"`];
  if (book.author) parts.push(`by ${book.author}`);
  if (book.year) parts.push(`first published around ${book.year}`);
  if (book.isbn) parts.push(`ISBN ${book.isbn}`);
  return parts.join(", ");
}

function normalizeBookText(value: string) {
  return value.trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function getBookQualityNotes(book: BookDetails) {
  const title = normalizeBookText(book.title);
  const notes: string[] = [];

  if (book.author || book.year || book.isbn) {
    notes.push("Treat the provided title, author, year, and ISBN as the canonical book identity.");
  }

  if (/\b(book|volume|part|chapter)\b|\b[ivx]{2,}\b|\b\d+\b|:/.test(title)) {
    notes.push("This may be one installment, edition, or adaptation title. Do not borrow facts from similarly named works.");
  }

  return notes.join("\n- ");
}

type QuizGrounding = {
  factSheet: BookFactSheet;
  prompt: string;
};

function combineQualityNotes(...notes: Array<string | null | undefined>) {
  return notes.map((note) => note?.trim()).filter(Boolean).join("\n\n");
}

async function prepareQuizGrounding(details: {
  book: BookDetails;
  difficulty: string;
  canonicalKey: string;
}) {
  if (details.difficulty === "easy") {
    return null;
  }

  const factSheet = await getOrCreateBookFactSheet({
    book: details.book,
    canonicalKey: details.canonicalKey,
  });

  if (!isFactSheetUsableForDifficulty(factSheet, details.difficulty)) {
    throw new Error(
      "We found the book, but need more verified story details before creating a fair Medium or Hard challenge. Try Wanderer (Easy) for now, add an ISBN if you have one, or ask Reading Quest to review this book.",
    );
  }

  return {
    factSheet,
    prompt: getFactSheetPrompt(factSheet),
  } satisfies QuizGrounding;
}

const hardPrompt = (book: BookDetails, bookLevel: string, learningGoal: string, qualityNotes = "") => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(book);
  const typePlan = getQuestionTypePrompt("hard", 20);

  return `Return only valid compact JSON with this exact shape:
{"quizTitle": string, "quizDescription": string, "questions": [
{"question": string, "questionKey": string, "questionType": string, "choices": [string, string, string, string], "answerIndex": number, "answerText": string, "explanation": string, "qualityScore": number, "questionVersion": number}
]}

Create exactly 20 hard questions for this canonical book only: ${bookIdentity}. The book reading level is ${bookLevel}. Testing goal: ${goalDescription}.
${qualityNotes ? `\nCritical book guardrails:\n- ${qualityNotes}\n` : ""}

Question plan:
${typePlan}

${readingQuestQuizPhilosophy}

${objectiveQuestionContract}

Rules:
- The questions array must contain exactly 20 complete objects.
- Do not return fewer than 20 questions.
- questionKey must be a short lowercase stable question identifier for the question idea, like "arthur-earth-bypass" or "sam-frodo-trust". Treat it like a future Supabase questionId.
- questionType must exactly match the requested question plan.
- qualityScore must be a number from 0.75 to 1.0.
- questionVersion must be ${QUESTION_POOL_VERSION}.
- ${answerChoiceContract.replace(/\n/g, "\n- ")}
- ${youngReaderAnswerabilityContract.replace(/\n/g, "\n- ")}
- ${themeSymbolismContract.replace(/\n/g, "\n- ")}
- ${cumulativeDifficultyContract.replace(/\n/g, "\n- ")}
- Use only the exact book named above, not films, soundtracks, adaptations, sequels, prequels, or other books in a series.
- If a fact may come from another series installment or movie adaptation, do not use it.
- Do not repeat the same question idea, event, character focus, or theme focus.
- Include grounded recall and timeline questions; do not ask obscure trivia, trick questions, or impossible questions.
- Avoid "what potion/item/spell" questions unless the exact book clearly names it.
- Each answer must be clearly correct from the book.
- Each wrong answer must fit the exact book's world and style, but must be clearly false for this exact question.
- Before returning, privately test each wrong choice by asking: "Could this also be correct?" If yes, replace it.
- Also ask: "Could a young reader reasonably defend this wrong answer from the story?" If yes, replace it.
- Keep each question under 18 words.
- Keep each answer choice under 7 words.
- Keep each explanation under 14 words.
- answerIndex must point to answerText exactly.
- Use child-friendly language for ages 7-18.
- Count the questions before returning. Return JSON only.`;
};

const hardQuestionPlan: Array<{
  start: number;
  end: number;
  count: number;
  focus: string;
  questionTypes: QuestionTypeCount[];
}> = [
  {
    start: 1,
    end: 5,
    count: 5,
    focus: "characters, protagonists, antagonists, real villains, roles, and one major place",
    questionTypes: [
      { type: "character", label: "Characters, antagonists, real villains, or roles", count: 4 },
      { type: "setting", label: "Major place or setting", count: 1 },
    ],
  },
  {
    start: 6,
    end: 10,
    count: 5,
    focus: "important objects, story world details, and timeline/when events",
    questionTypes: [
      { type: "object", label: "Important objects/items", count: 2 },
      { type: "plot_event", label: "Plot events, timeline, or when questions", count: 3 },
    ],
  },
  {
    start: 11,
    end: 15,
    count: 5,
    focus: "why events happen, character motivation, and cause/effect",
    questionTypes: [
      { type: "plot_event", label: "Plot events, timeline, or when questions", count: 3 },
      { type: "character_motivation", label: "Character motivation", count: 1 },
      { type: "cause_effect", label: "Cause/effect", count: 1 },
    ],
  },
  {
    start: 16,
    end: 18,
    count: 3,
    focus: "motivation, cause/effect, conflict, climax, consequences, and key dilemmas",
    questionTypes: [
      { type: "character_motivation", label: "Character motivation", count: 1 },
      { type: "cause_effect", label: "Cause/effect", count: 1 },
      { type: "problem_solution", label: "Conflict, climax, or consequence", count: 1 },
    ],
  },
  {
    start: 19,
    end: 20,
    count: 2,
    focus: "clear symbolism and strongly supported theme",
    questionTypes: [
      { type: "symbolism", label: "Clear symbolism", count: 1 },
      { type: "theme", label: "Theme or lesson", count: 1 },
    ],
  },
];

const hardSectionPrompt = (
  book: BookDetails,
  bookLevel: string,
  learningGoal: string,
  section: typeof hardQuestionPlan[number],
  qualityNotes = "",
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(book);
  const typePlan = formatQuestionTypePrompt(section.questionTypes);

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}.
Create exactly ${section.count} hard questions for this canonical book only: ${bookIdentity}.
These are questions ${section.start}-${section.end} of a 20-question quiz.
Focus only on: ${section.focus}.
Book level: ${bookLevel}. Testing goal: ${goalDescription}.
${qualityNotes ? `\nCritical book guardrails:\n- ${qualityNotes}\n` : ""}

Question type plan:
${typePlan}

${readingQuestQuizPhilosophy}

${objectiveQuestionContract}

Each question object must have: question, questionKey, questionType, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation, qualityScore, questionVersion.
Rules:
- The questions array must contain exactly ${section.count} complete objects.
- questionKey must be a short lowercase stable question identifier for the question idea, like "arthur-earth-bypass" or "sam-frodo-trust". Treat it like a future Supabase questionId.
- questionType must exactly match the requested question plan.
- qualityScore must be a number from 0.75 to 1.0.
- questionVersion must be ${QUESTION_POOL_VERSION}.
- ${answerChoiceContract.replace(/\n/g, "\n- ")}
- ${youngReaderAnswerabilityContract.replace(/\n/g, "\n- ")}
- ${themeSymbolismContract.replace(/\n/g, "\n- ")}
- ${cumulativeDifficultyContract.replace(/\n/g, "\n- ")}
- Use only the exact book named above, not films, soundtracks, adaptations, sequels, prequels, or other books in a series.
- If a fact may come from another series installment or movie adaptation, do not use it.
- Keep each question under 18 words.
- Keep each choice under 7 words.
- Keep each explanation under 14 words.
- Do not repeat the same question idea within this section.
- Include grounded recall when this section asks for it; do not ask obscure trivia, trick questions, or impossible questions.
- Avoid "what potion/item/spell" questions unless the exact book clearly names it.
- Each answer must be clearly correct from the book.
- Each wrong answer must fit the exact book's world and style, but must be clearly false for this exact question.
- Before returning, privately test each wrong choice by asking: "Could this also be correct?" If yes, replace it.
- Also ask: "Could a young reader reasonably defend this wrong answer from the story?" If yes, replace it.
- answerIndex must point to answerText exactly.
- Use child-friendly language for ages 7-18.
- Return JSON only.`;
};

type GeneratedQuestion = {
  question?: unknown;
  choices?: unknown;
  answerIndex?: unknown;
  answerText?: unknown;
  explanation?: unknown;
  questionKey?: unknown;
  questionType?: unknown;
  qualityScore?: unknown;
  questionVersion?: unknown;
  poolQuestionId?: unknown;
};

type GeneratedQuiz = {
  quizTitle?: unknown;
  quizDescription?: unknown;
  questions?: unknown;
};

type ProceduralBatch = {
  batchNumber: number;
  batchSize: number;
  focus: string;
  questionTypes: QuestionTypeCount[];
  totalQuestions: number;
  existingQuestionKeys: string[];
  existingQuestions: string[];
};

type ProceduralPlanItem = Pick<ProceduralBatch, "batchNumber" | "batchSize" | "focus" | "questionTypes">;

const colorWords = [
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
  "purple",
  "pink",
  "black",
  "white",
  "brown",
  "gray",
  "grey",
  "gold",
  "silver",
];

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function toQuestionKey(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .slice(0, 10)
    .join("-");
}

function getQuestionIdeaKey(question: GeneratedQuestion) {
  if (typeof question.questionKey === "string" && question.questionKey.trim()) {
    return toQuestionKey(question.questionKey);
  }

  if (typeof question.question === "string") {
    return toQuestionKey(question.question);
  }

  return "";
}

function hasOverlappingChoices(choices: string[]) {
  const normalized = choices.map(normalizeText).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) {
    return true;
  }

  return normalized.some((choice, index) =>
    normalized.some((other, otherIndex) =>
      index !== otherIndex &&
      choice.length >= 4 &&
      other.length >= 4 &&
      (choice.includes(other) || other.includes(choice)),
    ),
  );
}

function hasDuplicateQuestionIdeas(questions: ReturnType<typeof normalizeQuiz>["questions"]) {
  const seenKeys = new Set<string>();
  const seenQuestions = new Set<string>();

  for (const question of questions) {
    const key = typeof question.questionKey === "string" ? toQuestionKey(question.questionKey) : "";
    const normalizedQuestion = normalizeText(String(question.question ?? ""));
    if (!key || seenKeys.has(key) || seenQuestions.has(normalizedQuestion)) {
      return true;
    }
    seenKeys.add(key);
    seenQuestions.add(normalizedQuestion);
  }

  return false;
}

function countColorsInTitle(bookTitle: string) {
  const words = bookTitle.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter((word) => colorWords.includes(word)).length;
}

function normalizeQuiz(rawQuiz: GeneratedQuiz, book: BookDetails, questionCount: number, difficulty = "easy") {
  const questions = Array.isArray(rawQuiz.questions) ? rawQuiz.questions : [];

  const normalizedQuestions = questions.slice(0, questionCount).map((rawQuestion) => {
    const generatedQuestion = rawQuestion as GeneratedQuestion;
    const rawChoices = generatedQuestion.choices;
    const question = typeof generatedQuestion.question === "string"
      ? String(generatedQuestion.question).trim()
      : "";
    const choices = Array.isArray(rawChoices)
      ? rawChoices
          .map((choice) => String(choice).trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];

    while (choices.length < 4) {
      choices.push(`Choice ${choices.length + 1}`);
    }

    const answerText = typeof generatedQuestion.answerText === "string"
      ? String(generatedQuestion.answerText).trim()
      : "";
    const rawQuestionType = typeof generatedQuestion.questionType === "string"
      ? generatedQuestion.questionType
      : "";
    const qualityScore = Number(generatedQuestion.qualityScore);
    const questionVersion = Math.max(QUESTION_POOL_VERSION, Math.round(Number(generatedQuestion.questionVersion) || QUESTION_POOL_VERSION));
    let answerIndex = Number(generatedQuestion.answerIndex);

    const answerTextIndex = answerText
      ? choices.findIndex((choice) => normalizeText(choice) === normalizeText(answerText))
      : -1;
    if (answerTextIndex >= 0) {
      answerIndex = answerTextIndex;
    }

    const asksColorCount =
      /how many/i.test(question) &&
      /colou?rs?/i.test(question) &&
      /title/i.test(question);
    if (asksColorCount) {
      const colorCount = String(countColorsInTitle(book.title));
      const colorCountIndex = choices.findIndex((choice) => normalizeText(choice) === colorCount);
      if (colorCountIndex >= 0) {
        answerIndex = colorCountIndex;
      } else if (Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < choices.length) {
        choices[answerIndex] = colorCount;
      } else {
        choices[0] = colorCount;
        answerIndex = 0;
      }
    }

    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) {
      answerIndex = 0;
    }

    return {
      question,
      questionKey: getQuestionIdeaKey(generatedQuestion),
      questionType: isQuestionType(rawQuestionType) ? rawQuestionType : getFallbackQuestionType(difficulty),
      choices,
      answerIndex,
      answerText: choices[answerIndex],
      explanation: typeof generatedQuestion.explanation === "string"
        ? String(generatedQuestion.explanation).trim()
        : "",
      qualityScore: Number.isFinite(qualityScore) ? Math.min(1, Math.max(0, qualityScore)) : 0.85,
      questionVersion,
      poolQuestionId: typeof generatedQuestion.poolQuestionId === "string" ? generatedQuestion.poolQuestionId : undefined,
    };
  });

  return {
    quizTitle: typeof rawQuiz.quizTitle === "string" ? rawQuiz.quizTitle : `${book.title} Quiz`,
    quizDescription: typeof rawQuiz.quizDescription === "string" ? rawQuiz.quizDescription : "Answer each question about the book.",
    questions: normalizedQuestions,
  };
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON object found.");
    }
    return JSON.parse(jsonMatch[0]);
  }
}

function getSafeGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/api key|unauthorized|authentication|401/i.test(message)) {
    return "Quiz generation is not available because the API key is not authorized.";
  }
  if (/model|does not have access|permission|not found|404|403/i.test(message)) {
    return `Quiz generation is not available because this API key cannot use ${quizModel}.`;
  }
  if (/connection error|network|fetch failed/i.test(message)) {
    return "Quiz generation could not connect to the quiz service. Please try again.";
  }
  if (/verified story details|fact sheet|grounding|stored quiz questions need/i.test(message)) {
    return message;
  }
  return message || "Quiz generation returned invalid JSON. Please try again.";
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getCanonicalKey(book: BookDetails, providedKey = "") {
  return providedKey || getBookDifficultyKey({
    title: book.title,
    author: book.author,
    isbn: book.isbn,
  });
}

async function loadStoredQuiz(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  questionCount: number;
  canonicalKey: string;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("book_question_pool")
      .select("*")
      .eq("canonical_key", details.canonicalKey)
      .eq("quiz_difficulty", details.difficulty as "easy" | "medium" | "hard")
      .eq("question_version", QUESTION_POOL_VERSION)
      .eq("active", true)
      .lte("report_count", 2)
      .order("quality_score", { ascending: false })
      .order("times_used", { ascending: true })
      .limit(100);

    if (error || !data || data.length < details.questionCount) return null;

    const selected: typeof data = [];
    const usedIds = new Set<string>();
    const typeCounts = getQuestionTypeCounts(details.difficulty, details.questionCount);
    for (const plan of typeCounts) {
      const matching = data.filter((question) =>
        question.question_type === plan.type && !usedIds.has(question.id),
      ).slice(0, plan.count);
      matching.forEach((question) => {
        selected.push(question);
        usedIds.add(question.id);
      });
    }

    for (const question of data) {
      if (selected.length >= details.questionCount) break;
      if (!usedIds.has(question.id)) {
        selected.push(question);
        usedIds.add(question.id);
      }
    }

    if (selected.length < details.questionCount) return null;

    const quiz = normalizeQuiz({
      quizTitle: `${details.book.title} Quiz`,
      quizDescription: "Answer each question about the book.",
      questions: selected.map((question) => ({
        question: question.question,
        questionKey: question.question_key,
        questionType: question.question_type,
        choices: question.choices,
        answerIndex: question.answer_index,
        answerText: question.answer_text,
        explanation: question.explanation,
        qualityScore: question.quality_score,
        questionVersion: question.question_version,
        poolQuestionId: question.id,
      })),
    }, details.book, details.questionCount, details.difficulty);

    await Promise.allSettled(selected.map((question) =>
      supabase
        .from("book_question_pool")
        .update({
          times_used: Number(question.times_used ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", question.id),
    ));

    return quiz;
  } catch {
    return null;
  }
}

async function storeQuestionPool(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  canonicalKey: string;
  bookDifficultyRatingId?: string;
  quizData: ReturnType<typeof normalizeQuiz>;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    const rows = details.quizData.questions.map((question) => {
      const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
      return {
      book_difficulty_rating_id: isUuid(details.bookDifficultyRatingId) ? details.bookDifficultyRatingId : null,
      canonical_key: details.canonicalKey,
      book_title: details.book.title,
      author: details.book.author || null,
      quiz_difficulty: details.difficulty,
      question_type: question.questionType,
      book_level: details.bookLevel,
      question_key: question.questionKey,
      question: question.question,
      choices: choices as any,
      answer_index: question.answerIndex,
      answer_text: question.answerText ?? choices[question.answerIndex],
      explanation: question.explanation ?? "",
      quality_score: question.qualityScore ?? 0.85,
      question_version: QUESTION_POOL_VERSION,
      updated_at: new Date().toISOString(),
    };
    });

    if (rows.length === 0) return;
    await supabase
      .from("book_question_pool")
      .upsert(rows as any, {
        onConflict: "canonical_key,quiz_difficulty,question_type,question_key,question_version",
      });
  } catch {
    // Question pooling should never block a child from receiving a quiz.
  }
}

async function getPoolSnapshot(details: {
  canonicalKey: string;
  difficulty: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("book_question_pool")
    .select("question_key,question")
    .eq("canonical_key", details.canonicalKey)
    .eq("quiz_difficulty", details.difficulty as "easy" | "medium" | "hard")
    .eq("question_version", QUESTION_POOL_VERSION)
    .eq("active", true)
    .lte("report_count", 2)
    .limit(200);

  if (error || !data) {
    return { count: 0, questionKeys: [] as string[], questions: [] as string[] };
  }

  return {
    count: data.length,
    questionKeys: data.map((question) => String(question.question_key ?? "")).filter(Boolean),
    questions: data.map((question) => String(question.question ?? "")).filter(Boolean),
  };
}

function schedulePoolTopUp(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  canonicalKey: string;
  bookDifficultyRatingId?: string;
  qualityNotes: string;
  grounding?: QuizGrounding | null;
}) {
  void topUpQuestionPool(details).catch(() => undefined);
}

async function generateTopUpQuiz(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
  qualityNotes: string;
  previousQuestions: string[];
}) {
  const response = await openai.chat.completions.create({
    model: quizModel,
    max_tokens: Math.max(1300, details.questionCount * 380),
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher. Create accurate supplemental quiz-pool questions for the exact named book only. Return only valid JSON.",
      },
      {
        role: "user",
        content: prompt(
          details.book,
          details.difficulty,
          details.bookLevel,
          details.learningGoal,
          details.questionCount,
          { number: 1, total: 1, previousQuestions: details.previousQuestions.slice(0, 60) },
          details.qualityNotes,
        ),
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return normalizeQuiz(parseJsonObject(text.trim()), details.book, details.questionCount, details.difficulty);
}

async function topUpQuestionPool(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  canonicalKey: string;
  bookDifficultyRatingId?: string;
  qualityNotes: string;
  grounding?: QuizGrounding | null;
}) {
  const difficultyKey = details.difficulty as "easy" | "medium" | "hard";
  const target = quizDifficultyPlans[difficultyKey]?.poolSize;
  const topUpLimit = poolTopUpCounts[difficultyKey];
  if (!target || !topUpLimit) {
    return;
  }

  const snapshot = await getPoolSnapshot({
    canonicalKey: details.canonicalKey,
    difficulty: details.difficulty,
  });
  const needed = Math.min(topUpLimit, Math.max(0, target - snapshot.count));
  if (needed <= 0) {
    return;
  }

  const quiz = await generateTopUpQuiz({
    book: details.book,
    difficulty: details.difficulty,
    bookLevel: details.bookLevel,
    learningGoal: details.learningGoal,
    questionCount: needed,
    qualityNotes: details.qualityNotes,
    previousQuestions: snapshot.questions,
  });
  const reviewedQuiz = await reviewQuizWithModel(quiz, {
    book: details.book,
    difficulty: details.difficulty,
    bookLevel: details.bookLevel,
    learningGoal: details.learningGoal,
    questionCount: needed,
    qualityNotes: details.qualityNotes,
  });
  const groundedQuiz = getGroundedQuiz(reviewedQuiz, details.grounding, needed);

  const existingKeys = new Set(snapshot.questionKeys.map(toQuestionKey));
  const existingQuestionText = new Set(snapshot.questions.map(normalizeText));
  const filteredQuiz = {
    ...groundedQuiz,
    questions: groundedQuiz.questions.filter((question) => {
      const key = toQuestionKey(String(question.questionKey ?? ""));
      const textKey = normalizeText(String(question.question ?? ""));
      if (!key || existingKeys.has(key) || existingQuestionText.has(textKey)) {
        return false;
      }
      existingKeys.add(key);
      existingQuestionText.add(textKey);
      return true;
    }).slice(0, needed),
  };

  if (filteredQuiz.questions.length > 0 && isValidQuiz(filteredQuiz, filteredQuiz.questions.length)) {
    await storeQuestionPool({
      book: details.book,
      difficulty: details.difficulty,
      bookLevel: details.bookLevel,
      canonicalKey: details.canonicalKey,
      bookDifficultyRatingId: details.bookDifficultyRatingId,
      quizData: filteredQuiz,
    });
  }
}

async function reviewQuizWithModel(
  quizData: ReturnType<typeof normalizeQuiz>,
  details: {
    book: BookDetails;
    difficulty: string;
    bookLevel: string;
    learningGoal: string;
    questionCount: number;
    qualityNotes: string;
  },
) {
  const response = await openai.chat.completions.create({
    model: quizModel,
    messages: [
      {
        role: "system",
        content:
          "You are a strict quiz quality reviewer for children's reading comprehension. Return only a valid JSON object, with no markdown and no commentary. Fix wrong answers, impossible questions, weak distractors, answerIndex mismatches, difficulty mismatches, and any question with more than one defensible correct answer. Reject questions where a thoughtful young reader could reasonably defend more than one choice. Reject opinion, trivia, adaptation, sequel, later-series, author-biography, and vague interpretation questions. For theme or symbolism questions, reject literal plot results as correct answers unless the question is explicitly cause/effect. Preserve cumulative difficulty balance: Medium builds on Easy, and Hard builds on Easy plus Medium with grounded recall, timeline, character, place, object, motivation, and cause/effect questions. If a question cannot be verified, replace it with a safer question.",
      },
      {
        role: "user",
        content: `Review this quiz for the exact book ${describeBook(details.book)}. Difficulty: ${details.difficulty}. Reading level: ${details.bookLevel}. Testing level: ${details.learningGoal}.${details.qualityNotes ? `\n\nCritical book guardrails:\n- ${details.qualityNotes}` : ""}\n\nIt must have exactly ${details.questionCount} questions, 4 choices per question, a stable questionKey, a valid questionType, qualityScore, questionVersion ${QUESTION_POOL_VERSION}, a correct answerIndex, answerText matching choices[answerIndex], and a short explanation.\n\n${readingQuestQuizPhilosophy}\n\n${objectiveQuestionContract}\n\n${answerChoiceContract}\n\n${youngReaderAnswerabilityContract}\n\n${themeSymbolismContract}\n\n${cumulativeDifficultyContract}\n\nFor every question, audit all four choices. If any wrong choice is technically true, emotionally true, partially true, a broader category containing the correct answer, a narrower example of the correct answer, a synonym, a restatement, a second valid motive, a second valid theme, or otherwise defensible, replace that choice or replace the entire question. Reject broad motive questions such as "What motivates..." when several answer choices are true traits or reasons; rewrite them around a specific action and the most direct cause. Reject vague wording such as strongest, best, most important, true meaning, biggest lesson, or main message unless the question makes the answer objective and directly text-supported. For Easy and Medium, use concrete, plainly answerable book facts, sequence, motivation, and cause/effect instead of debatable interpretation. For theme/symbolism questions, verify that the correct answer is the symbolic or thematic meaning, not the literal result of the action; if the answer is literal, rewrite it as cause/effect or replace the question. For timeline or "when" questions, reject or rewrite any question that could refer to multiple repeated events unless the question includes a clear sequence reference such as first time, after they split up, before the ending, after returning, or a named scene. Remove or replace any question that uses a movie/adaptation fact, another book in a series, a later-book fact, an impossible premise, or an unverified answer. Preserve or assign a stable lowercase questionKey from the requested difficulty plan. Return only the corrected JSON object.\n\n${JSON.stringify(quizData)}`,
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(text);
  return normalizeQuiz(parsed, details.book, details.questionCount, details.difficulty);
}

function isValidQuiz(quizData: ReturnType<typeof normalizeQuiz>, questionCount: number) {
  return (
    typeof quizData.quizTitle === "string" &&
    typeof quizData.quizDescription === "string" &&
    Array.isArray(quizData.questions) &&
    quizData.questions.length === questionCount &&
    quizData.questions.every((question) => {
      const answerIndex = Number(question.answerIndex);
      return (
        typeof question.question === "string" &&
        question.question.trim().length > 0 &&
        typeof question.questionKey === "string" &&
        question.questionKey.trim().length > 0 &&
        typeof question.questionType === "string" &&
        isQuestionType(question.questionType) &&
        Array.isArray(question.choices) &&
        question.choices.length === 4 &&
        question.choices.every((choice) => typeof choice === "string" && choice.trim().length > 0) &&
        !hasOverlappingChoices(question.choices) &&
        Number.isInteger(answerIndex) &&
        answerIndex >= 0 &&
        answerIndex < 4
      );
    }) &&
    !hasDuplicateQuestionIdeas(quizData.questions)
  );
}

function getGroundedQuiz(
  quizData: ReturnType<typeof normalizeQuiz>,
  grounding: QuizGrounding | null | undefined,
  questionCount: number,
) {
  if (!grounding) {
    return quizData;
  }

  const rejected: Array<{ question: string; unsupportedTerms: string[] }> = [];
  const questions = quizData.questions.filter((question) => {
    const unsupportedTerms = getUnsupportedQuizTerms(question, grounding.factSheet);
    if (unsupportedTerms.length > 0) {
      rejected.push({ question: question.question, unsupportedTerms });
      return false;
    }
    return true;
  });

  if (rejected.length > 0) {
    void logQuizGroundingRejections({
      factSheet: grounding.factSheet,
      rejected,
    });
  }

  return {
    ...quizData,
    questions: questions.slice(0, questionCount),
  };
}

async function logQuizGroundingRejections(details: {
  factSheet: BookFactSheet;
  rejected: Array<{ question: string; unsupportedTerms: string[] }>;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("telemetry_events").insert({
      profile_id: null,
      page: "/api/quiz",
      event_name: "quiz_grounding_rejection",
      metadata: {
        message: "Quiz questions rejected because they used facts outside the verified book fact sheet.",
        title: details.factSheet.title,
        author: details.factSheet.author,
        canonicalKey: details.factSheet.canonicalKey,
        sourceConfidence: details.factSheet.sourceConfidence,
        rejected: details.rejected.slice(0, 10),
      },
    } as any);
  } catch {
    // QA logging should never block quiz generation.
  }
}

async function generateQuizSection(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
  qualityNotes: string;
  section?: { number: number; total: number; previousQuestions: string[] };
}) {
  const userPrompt = details.difficulty === "hard"
    ? hardPrompt(details.book, details.bookLevel, details.learningGoal, details.qualityNotes)
    : prompt(
        details.book,
        details.difficulty,
        details.bookLevel,
        details.learningGoal,
        details.questionCount,
        details.section,
        details.qualityNotes,
      );

  const response = await openai.chat.completions.create({
    model: quizModel,
    max_tokens: Math.min(6500, Math.max(2200, details.questionCount * 320)),
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher and literary quiz writer. You make accurate child-friendly quizzes for the exact named book only. You reject movie/adaptation facts, sequel/prequel facts, and uncertain trivia. Return only a valid JSON object, with no markdown and no commentary.",
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return normalizeQuiz(parseJsonObject(text.trim()), details.book, details.questionCount, details.difficulty);
}

async function generateHardQuiz(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
  qualityNotes: string;
}) {
  const sectionQuizzes = await Promise.all(
    hardQuestionPlan.map(async (section) => {
      const response = await openai.chat.completions.create({
        model: quizModel,
        max_tokens: Math.max(1200, section.count * 360),
        messages: [
          {
            role: "system",
            content: "You are a careful reading teacher. Create questions for the exact named book only; reject adaptation facts and facts from other series installments. Return only valid JSON for the requested hard quiz section.",
          },
          {
            role: "user",
            content: hardSectionPrompt(details.book, details.bookLevel, details.learningGoal, section, details.qualityNotes),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content ?? "";
      const quiz = normalizeQuiz(parseJsonObject(text.trim()), details.book, section.count, details.difficulty);
      if (!isValidQuiz(quiz, section.count)) {
        throw new Error("Quiz generation returned an incomplete hard quiz section.");
      }
      return quiz;
    }),
  );

  const questions = sectionQuizzes.flatMap((quiz) => quiz.questions).slice(0, details.questionCount);
  const quizData = {
    quizTitle: `${details.book.title} Hard Quiz`,
    quizDescription: "Answer each question about the book.",
    questions,
  };

  if (!isValidQuiz(quizData, details.questionCount)) {
    throw new Error("Quiz generation returned an incomplete quiz. Please try again.");
  }

  return quizData;
}

function getProceduralPlan(difficulty: string): ProceduralPlanItem[] {
  if (difficulty === "hard") {
    return [
      {
        batchNumber: 1,
        batchSize: 5,
        focus: "characters, protagonists, antagonists, real villains, roles, and one major place",
        questionTypes: [
          { type: "character", label: "Characters, antagonists, real villains, or roles", count: 4 },
          { type: "setting", label: "Major place or setting", count: 1 },
        ],
      },
      {
        batchNumber: 2,
        batchSize: 5,
        focus: "important objects, story world details, and timeline/when events",
        questionTypes: [
          { type: "object", label: "Important objects/items", count: 2 },
          { type: "plot_event", label: "Plot events, timeline, or when questions", count: 3 },
        ],
      },
      {
        batchNumber: 3,
        batchSize: 5,
        focus: "why events happen, character motivation, and cause/effect",
        questionTypes: [
          { type: "plot_event", label: "Plot events, timeline, or when questions", count: 3 },
          { type: "character_motivation", label: "Character motivation", count: 1 },
          { type: "cause_effect", label: "Cause/effect", count: 1 },
        ],
      },
      {
        batchNumber: 4,
        batchSize: 3,
        focus: "motivation, cause/effect, conflict, climax, consequences, and key dilemmas",
        questionTypes: [
          { type: "character_motivation", label: "Character motivation", count: 1 },
          { type: "cause_effect", label: "Cause/effect", count: 1 },
          { type: "problem_solution", label: "Conflict, climax, or consequence", count: 1 },
        ],
      },
      {
        batchNumber: 5,
        batchSize: 2,
        focus: "clear symbolism and strongly supported theme",
        questionTypes: [
          { type: "symbolism", label: "Clear symbolism", count: 1 },
          { type: "theme", label: "Theme or lesson", count: 1 },
        ],
      },
    ];
  }

  if (difficulty === "medium") {
    return [
      {
        batchNumber: 1,
        batchSize: 4,
        focus: "important characters, antagonists, places, and objects",
        questionTypes: [
          { type: "character", label: "Characters, antagonists, or roles", count: 2 },
          { type: "setting", label: "Places/settings", count: 1 },
          { type: "object", label: "Important objects/items", count: 1 },
        ],
      },
      {
        batchNumber: 2,
        batchSize: 3,
        focus: "plot events, timeline, and when things happen",
        questionTypes: [
          { type: "character", label: "Characters, antagonists, or roles", count: 1 },
          { type: "plot_event", label: "Plot events or timeline/when", count: 2 },
        ],
      },
      {
        batchNumber: 3,
        batchSize: 3,
        focus: "plot sequence, why things happen, and cause/effect",
        questionTypes: [
          { type: "plot_event", label: "Plot events or timeline/when", count: 1 },
          { type: "character_motivation", label: "Character motivation", count: 1 },
          { type: "cause_effect", label: "Cause/effect", count: 1 },
        ],
      },
    ];
  }

  return [
    {
      batchNumber: 1,
      batchSize: 5,
      focus: "simple characters, settings, objects, and one why question",
      questionTypes: [
        { type: "character", label: "Characters or roles", count: 2 },
        { type: "setting", label: "Places/settings", count: 1 },
        { type: "object", label: "Important objects/items", count: 1 },
        { type: "simple_motive", label: "Simple why/motive", count: 1 },
      ],
    },
  ];
}

function getNextProceduralBatch(difficulty: string, generatedCount: number) {
  let remaining = generatedCount;
  return getProceduralPlan(difficulty).find((batch) => {
    if (remaining < batch.batchSize) {
      return true;
    }
    remaining -= batch.batchSize;
    return false;
  });
}

function proceduralPrompt(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  qualityNotes: string;
  batch: ProceduralBatch;
}) {
  const goalDescription = goalMap[details.learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(details.book);
  const existingKeys = details.batch.existingQuestionKeys.length
    ? details.batch.existingQuestionKeys.map((key) => `"${key}"`).join(", ")
    : "none";
  const existingQuestions = details.batch.existingQuestions.length
    ? details.batch.existingQuestions.map((question) => `"${question}"`).join("; ")
    : "none";
  const batchTypePlan = formatQuestionTypePrompt(details.batch.questionTypes);

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}.
Create exactly ${details.batch.batchSize} questions for this canonical book only: ${bookIdentity}.
This is batch ${details.batch.batchNumber} for a ${details.batch.totalQuestions}-question ${details.difficulty} quiz.
Batch focus: ${details.batch.focus}.
Book level: ${details.bookLevel}. Testing goal: ${goalDescription}.
${details.qualityNotes ? `\nCritical book guardrails:\n- ${details.qualityNotes}\n` : ""}

Question type plan for this batch:
${batchTypePlan}

${readingQuestQuizPhilosophy}

${objectiveQuestionContract}

Each question object must have: question, questionKey, questionType, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation, qualityScore, questionVersion.

Already used question keys: ${existingKeys}.
Already used question wording: ${existingQuestions}.

Rules:
- The questions array must contain exactly ${details.batch.batchSize} complete objects.
- questionKey must be a short lowercase stable question identifier for the question idea, like "arthur-earth-bypass" or "sam-frodo-trust". Treat it like a future Supabase questionId.
- questionType must exactly match the requested type plan.
- qualityScore must be a number from 0.75 to 1.0.
- questionVersion must be ${QUESTION_POOL_VERSION}.
- Do not reuse or rephrase any used question key, question idea, event focus, or wording.
- ${answerChoiceContract.replace(/\n/g, "\n- ")}
- ${youngReaderAnswerabilityContract.replace(/\n/g, "\n- ")}
- ${themeSymbolismContract.replace(/\n/g, "\n- ")}
- ${cumulativeDifficultyContract.replace(/\n/g, "\n- ")}
- Use only the exact book named above, not films, soundtracks, games, adaptations, sequels, prequels, or other books in a series.
- If a fact may come from another series installment or movie adaptation, do not use it.
- Keep each question under 18 words.
- Keep each choice under 7 words.
- Keep each explanation under 14 words.
- Avoid obscure trivia, trick questions, and impossible questions.
- Avoid "what potion/item/spell" questions unless the exact book clearly names it.
- Each answer must be clearly correct from the book.
- Each wrong answer must fit the exact book's world and style, but must be clearly false for this exact question.
- Before returning, privately test each wrong choice by asking: "Could this also be correct?" If yes, replace it.
- Also ask: "Could a young reader reasonably defend this wrong answer from the story?" If yes, replace it.
- answerIndex must point to answerText exactly.
- Use child-friendly language for ages 7-18.
- Return JSON only.`;
}

async function generateProceduralBatch(details: {
  book: BookDetails;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
  qualityNotes: string;
  grounding?: QuizGrounding | null;
  generatedCount: number;
  existingQuestionKeys: string[];
  existingQuestions: string[];
}) {
  const planBatch = getNextProceduralBatch(details.difficulty, details.generatedCount);
  if (!planBatch) {
    throw new Error("Quiz is already complete.");
  }

  const remaining = Math.max(0, details.questionCount - details.generatedCount);
  const batch: ProceduralBatch = {
    ...planBatch,
    batchSize: Math.min(planBatch.batchSize, remaining),
    totalQuestions: details.questionCount,
    existingQuestionKeys: details.existingQuestionKeys.map(toQuestionKey).filter(Boolean),
    existingQuestions: details.existingQuestions.filter(Boolean),
  };

  const response = await openai.chat.completions.create({
    model: quizModel,
    max_tokens: Math.max(1300, batch.batchSize * 380),
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher. Create accurate quiz questions for the exact named book only. Return only valid JSON.",
      },
      {
        role: "user",
        content: proceduralPrompt({ ...details, batch }),
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  const quiz = normalizeQuiz(parseJsonObject(text.trim()), details.book, batch.batchSize, details.difficulty);
  const reviewedQuiz = await reviewQuizWithModel(quiz, {
    book: details.book,
    difficulty: details.difficulty,
    bookLevel: details.bookLevel,
    learningGoal: details.learningGoal,
    questionCount: batch.batchSize,
    qualityNotes: details.qualityNotes,
  });

  const groundedQuiz = getGroundedQuiz(reviewedQuiz, details.grounding, batch.batchSize);
  const existingKeys = new Set(batch.existingQuestionKeys);
  const existingQuestionText = new Set(batch.existingQuestions.map(normalizeText));
  const filteredQuestions = groundedQuiz.questions.filter((question) => {
    const key = toQuestionKey(String(question.questionKey ?? ""));
    const textKey = normalizeText(String(question.question ?? ""));
    if (!key || existingKeys.has(key) || existingQuestionText.has(textKey)) {
      return false;
    }
    existingKeys.add(key);
    existingQuestionText.add(textKey);
    return true;
  });

  const quizData = {
    ...groundedQuiz,
    questions: filteredQuestions.slice(0, batch.batchSize),
  };

  if (!isValidQuiz(quizData, batch.batchSize)) {
    throw new Error("Quiz generation returned an incomplete batch. Please try again.");
  }

  return {
    quiz: quizData,
    batch,
    plan: getProceduralPlan(details.difficulty),
  };
}

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const bookAuthor = String(body.bookAuthor || "").trim();
  const bookYear = body.bookYear ? String(body.bookYear).trim() : "";
  const bookIsbn = String(body.bookIsbn || "").trim();
  const bookDifficultyRatingId = String(body.bookDifficultyRatingId || "").trim();
  const providedCanonicalKey = String(body.bookDifficultyCanonicalKey || "").trim();
  const requestedDifficulty = String(body.difficulty || "easy").toLowerCase();
  const difficulty = difficultyMap[requestedDifficulty as keyof typeof difficultyMap] || "easy";
  const bookLevel = String(body.bookLevel || "intermediate");
  const learningGoal = String(body.learningGoal || "basic_recollection");
  const questionCount = getQuestionCount(difficulty);
  const mode = String(body.mode || "full");
  const generatedCount = Number(body.generatedCount || 0);
  const existingQuestionKeys = Array.isArray(body.existingQuestionKeys)
    ? body.existingQuestionKeys.map((key: unknown) => String(key))
    : [];
  const existingQuestions = Array.isArray(body.existingQuestions)
    ? body.existingQuestions.map((question: unknown) => String(question))
    : [];

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  const book = {
    title: bookTitle,
    author: bookAuthor,
    year: bookYear,
    isbn: bookIsbn,
  };
  const canonicalKey = getCanonicalKey(book, providedCanonicalKey);
  let qualityNotes = getBookQualityNotes(book);

  if (!isDifficultyAllowedForBookLevel(difficulty, bookLevel)) {
    const allowed = getAllowedDifficulties(bookLevel);
    return NextResponse.json(
      {
        error: `This book level can only be tested on: ${allowed.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  let grounding: QuizGrounding | null = null;
  try {
    grounding = await prepareQuizGrounding({ book, difficulty, canonicalKey });
    qualityNotes = combineQualityNotes(qualityNotes, grounding?.prompt);
  } catch (error) {
    return NextResponse.json(
      { error: getSafeGenerationError(error) },
      { status: 502 },
    );
  }

  if (mode === "procedural_starter" || mode === "procedural_next") {
    try {
      const startedAt = Date.now();
      if (mode === "procedural_starter") {
        const storedQuiz = await loadStoredQuiz({
          book,
          difficulty,
          bookLevel,
          questionCount,
          canonicalKey,
        });
        if (storedQuiz && isValidQuiz(storedQuiz, questionCount)) {
          const groundedStoredQuiz = getGroundedQuiz(storedQuiz, grounding, questionCount);
          if (!isValidQuiz(groundedStoredQuiz, questionCount)) {
            throw new Error("Stored quiz questions need more verified story details before this challenge can start.");
          }
          schedulePoolTopUp({
            book,
            difficulty,
            bookLevel,
            learningGoal,
            canonicalKey,
            bookDifficultyRatingId,
            qualityNotes,
            grounding,
          });
          return NextResponse.json({
            quiz: groundedStoredQuiz,
            totalQuestions: questionCount,
            complete: true,
            fromQuestionPool: true,
            generationMs: Date.now() - startedAt,
          });
        }
      }

      const batchData = await generateProceduralBatch({
        book,
        difficulty,
        bookLevel,
        learningGoal,
        questionCount,
        qualityNotes,
        grounding,
        generatedCount,
        existingQuestionKeys,
        existingQuestions,
      });
      await storeQuestionPool({
        book,
        difficulty,
        bookLevel,
        canonicalKey,
        bookDifficultyRatingId,
        quizData: batchData.quiz,
      });
      schedulePoolTopUp({
        book,
        difficulty,
        bookLevel,
        learningGoal,
        canonicalKey,
        bookDifficultyRatingId,
        qualityNotes,
        grounding,
      });
      return NextResponse.json({
        ...batchData,
        totalQuestions: questionCount,
        complete: generatedCount + batchData.quiz.questions.length >= questionCount,
        generationMs: Date.now() - startedAt,
      });
    } catch (error) {
      return NextResponse.json(
        { error: getSafeGenerationError(error) },
        { status: 502 },
      );
    }
  }

  let quizData: ReturnType<typeof normalizeQuiz>;
  try {
    const storedQuiz = await loadStoredQuiz({
      book,
      difficulty,
      bookLevel,
      questionCount,
      canonicalKey,
    });
    if (storedQuiz && isValidQuiz(storedQuiz, questionCount)) {
      const groundedStoredQuiz = getGroundedQuiz(storedQuiz, grounding, questionCount);
      if (!isValidQuiz(groundedStoredQuiz, questionCount)) {
        throw new Error("Stored quiz questions need more verified story details before this challenge can start.");
      }
      schedulePoolTopUp({
        book,
        difficulty,
        bookLevel,
        learningGoal,
        canonicalKey,
        bookDifficultyRatingId,
        qualityNotes,
        grounding,
      });
      return NextResponse.json({ quiz: groundedStoredQuiz, fromQuestionPool: true });
    }

    quizData = questionCount > 10
      ? await generateHardQuiz({ book, difficulty, bookLevel, learningGoal, questionCount, qualityNotes })
      : await generateQuizSection({ book, difficulty, bookLevel, learningGoal, questionCount, qualityNotes });
  } catch (error) {
    return NextResponse.json(
      { error: getSafeGenerationError(error) },
      { status: 502 },
    );
  }

  if (!isValidQuiz(quizData, questionCount)) {
    return NextResponse.json(
      { error: "Quiz generation returned an incomplete quiz. Please try again." },
      { status: 502 },
    );
  }

  try {
    const reviewedQuiz = await reviewQuizWithModel(quizData, {
      book,
      difficulty,
      bookLevel,
      learningGoal,
      questionCount,
      qualityNotes,
    });
    if (!isValidQuiz(reviewedQuiz, questionCount)) {
      const groundedOriginalQuiz = getGroundedQuiz(quizData, grounding, questionCount);
      if (!isValidQuiz(groundedOriginalQuiz, questionCount)) {
        throw new Error("Quiz questions need more verified story details before this challenge can start.");
      }
      await storeQuestionPool({ book, difficulty, bookLevel, canonicalKey, bookDifficultyRatingId, quizData: groundedOriginalQuiz });
      schedulePoolTopUp({
        book,
        difficulty,
        bookLevel,
        learningGoal,
        canonicalKey,
        bookDifficultyRatingId,
        qualityNotes,
        grounding,
      });
      return NextResponse.json({ quiz: groundedOriginalQuiz });
    }
    const groundedQuiz = getGroundedQuiz(reviewedQuiz, grounding, questionCount);
    if (!isValidQuiz(groundedQuiz, questionCount)) {
      throw new Error("Quiz questions need more verified story details before this challenge can start.");
    }
    await storeQuestionPool({ book, difficulty, bookLevel, canonicalKey, bookDifficultyRatingId, quizData: groundedQuiz });
    schedulePoolTopUp({
      book,
      difficulty,
      bookLevel,
      learningGoal,
      canonicalKey,
      bookDifficultyRatingId,
      qualityNotes,
      grounding,
    });
    return NextResponse.json({ quiz: groundedQuiz });
  } catch (error) {
    const groundedOriginalQuiz = getGroundedQuiz(quizData, grounding, questionCount);
    if (!isValidQuiz(groundedOriginalQuiz, questionCount)) {
      return NextResponse.json(
        { error: getSafeGenerationError(error) },
        { status: 502 },
      );
    }
    await storeQuestionPool({ book, difficulty, bookLevel, canonicalKey, bookDifficultyRatingId, quizData: groundedOriginalQuiz });
    schedulePoolTopUp({
      book,
      difficulty,
      bookLevel,
      learningGoal,
      canonicalKey,
      bookDifficultyRatingId,
      qualityNotes,
      grounding,
    });
    return NextResponse.json({ quiz: groundedOriginalQuiz });
  }
}
