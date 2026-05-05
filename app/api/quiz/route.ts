import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";
import {
  getAllowedDifficulties,
  getQuestionCount,
  isDifficultyAllowedForBookLevel,
} from "../../../lib/scoring";

export const maxDuration = 30;

const difficultyMap = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";

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
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_recollection;

  return `Create a JSON object with these fields:\n- quizTitle\n- quizDescription\n- questions (array of exactly ${questionCount} objects)\nEach question object must include:\n- question\n- choices (array of exactly 4 strings)\n- answerIndex (0-based index of the correct choice)\n- answerText (the exact correct choice text)\n- explanation (one short sentence explaining why the answer is correct)\n\nAccuracy rules:\n- answerIndex MUST point to the same choice as answerText.\n- The correct answer must be unambiguous and must appear exactly in choices[answerIndex].\n- Do not ask impossible-to-answer questions, questions that require obscure trivia, or questions with multiple reasonable answers.\n- If asking a counting question, the correct choice must be a number, not one of the counted items.\n- If you are not certain of the answer, choose a different question.\n\nDifficulty rules:\n- Easy: ask simple questions about the title, main characters, obvious events, or clearly known book facts. Distractors may be easier, but should still be book/genre appropriate when possible.\n- Medium: ask questions that require remembering story details, character roles, settings, conflicts, motivations, or cause and effect. Do NOT ask overly broad questions like "Who is the main character?" unless all answer choices are plausible characters from the same book or series.\n- Hard: ask questions that require inference, theme, symbolism, political/social context, subtle motivations, character relationships, consequences, or comparing events. Avoid simple recall questions.\n\nTesting level rules:\n- The selected testing level is more important than making questions feel academically advanced.\n- Habit Forming should feel inviting and confidence-building even on longer quizzes.\n- Basic Recollection should mostly test concrete story facts.\n- Further Understanding should ask more "why" and cause/effect questions.\n- Full Understanding should ask about themes, meaning, growth, and bigger-picture interpretation while staying answerable from the book.\n\nAnswer choice quality rules:\n- All 4 choices must be plausible to a reader who knows the book's genre or world.\n- For medium and hard quizzes, every incorrect choice must be a believable distractor from the same book, same series, same author, or same kind of literary role. For example, on Dune, incorrect choices should be names like Duke Leto, Lady Jessica, Chani, Baron Harkonnen, Stilgar, Gurney Halleck, Duncan Idaho, or similar Dune-relevant concepts, not unrelated pop-culture characters.\n- Never use joke answers or obviously unrelated choices such as Luke Skywalker, Darth Vader, Homer Simpson, Harry Potter, SpongeBob, or other cross-franchise characters unless that character truly appears in the book.\n- For hard quizzes, avoid answer choices where only one option is obviously from the book.\n- Choices should be similar in length and style so the correct answer is not visually obvious.\n\nUse simple, child-friendly language for ages 7-12. Make the quiz feel unique. Do not add any extra text outside the JSON object.\n\nThe book title is: "${bookTitle}". The difficulty level is ${difficulty}, the reading level is ${bookLevel}, and the testing level is ${goalDescription}.`;
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

  const response = await openai.chat.completions.create({
    model: quizModel,
    messages: [
      {
        role: "system",
        content: "You are a careful reading teacher and literary quiz writer. You make accurate child-friendly quizzes with plausible answer choices that match the requested difficulty. Return only a valid JSON object, with no markdown and no commentary.",
      },
      {
        role: "user",
        content: prompt(bookTitle, difficulty, bookLevel, learningGoal, questionCount),
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  const trimmedText = text.trim();

  let quizData: ReturnType<typeof normalizeQuiz>;
  try {
    quizData = normalizeQuiz(parseJsonObject(trimmedText), bookTitle, questionCount);
  } catch {
    return NextResponse.json(
      { error: "Quiz generation returned invalid JSON. Please try again." },
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
