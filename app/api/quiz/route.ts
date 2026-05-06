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

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o";

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
  const sectionInstruction = section
    ? `\n\nThis is section ${section.number} of ${section.total}. Create exactly ${questionCount} new questions for this section only. Do not repeat these earlier questions: ${section.previousQuestions.length ? section.previousQuestions.map((question) => `"${question}"`).join("; ") : "none"}.`
    : "";

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}. The questions array must contain exactly ${questionCount} complete question objects. Do not return fewer than ${questionCount}. Each question must have: question, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation.\n\nCanonical book to quiz: ${bookIdentity}. Test difficulty: ${difficulty}. Book level: ${bookLevel}. Testing goal: ${goalDescription}.${qualityNotes ? `\n\nCritical book guardrails:\n${qualityNotes}` : ""}\n\nRules:\n- Use only the exact book above, not films, soundtracks, games, adaptations, sequels, prequels, or other series installments.\n- If a fact may come from another book in the series or a movie adaptation, do not use it.\n- Keep every question under 18 words, every choice under 7 words, every explanation under 14 words.\n- answerIndex must point to answerText exactly.\n- Every question must be answerable from the exact book and have one clear correct answer.\n- Do not ask impossible, obscure, trick, spoiler-only, or repeated/rephrased questions.\n- Counting-question answers must be numbers.\n- Avoid "what potion/item/spell" questions unless the exact book clearly names it.\n- Easy = simple title/character/obvious-event questions.\n- Medium = details, roles, setting, conflict, motivation, cause/effect.\n- Hard = inference, theme, symbolism, context, subtle motivation, relationships, consequences, or comparisons.\n- Choices must be plausible and fit the exact book, but only one can be correct.\n- Never use joke or unrelated pop-culture answers unless they truly appear in the exact book.\n- Use child-friendly language for ages 7-12.\n- Silently count the questions before returning JSON and make sure there are exactly ${questionCount}.${sectionInstruction}`;
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

const hardPrompt = (book: BookDetails, bookLevel: string, learningGoal: string, qualityNotes = "") => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(book);

  return `Return only valid compact JSON with this exact shape:
{"quizTitle": string, "quizDescription": string, "questions": [
{"question": string, "choices": [string, string, string, string], "answerIndex": number, "answerText": string, "explanation": string}
]}

Create exactly 20 hard questions for this canonical book only: ${bookIdentity}. The book reading level is ${bookLevel}. Testing goal: ${goalDescription}.
${qualityNotes ? `\nCritical book guardrails:\n- ${qualityNotes}\n` : ""}

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
- Use only the exact book named above, not films, soundtracks, adaptations, sequels, prequels, or other books in a series.
- If a fact may come from another series installment or movie adaptation, do not use it.
- Do not repeat the same question idea, event, character focus, or theme focus.
- Do not ask simple recall, obscure trivia, trick questions, or impossible questions.
- Avoid "what potion/item/spell" questions unless the exact book clearly names it.
- Each answer must be clearly correct from the book.
- Each wrong answer must fit the exact book's world and style, but only one answer may be correct.
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
  book: BookDetails,
  bookLevel: string,
  learningGoal: string,
  section: typeof hardQuestionPlan[number],
  qualityNotes = "",
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;
  const bookIdentity = describeBook(book);

  return `Return only valid compact JSON: {"quizTitle": string, "quizDescription": string, "questions": array}.
Create exactly ${section.count} hard questions for this canonical book only: ${bookIdentity}.
These are questions ${section.start}-${section.end} of a 20-question quiz.
Focus only on: ${section.focus}.
Book level: ${bookLevel}. Testing goal: ${goalDescription}.
${qualityNotes ? `\nCritical book guardrails:\n- ${qualityNotes}\n` : ""}

Each question object must have: question, choices (exactly 4 short strings), answerIndex (0-3), answerText, explanation.
Rules:
- The questions array must contain exactly ${section.count} complete objects.
- Use only the exact book named above, not films, soundtracks, adaptations, sequels, prequels, or other books in a series.
- If a fact may come from another series installment or movie adaptation, do not use it.
- Keep each question under 18 words.
- Keep each choice under 7 words.
- Keep each explanation under 14 words.
- Do not repeat the same question idea within this section.
- Do not ask simple recall, obscure trivia, trick questions, or impossible questions.
- Avoid "what potion/item/spell" questions unless the exact book clearly names it.
- Each answer must be clearly correct from the book.
- Each wrong answer must fit the exact book's world and style, but only one answer may be correct.
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

function normalizeQuiz(rawQuiz: GeneratedQuiz, book: BookDetails, questionCount: number) {
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
      choices,
      answerIndex,
      answerText: choices[answerIndex],
      explanation: typeof generatedQuestion.explanation === "string"
        ? String(generatedQuestion.explanation).trim()
        : "",
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
          "You are a strict quiz quality reviewer. Return only a valid JSON object, with no markdown and no commentary. Fix wrong answers, impossible questions, weak distractors, answerIndex mismatches, and difficulty mismatches. If a question cannot be verified, replace it with a safer question.",
      },
      {
        role: "user",
        content: `Review this quiz for the exact book ${describeBook(details.book)}. Difficulty: ${details.difficulty}. Reading level: ${details.bookLevel}. Testing level: ${details.learningGoal}.${details.qualityNotes ? `\n\nCritical book guardrails:\n- ${details.qualityNotes}` : ""}\n\nIt must have exactly ${details.questionCount} questions, 4 choices per question, a correct answerIndex, answerText matching choices[answerIndex], and a short explanation. Remove or replace any question that uses a movie/adaptation fact, another book in a series, a later-book fact, an impossible premise, or an unverified answer. Distractors must fit the exact book's world and style, but only one answer may be correct. Return only the corrected JSON object.\n\n${JSON.stringify(quizData)}`,
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = parseJsonObject(text);
  return normalizeQuiz(parsed, details.book, details.questionCount);
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
  return normalizeQuiz(parseJsonObject(text.trim()), details.book, details.questionCount);
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
      const quiz = normalizeQuiz(parseJsonObject(text.trim()), details.book, section.count);
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

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const bookAuthor = String(body.bookAuthor || "").trim();
  const bookYear = body.bookYear ? String(body.bookYear).trim() : "";
  const bookIsbn = String(body.bookIsbn || "").trim();
  const requestedDifficulty = String(body.difficulty || "easy").toLowerCase();
  const difficulty = difficultyMap[requestedDifficulty as keyof typeof difficultyMap] || "easy";
  const bookLevel = String(body.bookLevel || "intermediate");
  const learningGoal = String(body.learningGoal || "basic_recollection");
  const questionCount = getQuestionCount(difficulty);

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  const book = {
    title: bookTitle,
    author: bookAuthor,
    year: bookYear,
    isbn: bookIsbn,
  };
  const qualityNotes = getBookQualityNotes(book);

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
      ? await generateHardQuiz({ book, difficulty, bookLevel, learningGoal, questionCount, qualityNotes })
      : await generateQuizSection({ book, difficulty, bookLevel, learningGoal, questionCount, qualityNotes });
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
    const reviewedQuiz = await reviewQuizWithModel(quizData, {
      book,
      difficulty,
      bookLevel,
      learningGoal,
      questionCount,
      qualityNotes,
    });
    if (!isValidQuiz(reviewedQuiz, questionCount)) {
      return NextResponse.json({ quiz: quizData });
    }
    return NextResponse.json({ quiz: reviewedQuiz });
  } catch {
    return NextResponse.json({ quiz: quizData });
  }
}
