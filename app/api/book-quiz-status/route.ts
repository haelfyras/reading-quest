import { NextResponse } from "next/server";
import { getBookDifficultyKey } from "../../../lib/bookDifficulty";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const title = url.searchParams.get("bookTitle")?.trim() ?? "";
  const author = url.searchParams.get("author")?.trim() ?? "";
  const isbn = url.searchParams.get("isbn")?.trim() ?? "";
  const providedKey = url.searchParams.get("canonicalKey")?.trim() ?? "";

  if (!title && !providedKey) {
    return NextResponse.json({ firstReader: false, certain: false });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const canonicalKey = providedKey || getBookDifficultyKey({ title, author, isbn });
    const [poolResult, quizResult] = await Promise.all([
      supabase
        .from("book_question_pool")
        .select("id")
        .eq("canonical_key", canonicalKey)
        .limit(1),
      supabase
        .from("quiz_results")
        .select("id")
        .ilike("book_title", title || "%")
        .limit(1),
    ]);

    if (poolResult.error || quizResult.error) {
      return NextResponse.json({ firstReader: false, certain: false });
    }

    const hasPool = (poolResult.data ?? []).length > 0;
    const hasQuiz = (quizResult.data ?? []).length > 0;
    return NextResponse.json({
      firstReader: !hasPool && !hasQuiz,
      certain: true,
    });
  } catch {
    return NextResponse.json({ firstReader: false, certain: false });
  }
}
