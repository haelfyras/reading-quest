import { NextResponse } from "next/server";
import { normalizeDifficultyRating, getBookDifficultyKey, normalizeBookIdentity } from "../../../lib/bookDifficulty";
import { openai } from "../../../lib/openai";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import type { BookLevel } from "../../../lib/scoring";

export const maxDuration = 20;

const quizModel = process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";

type StoredRating = {
  id?: string;
  current_score?: number | string;
  book_level?: BookLevel;
};

const knownBookScores: Array<{
  title: RegExp;
  author?: RegExp;
  score: number;
}> = [
  { title: /\bthe lion king\b/, score: 2.1 },
  { title: /\bone fish two fish\b/, score: 1.4 },
  { title: /\bcat in the hat\b/, score: 1.7 },
  { title: /\bgreen eggs and ham\b/, score: 1.6 },
  { title: /\bvery hungry caterpillar\b/, score: 1.2 },
  { title: /\bbrown bear brown bear\b/, score: 1.1 },
  { title: /\bgoodnight moon\b/, score: 1.1 },
  { title: /\bwhere the wild things are\b/, score: 2.4 },
  { title: /\bif you give a mouse\b/, score: 1.9 },
  { title: /\bcurious george\b/, score: 2.2 },
  { title: /\bharry potter\b/, author: /\browling\b/, score: 5.8 },
  { title: /\bthe hobbit\b/, score: 6.4 },
  { title: /\blord of the rings\b|\bfellowship of the ring\b|\btwo towers\b|\breturn of the king\b/, score: 8.3 },
  { title: /\bdune\b/, score: 8.7 },
];

function getKnownBookScore(bookTitle: string, author = "") {
  const title = normalizeBookIdentity(bookTitle);
  const normalizedAuthor = normalizeBookIdentity(author);
  return knownBookScores.find((book) =>
    book.title.test(title) && (!book.author || book.author.test(normalizedAuthor)),
  )?.score ?? null;
}

function parseDifficultyResponse(content: string) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content) as {
    difficultyIndex?: unknown;
    factors?: unknown;
  };
  const score = Number(parsed.difficultyIndex);
  if (!Number.isFinite(score)) {
    throw new Error("Difficulty index was missing.");
  }
  return {
    ...normalizeDifficultyRating(score),
    factors: typeof parsed.factors === "object" && parsed.factors ? parsed.factors : {},
  };
}

function parseYear(value: string) {
  const year = Number(value);
  return Number.isInteger(year) ? year : null;
}

async function findStoredRating(canonicalKey: string): Promise<StoredRating | null> {
  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("book_difficulty_ratings")
      .select("id,current_score,book_level")
      .eq("canonical_key", canonicalKey)
      .maybeSingle();

    if (error || !data) return null;
    return data as StoredRating;
  } catch {
    return null;
  }
}

async function saveRating(details: {
  canonicalKey: string;
  title: string;
  author: string;
  isbn: string;
  year: string;
  score: number;
  level: BookLevel;
  factors: Record<string, unknown>;
}) {
  try {
    const supabase = createServiceSupabaseClient();
    const { data } = await supabase.from("book_difficulty_ratings").upsert({
      canonical_key: details.canonicalKey,
      title: details.title,
      author: details.author || null,
      isbn: details.isbn || null,
      first_published_year: details.year ? parseYear(details.year) : null,
      ai_base_score: details.score,
      current_score: details.score,
      book_level: details.level,
      scoring_factors: details.factors as any,
      ai_model: quizModel,
      updated_at: new Date().toISOString(),
    }, { onConflict: "canonical_key" }).select("id").maybeSingle();
    return data?.id;
  } catch {
    // Book difficulty can still be returned if persistence is temporarily unavailable.
    return undefined;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const bookTitle = String(body.bookTitle || "").trim();
  const author = String(body.author || "").trim();
  const year = body.year ? String(body.year).trim() : "";
  const isbn = String(body.isbn || "").trim();

  if (!bookTitle) {
    return new NextResponse("Book title is required.", { status: 400 });
  }

  const canonicalKey = getBookDifficultyKey({ title: bookTitle, author, isbn });
  const knownScore = getKnownBookScore(bookTitle, author);
  if (knownScore) {
    const rating = normalizeDifficultyRating(knownScore);
    const ratingId = await saveRating({
      canonicalKey,
      title: bookTitle,
      author,
      isbn,
      year,
      score: rating.difficultyIndex,
      level: rating.level,
      factors: { source: "Reading Quest verified estimate" },
    });
    return NextResponse.json({
      level: rating.level,
      difficultyIndex: rating.difficultyIndex,
      ratingId,
      canonicalKey,
      source: "known",
    });
  }

  const stored = await findStoredRating(canonicalKey);
  if (stored?.current_score) {
    const rating = normalizeDifficultyRating(Number(stored.current_score));
    return NextResponse.json({
      level: stored.book_level ?? rating.level,
      difficultyIndex: rating.difficultyIndex,
      ratingId: stored.id,
      canonicalKey,
      source: "cache",
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: quizModel,
      messages: [
        {
          role: "system",
          content:
            "You are a children's book difficulty expert for Reading Quest. Return only JSON. Estimate a stable RQ Difficulty Index from 1.0 to 9.9. Beginner is 1.0-3.3, Intermediate is 3.4-6.6, Advanced is 6.7-9.9. Judge the exact book only, not movies, soundtracks, games, adaptations, sequels, prequels, or other books in the same series.",
        },
        {
          role: "user",
          content: `Estimate the first RQ Difficulty Index for "${bookTitle}"${author ? ` by ${author}` : ""}${year ? `, first published around ${year}` : ""}${isbn ? `, ISBN ${isbn}` : ""}.

Consider these factors:
- target age range
- vocabulary complexity
- sentence complexity
- mature themes
- number of major characters
- number of important places
- number of important objects/items
- plot complexity
- theme complexity

Return JSON only:
{
  "difficultyIndex": number,
  "factors": {
    "targetAgeRange": string,
    "vocabularyComplexity": string,
    "sentenceComplexity": string,
    "matureThemes": string,
    "majorCharacters": string,
    "importantPlaces": string,
    "importantObjects": string,
    "plotComplexity": string,
    "themeComplexity": string
  }
}`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content ?? "";
    const rating = parseDifficultyResponse(content);
    const ratingId = await saveRating({
      canonicalKey,
      title: bookTitle,
      author,
      isbn,
      year,
      score: rating.difficultyIndex,
      level: rating.level,
      factors: rating.factors as Record<string, unknown>,
    });

    return NextResponse.json({
      level: rating.level,
      difficultyIndex: rating.difficultyIndex,
      ratingId,
      canonicalKey,
      source: "ai",
    });
  } catch {
    const fallback = normalizeDifficultyRating(5);
    return NextResponse.json({
      level: fallback.level,
      difficultyIndex: fallback.difficultyIndex,
      canonicalKey,
      source: "fallback",
    });
  }
}
