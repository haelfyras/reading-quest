import { NextResponse } from "next/server";
import { getBookDifficultyKey } from "../../../lib/bookDifficulty";
import { getOrCreateBookFactSheet, isFactSheetUsableForDifficulty } from "../../../lib/bookFacts";

export const maxDuration = 25;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const book = {
      title: String(body.bookTitle || body.title || "").trim(),
      author: String(body.author || bookAuthorFromBody(body) || "").trim(),
      year: String(body.year || body.bookYear || "").trim(),
      isbn: String(body.isbn || body.bookIsbn || "").trim(),
    };
    const canonicalKey = String(body.canonicalKey || "").trim() || getBookDifficultyKey(book);

    if (!book.title) {
      return NextResponse.json({ error: "Book title is required." }, { status: 400 });
    }

    const factSheet = await getOrCreateBookFactSheet({
      book,
      canonicalKey,
      forceRefresh: body.forceRefresh === true,
    });

    return NextResponse.json({
      status: factSheet.status,
      sourceConfidence: factSheet.sourceConfidence,
      usableForMedium: isFactSheetUsableForDifficulty(factSheet, "medium"),
      usableForHard: isFactSheetUsableForDifficulty(factSheet, "hard"),
      sourceNames: factSheet.sourceNames,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to prepare book facts." },
      { status: 500 },
    );
  }
}

function bookAuthorFromBody(body: Record<string, unknown>) {
  return typeof body.bookAuthor === "string" ? body.bookAuthor : "";
}
