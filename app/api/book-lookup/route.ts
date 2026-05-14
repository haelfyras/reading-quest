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
  source?: string;
  confidence?: number;
};

type GoogleBookVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{
      type?: string;
      identifier?: string;
    }>;
    printType?: string;
  };
};

const normalizeTitle = (title: string) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");

const comparableTitle = (title: string) => normalizeTitle(title).replace(/^the\s+/, "");

const titleWords = (title: string) =>
  new Set(comparableTitle(title).split(" ").filter((word) => word.length > 1));

const titleOverlap = (a: string, b: string) => {
  const aWords = titleWords(a);
  const bWords = titleWords(b);
  if (aWords.size === 0 || bWords.size === 0) return 0;
  let shared = 0;
  aWords.forEach((word) => {
    if (bWords.has(word)) shared += 1;
  });
  return shared / Math.max(aWords.size, bWords.size);
};

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

const canonicalBooks: BookMatch[] = [
  {
    id: "known-hp-chamber-of-secrets",
    title: "Harry Potter and the Chamber of Secrets",
    author: "J.K. Rowling",
    year: 1998,
    isbn: "9780439064873",
    coverUrl: "https://covers.openlibrary.org/isbn/9780439064873-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-sorcerers-stone",
    title: "Harry Potter and the Sorcerer's Stone",
    author: "J.K. Rowling",
    year: 1997,
    isbn: "9780590353427",
    coverUrl: "https://covers.openlibrary.org/isbn/9780590353427-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-philosophers-stone",
    title: "Harry Potter and the Philosopher's Stone",
    author: "J.K. Rowling",
    year: 1997,
    isbn: "9780747532699",
    coverUrl: "https://covers.openlibrary.org/isbn/9780747532699-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-prisoner-of-azkaban",
    title: "Harry Potter and the Prisoner of Azkaban",
    author: "J.K. Rowling",
    year: 1999,
    isbn: "9780439136358",
    coverUrl: "https://covers.openlibrary.org/isbn/9780439136358-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-goblet-of-fire",
    title: "Harry Potter and the Goblet of Fire",
    author: "J.K. Rowling",
    year: 2000,
    isbn: "9780439139601",
    coverUrl: "https://covers.openlibrary.org/isbn/9780439139601-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-order-of-the-phoenix",
    title: "Harry Potter and the Order of the Phoenix",
    author: "J.K. Rowling",
    year: 2003,
    isbn: "9780439358071",
    coverUrl: "https://covers.openlibrary.org/isbn/9780439358071-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-half-blood-prince",
    title: "Harry Potter and the Half-Blood Prince",
    author: "J.K. Rowling",
    year: 2005,
    isbn: "9780439785969",
    coverUrl: "https://covers.openlibrary.org/isbn/9780439785969-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
  {
    id: "known-hp-deathly-hallows",
    title: "Harry Potter and the Deathly Hallows",
    author: "J.K. Rowling",
    year: 2007,
    isbn: "9780545010221",
    coverUrl: "https://covers.openlibrary.org/isbn/9780545010221-M.jpg",
    source: "Reading Quest verified book record",
    confidence: 1,
  },
];

function getCanonicalMatches(bookTitle: string) {
  const requested = comparableTitle(bookTitle);
  return canonicalBooks
    .map((book) => ({
      ...book,
      confidence: comparableTitle(book.title) === requested ? 1 : titleOverlap(bookTitle, book.title),
    }))
    .filter((book) => (book.confidence ?? 0) >= 0.55)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

const toBookMatch = (doc: OpenLibraryDoc, index: number): BookMatch | null => {
  if (!doc.title) return null;

  return {
    id: doc.key ?? `${doc.title}-${index}`,
    title: doc.title,
    author: doc.author_name?.slice(0, 2).join(", ") || "Unknown author",
    year: doc.first_publish_year,
    coverUrl: coverUrl(doc.cover_i),
    isbn: doc.isbn?.[0],
    source: "Open Library",
  };
};

const toGoogleBookMatch = (volume: GoogleBookVolume, index: number): BookMatch | null => {
  const info = volume.volumeInfo;
  if (!info?.title) return null;
  if (info.printType && info.printType.toUpperCase() !== "BOOK") return null;

  const isbn13 = info.industryIdentifiers?.find((item) => item.type === "ISBN_13")?.identifier;
  const isbn10 = info.industryIdentifiers?.find((item) => item.type === "ISBN_10")?.identifier;
  const yearMatch = info.publishedDate?.match(/\d{4}/)?.[0];
  const title = info.subtitle ? `${info.title}: ${info.subtitle}` : info.title;

  return {
    id: volume.id ?? `${title}-${index}`,
    title,
    author: info.authors?.slice(0, 2).join(", ") || "Unknown author",
    year: yearMatch ? Number(yearMatch) : undefined,
    coverUrl: info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail,
    isbn: isbn13 || isbn10,
    source: "Google Books",
  };
};

function authorOverlap(requestedAuthor: string, foundAuthor: string) {
  const requested = normalizeTitle(requestedAuthor);
  const found = normalizeTitle(foundAuthor);
  if (!requested || !found || found === "unknown author") return 0;
  if (found.includes(requested) || requested.includes(found)) return 1;
  const requestedWords = new Set(requested.split(" ").filter((word) => word.length > 1));
  const foundWords = new Set(found.split(" ").filter((word) => word.length > 1));
  if (requestedWords.size === 0 || foundWords.size === 0) return 0;
  let shared = 0;
  requestedWords.forEach((word) => {
    if (foundWords.has(word)) shared += 1;
  });
  return shared / Math.max(requestedWords.size, foundWords.size);
}

function scoreBook(book: BookMatch, requestedTitle: string, requestedAuthor = "") {
  let score = requestedTitle ? titleOverlap(requestedTitle, book.title) * 100 : 35;
  if (requestedTitle && comparableTitle(book.title) === comparableTitle(requestedTitle)) score += 80;
  if (requestedAuthor) {
    const authorScore = authorOverlap(requestedAuthor, book.author);
    score += authorScore * 95;
    if (authorScore === 0) score -= 25;
  }
  if (book.isbn) score += 12;
  if (book.coverUrl) score += 8;
  if (book.year && book.year >= 1450 && book.year <= new Date().getFullYear()) score += 6;
  if (/composer|soundtrack|score|music|film|movie/i.test(book.author)) score -= 60;
  if (/soundtrack|score|movie|film|screenplay/i.test(book.title)) score -= 60;
  if (book.author === "Unknown author") score -= 15;
  return score + (book.confidence ?? 0) * 100;
}

async function lookupBySearch(bookTitle: string, author: string) {
  const fields = "key,title,author_name,first_publish_year,cover_i,isbn";
  const openLibraryParams = new URLSearchParams({ limit: "12", fields });
  if (bookTitle) openLibraryParams.set("title", bookTitle);
  if (author) openLibraryParams.set("author", author);
  const broadQuery = [bookTitle, author].filter(Boolean).join(" ");
  const googleTerms = [
    bookTitle ? `intitle:${bookTitle}` : "",
    author ? `inauthor:${author}` : "",
  ].filter(Boolean).join("+");
  const [titleResponse, broadResponse, googleResponse] = await Promise.all([
    fetch(
      `https://openlibrary.org/search.json?${openLibraryParams.toString()}`,
      { next: { revalidate: 86400 } },
    ),
    fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(broadQuery)}&limit=12&fields=${fields}`,
      { next: { revalidate: 86400 } },
    ),
    fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(googleTerms || broadQuery)}&maxResults=10&printType=books`,
      { next: { revalidate: 86400 } },
    ).catch(() => null),
  ]);

  if (!titleResponse.ok || !broadResponse.ok) {
    throw new Error("Book search failed.");
  }

  const titleData = await titleResponse.json();
  const broadData = await broadResponse.json();
  const googleData = googleResponse?.ok ? await googleResponse.json() : { items: [] };
  const mergedDocs = [
    ...(bookTitle ? getCanonicalMatches(bookTitle) : []),
    ...(((googleData.items ?? []) as GoogleBookVolume[]).map(toGoogleBookMatch).filter(Boolean) as BookMatch[]),
    ...((broadData.docs ?? []) as OpenLibraryDoc[]),
    ...((titleData.docs ?? []) as OpenLibraryDoc[]),
  ];

  const seen = new Set<string>();
  const matchedBooks = mergedDocs
    .map((entry, index) => ("author_name" in entry ? toBookMatch(entry as OpenLibraryDoc, index) : entry as BookMatch))
    .filter(Boolean)
    .filter((book): book is BookMatch => Boolean(book));
  const books = matchedBooks
    .filter((book) => {
      const key = book.id || `${book.title}-${book.author}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((book) => {
      const titleMatches = !bookTitle || titleOverlap(bookTitle, book.title) >= 0.35 || comparableTitle(book.title).includes(comparableTitle(bookTitle));
      const authorMatches = !author || authorOverlap(author, book.author) >= 0.45;
      return titleMatches && authorMatches;
    })
    .sort((a, b) => scoreBook(b, bookTitle, author) - scoreBook(a, bookTitle, author))
    .slice(0, 10);

  const requestedTitle = comparableTitle(bookTitle);
  const exact = bookTitle ? books.find((book) => comparableTitle(book.title) === requestedTitle && (!author || authorOverlap(author, book.author) >= 0.75)) : null;
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
    source: "Open Library ISBN",
    confidence: 1,
  };

  return NextResponse.json({ status: "exact", books: [book] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookTitle = String(body.bookTitle || "").trim();
    const author = String(body.author || "").trim();
    const isbn = String(body.isbn || "").trim();

    if (isbn) {
      return lookupByIsbn(isbn);
    }

    if (!bookTitle && !author) {
      return new NextResponse("Enter a title, author, or ISBN.", { status: 400 });
    }

    return lookupBySearch(bookTitle, author);
  } catch {
    return new NextResponse("Failed to look up book.", { status: 500 });
  }
}
