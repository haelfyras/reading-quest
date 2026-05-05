import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";
import {
  getAllowedDifficulties,
  getQuestionCount,
  isDifficultyAllowedForBookLevel,
} from "../../../lib/scoring";

export const maxDuration = 60;

const difficultyMap = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const quizModel = "gpt-4o-mini";

const goalMap: Record<string, string> = {
  habit_formation: "Habit Forming: prioritize confidence, completion, and encouraging the child to read more. Ask approachable questions about obvious story moments, main characters, and broad events. Avoid trick questions.",
  basic_recollection: "Basic Recollection: focus on names, places, objects, characters, settings, and clear events from the story.",
  basic_comprehension: "Basic Recollection: focus on names, places, objects, characters, settings, and clear events from the story.",
  further_understanding: "Further Understanding: focus on why characters did something, why they went somewhere, cause and effect, motivations, and how actions connect to story outcomes.",
  deeper_understanding: "Further Understanding: focus on why characters did something, why they went somewhere, cause and effect, motivations, and how actions connect to story outcomes.",
  full_understanding: "Full Understanding: focus on the bigger picture of the work, including themes, lessons, symbolism, character growth, social context, and how events or choices support the meaning of the book.",
  literary_analysis: "Full Understanding: focus on the bigger picture of the work, including themes, lessons, symbolism, character growth, social context, and how events or choices support the meaning of the book.",
};

