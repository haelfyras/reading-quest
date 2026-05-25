import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../../../../lib/adminAuth";
import { getBookDifficultyKey } from "../../../../lib/bookDifficulty";
import { getAllowedDifficulties } from "../../../../lib/scoring";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export const maxDuration = 60;
const QUESTION_POOL_VERSION = 3;
const MAX_SEED_BOOKS_PER_RUN = 5;

type SeedBookInput = {
  title?: unknown;
  author?: unknown;
  isbn?: unknown;
  year?: unknown;
};

type SeedResult = {
  title: string;
  author: string;
  isbn: string;
  level?: string;
  difficultyIndex?: number;
  generated: string[];
  skipped: Array<{ difficulty: string; reason: string }>;
  errors: Array<{ difficulty: string; error: string }>;
  generationMs: number;
};

type ExistingPoolWarning = {
  title: string;
  author: string;
  isbn: string;
  canonicalKey: string;
  difficulties: string[];
  questionCount: number;
};

function normalizeBook(input: SeedBookInput) {
  return {
    title: String(input.title ?? "").trim(),
    author: String(input.author ?? "").trim(),
    isbn: String(input.isbn ?? "").trim(),
    year: String(input.year ?? "").trim(),
  };
}

function getOrigin(request: Request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `Request failed with ${response.status}.`;
    throw new Error(message);
  }

  return data as T;
}

async function findExistingPools(books: ReturnType<typeof normalizeBook>[]) {
  const supabase = createServiceSupabaseClient();
  const warnings: ExistingPoolWarning[] = [];

  for (const book of books) {
    const canonicalKey = getBookDifficultyKey(book);
    const { data, error } = await supabase
      .from("book_question_pool")
      .select("quiz_difficulty")
      .eq("canonical_key", canonicalKey)
      .eq("question_version", QUESTION_POOL_VERSION)
      .eq("active", true);

    if (error || !data || data.length === 0) {
      continue;
    }

    warnings.push({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      canonicalKey,
      difficulties: Array.from(new Set(data.map((row) => String(row.quiz_difficulty)))).sort(),
      questionCount: data.length,
    });
  }

  return warnings;
}

async function logSeedFailure(details: {
  book: ReturnType<typeof normalizeBook>;
  level?: string;
  difficultyIndex?: number;
  generated?: string[];
  errors: Array<{ difficulty: string; error: string }>;
  reason: string;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("telemetry_events").insert({
      profile_id: null,
      page: "/admin/seeding",
      event_name: "seed_pool_failure",
      metadata: {
        message: details.reason,
        title: details.book.title,
        author: details.book.author,
        isbn: details.book.isbn,
        year: details.book.year,
        level: details.level,
        difficultyIndex: details.difficultyIndex,
        generated: details.generated ?? [],
        errors: details.errors,
        questionPoolVersion: QUESTION_POOL_VERSION,
      },
    } as any);
  } catch {
    // Seed failure logging should never block the admin from seeing the batch result.
  }
}

export async function POST(request: Request) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawBooks = (Array.isArray(body.books) ? body.books : []) as SeedBookInput[];
  const checkOnly = Boolean(body.checkOnly);
  const forceReseed = Boolean(body.forceReseed);

  const normalizedBooks = rawBooks.map(normalizeBook).filter((book) => book.title);
  const books = normalizedBooks.slice(0, MAX_SEED_BOOKS_PER_RUN);
  const overflowBooks = normalizedBooks.slice(MAX_SEED_BOOKS_PER_RUN);

  if (books.length === 0) {
    return NextResponse.json({ error: "Add at least one book title to seed." }, { status: 400 });
  }

  if (!checkOnly) {
    await Promise.allSettled(overflowBooks.map((book) => logSeedFailure({
      book,
      errors: [{ difficulty: "not-run", error: `Batch capped at ${MAX_SEED_BOOKS_PER_RUN} books per run.` }],
      reason: `Batch capped at ${MAX_SEED_BOOKS_PER_RUN} books per run; this book was not processed.`,
    })));
  }

  const origin = getOrigin(request);
  const results: SeedResult[] = [];
  const existingPools = await findExistingPools(books);

  if (checkOnly) {
    return NextResponse.json({
      existingPools,
      safeToSeed: existingPools.length === 0,
      processedBooks: books.length,
    });
  }

  if (existingPools.length > 0 && !forceReseed) {
    return NextResponse.json(
      {
        error: "One or more books already have seeded question pools.",
        existingPools,
      },
      { status: 409 },
    );
  }

  for (const book of books) {
    const startedAt = Date.now();
    const result: SeedResult = {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      generated: [],
      skipped: [],
      errors: [],
      generationMs: 0,
    };

    try {
      const levelData = await postJson<{
        level?: string;
        difficultyIndex?: number;
        ratingId?: string;
        canonicalKey?: string;
      }>(`${origin}/api/book-level`, {
        bookTitle: book.title,
        author: book.author,
        isbn: book.isbn,
        year: book.year,
      });

      result.level = levelData.level ?? "beginner";
      result.difficultyIndex = typeof levelData.difficultyIndex === "number" ? levelData.difficultyIndex : undefined;
      const seedDifficulties = getAllowedDifficulties(result.level);

      for (const difficulty of seedDifficulties) {
        try {
          await postJson(`${origin}/api/quiz`, {
            bookTitle: book.title,
            bookAuthor: book.author,
            bookIsbn: book.isbn,
            bookYear: book.year,
            bookLevel: result.level,
            bookDifficultyRatingId: levelData.ratingId,
            bookDifficultyCanonicalKey: levelData.canonicalKey,
            difficulty,
            learningGoal: "basic_recollection",
            mode: "full",
          });
          result.generated.push(difficulty);
        } catch (error) {
          result.errors.push({
            difficulty,
            error: error instanceof Error ? error.message : "Unable to seed this difficulty.",
          });
        }
      }
    } catch (error) {
      result.errors.push({
        difficulty: "book-level",
        error: error instanceof Error ? error.message : "Unable to detect book level.",
      });
    }

    result.generationMs = Date.now() - startedAt;
    if (result.errors.length > 0 || result.generated.length === 0) {
      await logSeedFailure({
        book,
        level: result.level,
        difficultyIndex: result.difficultyIndex,
        generated: result.generated,
        errors: result.errors.length > 0
          ? result.errors
          : [{ difficulty: "all", error: "No quiz pools were generated for this book." }],
        reason: result.errors.length > 0
          ? result.errors.map((error) => `${error.difficulty}: ${error.error}`).join("; ")
          : "No quiz pools were generated for this book.",
      });
    }
    results.push(result);
  }

  return NextResponse.json({
    results,
    requestedBooks: rawBooks.length,
    processedBooks: books.length,
    unprocessedBooks: overflowBooks.length,
    note: "Seeded questions are stored in public.book_question_pool through the normal quiz pipeline.",
  });
}
