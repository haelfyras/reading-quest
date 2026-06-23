import type { BookLookupResult, BookMatch } from "./books";
import { isBookLevel, type BookLevel } from "./scoring";
import { type BookDifficultyRating } from "./bookDifficulty";

export type BookLookupPayload = {
  bookTitle?: string;
  author?: string;
  isbn?: string;
  year?: string;
};

export async function lookupBook(payload: BookLookupPayload) {
  const response = await fetch("/api/book-lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return await response.json() as BookLookupResult;
}

export async function detectBookLevel(book: BookMatch): Promise<BookDifficultyRating> {
  const response = await fetch("/api/book-level", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookTitle: book.title,
      author: book.author,
      year: book.year,
      isbn: book.isbn,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to determine book level.");
  }

  const data = await response.json() as {
    level?: unknown;
    difficultyIndex?: unknown;
    ratingId?: unknown;
    canonicalKey?: unknown;
    source?: unknown;
  };
  const level = String(data.level || "");
  const difficultyIndex = Number(data.difficultyIndex);
  return {
    level: isBookLevel(level) ? level : "intermediate",
    difficultyIndex: Number.isFinite(difficultyIndex) ? difficultyIndex : 5,
    ratingId: typeof data.ratingId === "string" ? data.ratingId : undefined,
    canonicalKey: typeof data.canonicalKey === "string" ? data.canonicalKey : undefined,
    source: data.source === "known" || data.source === "cache" || data.source === "ai" || data.source === "fallback"
      ? data.source
      : "fallback",
  };
}

type BookFactPreparationPayload = Omit<BookLookupPayload, "year"> & {
  title?: string;
  bookTitle?: string;
  author?: string;
  year?: string | number;
};

export async function prepareBookFacts(book: BookFactPreparationPayload) {
  const bookTitle = String(book.bookTitle || book.title || "").trim();
  if (!bookTitle) return null;

  const response = await fetch("/api/book-facts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bookTitle,
      author: book.author,
      isbn: book.isbn,
      year: book.year ? String(book.year) : undefined,
    }),
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as {
    status?: string;
    sourceConfidence?: number;
    usableForMedium?: boolean;
    usableForHard?: boolean;
    sourceNames?: string[];
  };
}

export function queueBookFactPreparation(book: BookFactPreparationPayload) {
  void prepareBookFacts(book).catch(() => null);
}
