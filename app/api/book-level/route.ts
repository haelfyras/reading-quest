import { NextResponse } from "next/server";
import { openai } from "../../../lib/openai";

export const maxDuration = 15;

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";

function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
}

function getKnownBookLevel(bookTitle: string, author = "") {
  const title = normalizeTitle(bookTitle);
  const normalizedAuthor = normalizeTitle(author);
  const beginnerPatterns = [
    /\bthe lion king\b/,
    /\bone fish two fish\b/,
    /\bcat in the hat\b/,
    /\bgreen eggs and ham\b/,
    /\bvery hungry caterpillar\b/,
    /\bbrown bear brown bear\b/,
    /\bgoodnight moon\b/,
    /\bwhere the wild things are\b/,
    /\bif you give a mouse\b/,
    /\bcurious george\b/,
  ];

  if (beginnerPatterns.some((pattern) => pattern.test(title))) {
    return "beginner";
  }

  if (/\bharry potter\b/.test(title) && /\browling\b/.test(normalizedAuthor)) {
    return "intermediate";
  }

  return null;
}

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const author = String(body.author || "").trim();
  const year = body.year ? String(body.year).trim() : "";

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  const knownLevel = getKnownBookLevel(bookTitle, author);
  if (knownLevel) {
    return NextResponse.json({ level: knownLevel });
  }

  try {
    const response = await openai.chat.completions.create({
      model: quizModel,
      messages: [
        {
          role: "system",
          content:
            "You are a children's book reading-level expert. Respond with ONLY one word: 'beginner', 'intermediate', or 'advanced'. Beginner means picture books, read-aloud books, early readers, simple adaptations, and short books for emerging readers. Intermediate means chapter books and middle-grade books. Advanced means dense, complex, long, or older-reader works.",
        },
        {
          role: "user",
          content: `Classify the exact book reading level for "${bookTitle}"${author ? ` by ${author}` : ""}${year ? `, first published around ${year}` : ""}. Ignore movies, soundtracks, games, adaptations, and other books in the same series. If this is a picture book, Disney/storybook adaptation, early reader, or simple children's story, choose beginner. Respond with only: beginner, intermediate, or advanced.`,
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
