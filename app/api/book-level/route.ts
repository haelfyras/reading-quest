import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";

export const maxDuration = 15;

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  try {
    const response = await openai.chat.completions.create({
      model: quizModel,
      messages: [
        {
          role: "system",
          content:
            "You are a book expert. Respond with ONLY one word: 'beginner', 'intermediate', or 'advanced' based on the book's reading level for children ages 7-12.",
        },
        {
          role: "user",
          content: `What is the reading level of "${bookTitle}"? Respond with only: beginner, intermediate, or advanced.`,
        },
      ],
    });

    const content = (response.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
    const level = ["beginner", "intermediate", "advanced"].includes(content)
      ? content
      : "intermediate";

    return NextResponse.json({ level });
  } catch (err) {
    return new NextResponse("Failed to determine book level.", { status: 500 });
  }
}
