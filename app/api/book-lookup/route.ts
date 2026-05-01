import { NextResponse } from "next/server";

type OpenLibraryDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
};

type BookMatch = {
  id: string;
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  isbn?: string;
};

const normalizeTitle = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const comparableTitle = (title: string) => normalizeTitle(title).replace(/^the\s+/, "");

const hasSharedAuthor = (a: BookMatch, b: BookMatch) =>
  a.author !== "Unknown author" && b.author !== "Unknown author" && a.author === b.author;

const knownSeriesPatterns = [
  /\blord of the rings\b/,
  /\bharry potter\b/,
  /\bchronicles of narnia\b/,
  /\bpercy jackson\b/,
  /\bmagic tree house\b/,
  /\bboxcar children\b/,
];

const isLikelySeriesQuery = (title: string) =>
  knownSeriesPatterns.some((pattern) => pattern.test(normalizeTitle(title)));

const coverUrl = (coverId?: number) =>
  coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined;

const toBookMatch = (doc: OpenLibraryDoc, index: number): BookMatch | null => {
  if (!doc.title) return null;

  return {
    id: doc.key ?? `${doc.title}-${index}`,
    title: doc.title,
    author: doc.author_name?.slice(0, 2).join(", ") || "Unknown author",
    year: doc.first_publish_year,
    coverUrl: coverUrl(doc.cover_i),
    isbn: doc.isbn?.[0],
  };
};

async function lookupByTitle(bookTitle: string) {
  const fields = "key,title,author_name,first_publish_year,cover_i,isbn";
  const [titleResponse, broadResponse] = await Promise.all([
    fetch(
      `https://openlibrary.org/search.json?title=${encodeURIComponent(bookTitle)}&limit=8&fields=${fields}`,
      { next: { revalidate: 86400 } },
    ),
    fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(bookTitle)}&limit=12&fields=${fields}`,
      { next: { revalidate: 86400 } },
    ),
  ]);

  if (!titleResponse.ok || !broadResponse.ok) {
    throw new Error("Book search failed.");
  }

  const titleData = await titleResponse.json();
  const broadData = await broadResponse.json();
  const mergedDocs = [
    ...((broadData.docs ?? []) as OpenLibraryDoc[]),
    ...((titleData.docs ?? []) as OpenLibraryDoc[]),
  ];

  const seen = new Set<string>();
  const matchedBooks = mergedDocs
    .map(toBookMatch)
    .filter(Boolean)
    .filter((book): book is BookMatch => Boolean(book));
  const books = matchedBooks
    .filter((book) => {
      const key = book.id || `${book.title}-${book.author}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 10);

  const requestedTitle = comparableTitle(bookTitle);
  const exact = books.find((book) => comparableTitle(book.title) === requestedTitle);
  const relatedAlternatives = exact
    ? books.filter((book) => comparableTitle(book.title) !== requestedTitle && hasSharedAuthor(book, exact))
    : [];

  if (exact && (relatedAlternatives.length < 2 || !isLikelySeriesQuery(bookTitle))) {
    return NextResponse.json({ status: "exact", books: [exact] });
  }

  if (books.length > 0) {
    const orderedBooks = exact
      ? [exact, ...books.filter((book) => book.id !== exact.id)]
      : books;
    return NextResponse.json({ status: "options", books: orderedBooks.slice(0, 8) });
  }

  return NextResponse.json({ status: "not_found", books: [] });
}

async function lookupByIsbn(isbn: string) {
  const cleaned = isbn.replace(/[^\dXx]/g, "");
  const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(cleaned)}.json`, {
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return NextResponse.json({ status: "not_found", books: [] });
  }

  const data = await response.json();
  const authors = Array.isArray(data.authors) ? data.authors : [];
  const authorNames = authors.map((author: { key?: string }) => author.key?.replace("/authors/", "")).filter(Boolean);
  const coverId = Array.isArray(data.covers) ? data.covers[0] : undefined;

  const book: BookMatch = {
    id: data.key ?? cleaned,
    title: data.title ?? "Untitled book",
    author: authorNames.length ? authorNames.join(", ") : "Unknown author",
    year: typeof data.publish_date === "string" ? Number(data.publish_date.match(/\d{4}/)?.[0]) : undefined,
    coverUrl: coverUrl(coverId),
    isbn: cleaned,
  };

  return NextResponse.json({ status: "exact", books: [book] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookTitle = String(body.bookTitle || "").trim();
    const isbn = String(body.isbn || "").trim();

    if (isbn) {
      return lookupByIsbn(isbn);
    }

    if (!bookTitle) {
      return new NextResponse("Book title is required.", { status: 400 });
    }

    return lookupByTitle(bookTitle);
  } catch {
    return new NextResponse("Failed to look up book.", { status: 500 });
  }
}
