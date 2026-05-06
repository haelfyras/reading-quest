import type { BookLookupResult, BookMatch } from "./books";
import { isBookLevel, type BookLevel } from "./scoring";

export async function lookupBook(payload: { bookTitle?: string; isbn?: string }) {
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

export async function detectBookLevel(book: BookMatch): Promise<BookLevel> {
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

  const data = await response.json() as { level?: unknown };
  const level = String(data.level || "");
  return isBookLevel(level) ? level : "intermediate";
}
