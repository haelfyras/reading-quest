import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";
import { getQuestionCount } from "../../../lib/scoring";

const difficultyMap = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

const goalMap: Record<string, string> = {
  habit_formation: "encourage consistent reading behavior",
  basic_comprehension: "focus on understanding plot and characters",
  deeper_understanding: "explore motivations, meaning, and inference",
  literary_analysis: "examine themes, symbolism, and author intent",
};

const prompt = (
  bookTitle: string,
  difficulty: string,
  bookLevel: string,
  learningGoal: string,
  questionCount: number,
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_comprehension;

  return `Create a JSON object with these fields:\n- quizTitle\n- quizDescription\n- questions (array of exactly ${questionCount} objects)\nEach question object must include:\n- question\n- choices (array of exactly 4 strings)\n- answerIndex (0-based index of the correct choice)\n- answerText (the exact correct choice text)\n- explanation (one short sentence explaining why the answer is correct)\n\nAccuracy rules:\n- answerIndex MUST point to the same choice as answerText.\n- The correct answer must be unambiguous and must appear exactly in choices[answerIndex].\n- Do not ask impossible-to-answer questions, questions that require obscure trivia, or questions with multiple reasonable answers.\n- For easy quizzes, ask only simple questions about the title, main characters, obvious events, or clearly known book facts.\n- If asking a counting question, the correct choice must be a number, not one of the counted items.\n- If you are not certain of the answer, choose a different question.\n\nUse simple, child-friendly language for ages 7-12. Make the quiz feel unique. Do not add any extra text outside the JSON object.\n\nThe book title is: "${bookTitle}". The difficulty level is ${difficulty}, the reading level is ${bookLevel}, and the learning goal is ${goalDescription}.`;
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

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const requestedDifficulty = String(body.difficulty || "easy").toLowerCase();
  const difficulty = difficultyMap[requestedDifficulty as keyof typeof difficultyMap] || "easy";
  const bookLevel = String(body.bookLevel || "intermediate");
  const learningGoal = String(body.learningGoal || "basic_comprehension");
  const questionCount = getQuestionCount(difficulty);

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content: "You are a friendly teacher creating child-friendly quizzes for ages 7-12.",
      },
      {
        role: "user",
        content: prompt(bookTitle, difficulty, bookLevel, learningGoal, questionCount),
      },
    ],
  });

  const text = response.choices?.[0]?.message?.content ?? "";
  const trimmedText = text.trim();

  try {
    const quizData = normalizeQuiz(JSON.parse(trimmedText), bookTitle, questionCount);
    return NextResponse.json({ quiz: quizData });
  } catch (parseError) {
    const jsonMatch = trimmedText.match(/\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        const quizData = normalizeQuiz(JSON.parse(jsonMatch[0]), bookTitle, questionCount);
        return NextResponse.json({ quiz: quizData });
      } catch {
        // continue to fallback
      }
    }
    return NextResponse.json({ quiz: trimmedText }); // Fallback to string if parsing fails
  }
}
