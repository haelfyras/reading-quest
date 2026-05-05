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

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}. The questions array must contain exactly ${questionCount} complete question objects. Do not return fewer than ${questionCount}. Each question must have: question, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation.\n\nBook: "${bookTitle}". Test difficulty: ${difficulty}. Book level: ${bookLevel}. Testing goal: ${goalDescription}.\n\nRules:\n- Keep every question under 18 words, every choice under 7 words, every explanation under 14 words.\n- answerIndex must point to answerText exactly.\n- Every question must be answerable from the book and have one clear correct answer.\n- Do not ask impossible, obscure, trick, spoiler-only, or repeated/rephrased questions.\n- Counting-question answers must be numbers.\n- Easy = simple title/character/obvious-event questions.\n- Medium = details, roles, setting, conflict, motivation, cause/effect.\n- Hard = inference, theme, symbolism, context, subtle motivation, relationships, consequences, or comparisons.\n- Choices must be plausible, similar in style, and from the same book, series, author, or literary role.\n- Never use joke or unrelated pop-culture answers unless they truly appear in the book.\n- Use child-friendly language for ages 7-12.\n- Silently count the questions before returning JSON and make sure there are exactly ${questionCount}.${sectionInstruction}`;
};

const hardPrompt = (bookTitle: string, bookLevel: string, learningGoal: string) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;

  return `Return only valid compact JSON with this exact shape:
{"quizTitle": string, "quizDescription": string, "questions": [
{"question": string, "choices": [string, string, string, string], "answerIndex": number, "answerText": string, "explanation": string}
]}

Create exactly 20 hard questions for "${bookTitle}". The book reading level is ${bookLevel}. Testing goal: ${goalDescription}.

Question plan:
1-4 character motivation
5-8 cause and effect
9-12 theme or lesson
13-15 relationships or conflict
16-18 consequences of choices
19-20 bigger-picture meaning

Rules:
- The questions array must contain exactly 20 complete objects.
- Do not return fewer than 20 questions.
- Do not repeat the same question idea, event, character focus, or theme focus.
- Do not ask simple recall, obscure trivia, trick questions, or impossible questions.
- Each answer must be clearly correct from the book.
- Each wrong answer must be plausible and from the same book, series, author, or literary role.
- Keep each question under 18 words.
- Keep each answer choice under 7 words.
- Keep each explanation under 14 words.
- answerIndex must point to answerText exactly.
- Use child-friendly language for ages 7-12.
- Count the questions before returning. Return JSON only.`;
};

const hardQuestionPlan = [
  { start: 1, end: 4, count: 4, focus: "character motivation" },
  { start: 5, end: 8, count: 4, focus: "cause and effect" },
  { start: 9, end: 12, count: 4, focus: "theme or lesson" },
  { start: 13, end: 15, count: 3, focus: "relationships or conflict" },
  { start: 16, end: 18, count: 3, focus: "consequences of choices" },
  { start: 19, end: 20, count: 2, focus: "bigger-picture meaning" },
];

const hardSectionPrompt = (
  bookTitle: string,
  bookLevel: string,
  learningGoal: string,
  section: typeof hardQuestionPlan[number],
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}.
Create exactly ${section.count} hard questions for "${bookTitle}".
These are questions ${section.start}-${section.end} of a 20-question quiz.
Focus only on: ${section.focus}.
Book level: ${bookLevel}. Testing goal: ${goalDescription}.

Each question object must have: question, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation.
Rules:
- The questions array must contain exactly ${section.count} complete objects.
- Keep each question under 18 words.
- Keep each choice under 7 words.
- Keep each explanation under 14 words.
- Do not repeat the same question idea within this section.
- Do not ask simple recall, obscure trivia, trick questions, or impossible questions.
- Each answer must be clearly correct from the book.
- Each wrong answer must be plausible and from the same book, series, author, or literary role.
- answerIndex must point to answerText exactly.
- Use child-friendly language for ages 7-12.
- Return JSON only.`;
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
  const userPrompt = details.difficulty === "hard"
    ? hardPrompt(details.bookTitle, details.bookLevel, details.learningGoal)
    : prompt(
        details.bookTitle,
        details.difficulty,
        details.bookLevel,
        details.learningGoal,
        details.questionCount,
        details.section,
      );

  const response = await openai.chat.completions.create({
    model: quizModel,
    max_tokens: Math.min(6500, Math.max(2200, details.questionCount * 320)),
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher and literary quiz writer. You make accurate child-friendly quizzes with plausible answer choices that match the requested difficulty. Return only a valid JSON object, with no markdown and no commentary.",
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  return normalizeQuiz(parseJsonObject(text.trim()), details.bookTitle, details.questionCount);
}

async function generateHardQuiz(details: {
  bookTitle: string;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
  questionCount: number;
}) {
  const sectionQuizzes = await Promise.all(
    hardQuestionPlan.map(async (section) => {
      const response = await openai.chat.completions.create({
        model: quizModel,
        max_tokens: Math.max(1200, section.count * 360),
        messages: [
          {
            role: "system",
            content: "You are a careful reading teacher. Return only valid JSON for the requested hard quiz section.",
          },
          {
            role: "user",
            content: hardSectionPrompt(details.bookTitle, details.bookLevel, details.learningGoal, section),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content ?? "";
      const quiz = normalizeQuiz(parseJsonObject(text.trim()), details.bookTitle, section.count);
      if (!isValidQuiz(quiz, section.count)) {
        throw new Error("Quiz generation returned an incomplete hard quiz section.");
      }
      return quiz;
    }),
  );

  const questions = sectionQuizzes.flatMap((quiz) => quiz.questions).slice(0, details.questionCount);
  const quizData = {
    quizTitle: `${details.bookTitle} Hard Quiz`,
    quizDescription: "Answer each question about the book.",
    questions,
  };

  if (!isValidQuiz(quizData, details.questionCount)) {
    throw new Error("Quiz generation returned an incomplete quiz. Please try again.");
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
      ? await generateHardQuiz({ bookTitle, difficulty, bookLevel, learningGoal, questionCount })
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
