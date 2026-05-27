import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../../../../lib/adminAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(request: Request) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  let poolQuestionId = typeof body.poolQuestionId === "string" ? body.poolQuestionId : "";

  if (!isUuid(poolQuestionId) && !isUuid(reportId)) {
    return NextResponse.json({ error: "A question id or report id is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    let report: Record<string, any> | null = null;

    if (!isUuid(poolQuestionId) && isUuid(reportId)) {
      const { data, error } = await supabase
        .from("quiz_issue_reports")
        .select("id,book_title,difficulty,question,pool_question_id")
        .eq("id", reportId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      report = data ?? null;
      poolQuestionId = typeof data?.pool_question_id === "string" ? data.pool_question_id : "";
    }

    if (!isUuid(poolQuestionId) && report) {
      const { data, error } = await supabase
        .from("book_question_pool")
        .select("id")
        .eq("book_title", report.book_title)
        .eq("quiz_difficulty", report.difficulty)
        .eq("question", report.question)
        .eq("active", true)
        .limit(2);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if ((data ?? []).length !== 1) {
        return NextResponse.json(
          { error: "Unable to identify one matching pooled question. Newer reports will include a direct question id." },
          { status: 409 },
        );
      }

      poolQuestionId = data?.[0]?.id ?? "";
    }

    if (!isUuid(poolQuestionId)) {
      return NextResponse.json({ error: "This report is not linked to a pooled question." }, { status: 400 });
    }

    const removedAt = new Date().toISOString();
    const { data: removedQuestion, error: updateError } = await supabase
      .from("book_question_pool")
      .update({
        active: false,
        updated_at: removedAt,
      })
      .eq("id", poolQuestionId)
      .select("id,book_title,quiz_difficulty,question")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!removedQuestion) {
      return NextResponse.json({ error: "Question not found." }, { status: 404 });
    }

    await (supabase as any).from("telemetry_events").insert({
      event_name: "question_pool_removed",
      page: "/admin",
      metadata: {
        poolQuestionId,
        reportId: isUuid(reportId) ? reportId : null,
        bookTitle: removedQuestion.book_title,
        difficulty: removedQuestion.quiz_difficulty,
        question: removedQuestion.question,
        removedAt,
      },
    });

    return NextResponse.json({ ok: true, removedQuestion });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove question from active pool." },
      { status: 500 },
    );
  }
}
