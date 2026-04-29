import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";

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

const getQuestionCount = (difficulty: string): number => {
  if (difficulty === "easy") return 5;
  if (difficulty === "medium") return 12;
  if (difficulty === "hard") return 30;
  return 5;
};

const prompt = (
  bookTitle: string,
  difficulty: string,
  bookLevel: string,
  learningGoal: string,
  questionCount: number,
) => {
  const goalDescription = goalMap[learningGoal] || goalMap.basic_comprehension;

  return `Create a JSON object with these fields:\n- quizTitle\n- quizDescription\n- questions (array of ${questionCount} objects)\nEach question object must include:\n- question\n- choices (array of 4 strings)\n- answerIndex (index of the correct choice)\n\nUse simple, child-friendly language for ages 7-12. Make the quiz feel unique. Do not add any extra text outside the JSON object.\n\nThe book title is: "${bookTitle}". The difficulty level is ${difficulty}, the reading level is ${bookLevel}, and the learning goal is ${goalDescription}.`;
};

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
    const quizData = JSON.parse(trimmedText);
    return NextResponse.json({ quiz: quizData });
  } catch (parseError) {
    const jsonMatch = trimmedText.match(/\{[\s\S]*\}$/);
    if (jsonMatch) {
      try {
        const quizData = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ quiz: quizData });
      } catch {
        // continue to fallback
      }
    }
    return NextResponse.json({ quiz: trimmedText }); // Fallback to string if parsing fails
  }
}