const prompt = (
  bookTitle: string,
  difficulty: string,
  bookLevel: string,
  learningGoal: string,
  questionCount: number,
  section?: { number: number; total: number; previousQuestions: string[] },
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const sectionInstruction = section
    ? `\n\nThis is section ${section.number} of ${section.total}. Create exactly ${questionCount} new questions for this section only. Do not repeat these earlier questions: ${section.previousQuestions.length ? section.previousQuestions.map((question) => `"${question}"`).join("; ") : "none"}.`
    : "";

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}. Create exactly ${questionCount} questions. Each question must have: question, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation.\n\nBook: "${bookTitle}". Test difficulty: ${difficulty}. Book level: ${bookLevel}. Testing goal: ${goalDescription}.\n\nRules:\n- Keep every question under 18 words, every choice under 7 words, every explanation under 14 words.\n- answerIndex must point to answerText exactly.\n- Every question must be answerable from the book and have one clear correct answer.\n- Do not ask impossible, obscure, trick, spoiler-only, or repeated/rephrased questions.\n- Counting-question answers must be numbers.\n- Easy = simple title/character/obvious-event questions.\n- Medium = details, roles, setting, conflict, motivation, cause/effect.\n- Hard = inference, theme, symbolism, context, subtle motivation, relationships, consequences, or comparisons.\n- Choices must be plausible, similar in style, and from the same book, series, author, or literary role.\n- Never use joke or unrelated pop-culture answers unless they truly appear in the book.\n- Use child-friendly language for ages 7-12.\n- Silently verify all answers before returning JSON.${sectionInstruction}`;
};

type GeneratedQuestion = {
  question?: unknown;
  choices?: unknown;
  answerIndex?: unknown;
  answerText?: unknown;
  explanation?: unknown;
};

type GeneratedQuiz = {
  quizTitle?: unknown;
  quizDescription?: unknown;
  questions?: unknown;
};

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
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function questionSignature(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|a|an|in|on|of|to|for|and|or|does|do|did|is|are|was|were)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDuplicateQuestions(questions: Array<{ question?: unknown }>) {
  const seen = new Set<string>();

  for (const question of questions) {
    const signature = questionSignature(question.question);
    if (!signature) {
      continue;
    }
    if (seen.has(signature)) {
      return true;
    }
    seen.add(signature);
  }

  return false;
}

function countColorsInTitle(bookTitle: string) {
  const words = bookTitle.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.filter((word) => colorWords.includes(word)).length;
}

function normalizeQuiz(rawQuiz: GeneratedQuiz, bookTitle: string, questionCount: number) {
  const questions = Array.isArray(rawQuiz.questions) ? rawQuiz.questions : [];

  const normalizedQuestions = questions.slice(0, questionCount).map((rawQuestion): GeneratedQuestion => {
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
      const colorCount = String(countColorsInTitle(bookTitle));
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
      choices,
      answerIndex,
      answerText: choices[answerIndex],
      explanation: typeof generatedQuestion.explanation === "string"
        ? String(generatedQuestion.explanation).trim()
        : "",
    };
  });

  return {
    quizTitle: typeof rawQuiz.quizTitle === "string" ? rawQuiz.quizTitle : `${bookTitle} Quiz`,
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

async function reviewQuizWithModel(
  quizData: ReturnType<typeof normalizeQuiz>,
  details: {
    bookTitle: string;
    difficulty: string;
    bookLevel: string;
    learningGoal: string;
    questionCount: number;
  },
) {
  const response = await openai.chat.completions.create({
    model: quizModel,
    messages: [
      {
        role: "system",
        content:
          "You are a strict quiz quality reviewer. Return only a valid JSON object, with no markdown and no commentary. Fix wrong answers, impossible questions, weak distractors, answerIndex mismatches, and difficulty mismatches. If a question cannot be verified, replace it with a safer question.",
      },
      {
        role: "user",
        content: `Review this quiz for "${details.bookTitle}". Difficulty: ${details.difficulty}. Reading level: ${details.bookLevel}. Testing level: ${details.learningGoal}. It must have exactly ${details.questionCount} questions, 4 choices per question, a correct answerIndex, answerText matching choices[answerIndex], and a short explanation. For medium/hard quizzes, distractors must be plausible and from the same book, series, author, or literary role. Return only the corrected JSON object.\n\n${JSON.stringify(quizData)}`,
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(text);
  return normalizeQuiz(parsed, details.bookTitle, details.questionCount);
}

function isValidQuiz(quizData: ReturnType<typeof normalizeQuiz>, questionCount: number) {
  return (
    typeof quizData.quizTitle === "string" &&
    typeof quizData.quizDescription === "string" &&
    Array.isArray(quizData.questions) &&
    quizData.questions.length === questionCount &&
    !hasDuplicateQuestions(quizData.questions) &&
    quizData.questions.every((question) => {
      const answerIndex = Number(question.answerIndex);
      return (
        typeof question.question === "string" &&
        question.question.trim().length > 0 &&
        Array.isArray(question.choices) &&
        question.choices.length === 4 &&
        question.choices.every((choice) => typeof choice === "string" && choice.trim().length > 0) &&
        Number.isInteger(answerIndex) &&
        answerIndex >= 0 &&
        answerIndex < 4
      );
    })
  );
}

async function generateQuizSection(details: {
  bookTitle: string;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
  section?: { number: number; total: number; previousQuestions: string[] };
}) {
  const response = await openai.chat.completions.create({
    model: quizModel,
    max_tokens: Math.min(5200, Math.max(2200, details.questionCount * 240)),
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher and literary quiz writer. You make accurate child-friendly quizzes with plausible answer choices that match the requested difficulty. Return only a valid JSON object, with no markdown and no commentary.",
      },
      {
        role: "user",
        content: prompt(
          details.bookTitle,
          details.difficulty,
          details.bookLevel,
          details.learningGoal,
          details.questionCount,
          details.section,
        ),
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return normalizeQuiz(parseJsonObject(text.trim()), details.bookTitle, details.questionCount);
}

async function generateChunkedQuiz(details: {
  bookTitle: string;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
}) {
  const quizData = await generateQuizSection(details);
  if (!isValidQuiz(quizData, details.questionCount)) {
    throw new Error("Quiz generation returned duplicate or incomplete questions. Please try again.");
  }
  return quizData;
}

async function generateQuizInChunks(
  details: {
    bookTitle: string;
    difficulty: string;
    bookLevel: string;
    learningGoal: string;
    questionCount: number;
  },
  chunkSize: number,
) {
  const totalSections = Math.ceil(details.questionCount / chunkSize);
  const allQuestions: ReturnType<typeof normalizeQuiz>["questions"] = [];
  const seenQuestionSignatures = new Set<string>();

  for (let index = 0; index < totalSections; index += 1) {
    const remaining = details.questionCount - allQuestions.length;
    const sectionQuestionCount = Math.min(chunkSize, remaining);
    let acceptedSection: ReturnType<typeof normalizeQuiz> | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sectionQuiz = await generateQuizSection({
        ...details,
        questionCount: sectionQuestionCount,
        section: {
          number: index + 1,
          total: totalSections,
          previousQuestions: allQuestions.map((question) => String(question.question || "")),
        },
      });

      if (!isValidQuiz(sectionQuiz, sectionQuestionCount)) {
        continue;
      }

      const sectionSignatures = sectionQuiz.questions.map((question) => questionSignature(question.question));
      const hasRepeatedQuestion = sectionSignatures.some(
        (signature, questionIndex) =>
          !signature ||
          seenQuestionSignatures.has(signature) ||
          sectionSignatures.indexOf(signature) !== questionIndex,
      );

      if (!hasRepeatedQuestion) {
        acceptedSection = sectionQuiz;
        break;
      }
    }

    if (!acceptedSection) {
      throw new Error("Quiz generation repeated questions. Please try again.");
    }

    acceptedSection.questions.forEach((question) => {
      seenQuestionSignatures.add(questionSignature(question.question));
    });
    allQuestions.push(...acceptedSection.questions);
  }

  const quizData = {
    quizTitle: `${details.bookTitle} ${details.difficulty.charAt(0).toUpperCase()}${details.difficulty.slice(1)} Quiz`,
    quizDescription: "Answer each question about the book.",
    questions: allQuestions.slice(0, details.questionCount),
  };

  if (!isValidQuiz(quizData, details.questionCount)) {
    throw new Error("Quiz generation returned an incomplete quiz.");
  }

  return quizData;
}

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const requestedDifficulty = String(body.difficulty || "easy").toLowerCase();
  const difficulty = difficultyMap[requestedDifficulty as keyof typeof difficultyMap] || "easy";
  const bookLevel = String(body.bookLevel || "intermediate");
  const learningGoal = String(body.learningGoal || "basic_recollection");
  const questionCount = getQuestionCount(difficulty);

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  if (!isDifficultyAllowedForBookLevel(difficulty, bookLevel)) {
    const allowed = getAllowedDifficulties(bookLevel);
    return NextResponse.json(
      {
        error: `This book level can only be tested on: ${allowed.join(", ")}.`,
      },
      { status: 400 },
    );
  }

  let quizData: ReturnType<typeof normalizeQuiz>;
  try {
    quizData = questionCount > 10
      ? await generateChunkedQuiz({ bookTitle, difficulty, bookLevel, learningGoal, questionCount })
      : await generateQuizSection({ bookTitle, difficulty, bookLevel, learningGoal, questionCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quiz generation returned invalid JSON. Please try again." },
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
    if (questionCount > 10) {
      return NextResponse.json({ quiz: quizData });
    }

    const reviewedQuiz = await reviewQuizWithModel(quizData, {
      bookTitle,
      difficulty,
      bookLevel,
      learningGoal,
      questionCount,
    });
    if (!isValidQuiz(reviewedQuiz, questionCount)) {
      return NextResponse.json({ quiz: quizData });
    }
    return NextResponse.json({ quiz: reviewedQuiz });
  } catch {
    return NextResponse.json({ quiz: quizData });
  }
}
