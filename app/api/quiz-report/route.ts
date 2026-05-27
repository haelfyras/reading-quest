import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import type { QuizIssueReport } from "../../../lib/types";

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getQuestionValue(difficulty: string) {
  if (difficulty === "hard") return 5;
  if (difficulty === "medium") return 4;
  return 2;
}

function mapReport(row: Record<string, any>, profileName = "Reader"): QuizIssueReport {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName,
    bookTitle: row.book_title,
    difficulty: row.difficulty,
    question: row.question,
    choices: Array.isArray(row.choices) ? row.choices : [],
    answerIndex: Number(row.answer_index ?? 0),
    selectedChoice: Number(row.selected_choice ?? -1),
    poolQuestionId: row.pool_question_id ?? undefined,
    questionValue: row.question_value ?? undefined,
    correctionPointsAwarded: Boolean(row.correction_points_awarded),
    correctionPoints: row.correction_points ?? undefined,
    reason: row.reason,
    status: row.status,
    parentNote: row.parent_note ?? undefined,
    date: row.created_at,
  };
}

async function getLinkedChildIds(supabase: any, parentId: string) {
  const { data, error } = await supabase
    .from("parent_child_links")
    .select("child_profile_id")
    .eq("parent_profile_id", parentId)
    .eq("status", "verified");

  if (error) {
    throw error;
  }

  return (data ?? []).map((link: any) => link.child_profile_id).filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parentId = url.searchParams.get("parentId") ?? "";
  const profileId = url.searchParams.get("profileId") ?? "";
  const summary = url.searchParams.get("summary") === "true";

  try {
    const supabase = createServiceSupabaseClient() as any;
    const profileIds = isUuid(parentId)
      ? await getLinkedChildIds(supabase, parentId)
      : isUuid(profileId)
        ? [profileId]
        : [];

    if (!profileIds.length) {
      return NextResponse.json(summary ? { openCount: 0 } : { reports: [] });
    }

    const { data: reports, error } = await supabase
      .from("quiz_issue_reports")
      .select("*")
      .in("profile_id", profileIds)
      .neq("status", "dismissed")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (summary) {
      return NextResponse.json({
        openCount: (reports ?? []).filter((report: any) => report.status !== "accepted").length,
      });
    }

    const profileNames = new Map<string, string>();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, screen_name, real_name")
      .in("id", profileIds);
    (profiles ?? []).forEach((profile: any) => {
      profileNames.set(profile.id, profile.real_name || profile.screen_name || "Reader");
    });

    return NextResponse.json({
      reports: (reports ?? []).map((report: any) => mapReport(report, profileNames.get(report.profile_id))),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load quiz reports." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  const status = body.status === "accepted" || body.status === "dismissed" ? body.status : "";
  const parentNote = typeof body.parentNote === "string" ? body.parentNote : undefined;

  if (!isUuid(reportId) || !status) {
    return NextResponse.json({ error: "A valid report and status are required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const { data: report, error: reportError } = await supabase
      .from("quiz_issue_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: reportError?.message || "Report not found." }, { status: 404 });
    }

    let correctionPoints = 0;
    if (
      status === "accepted" &&
      !report.correction_points_awarded &&
      Number(report.selected_choice ?? -1) !== Number(report.answer_index ?? 0)
    ) {
      correctionPoints = Number(report.question_value ?? 0) || getQuestionValue(report.difficulty);

      const { data: profile } = await supabase
        .from("profiles")
        .select("points, lifetime_points")
        .eq("id", report.profile_id)
        .maybeSingle();

      if (profile) {
        await supabase
          .from("profiles")
          .update({
            points: Number(profile.points ?? 0) + correctionPoints,
            lifetime_points: Number(profile.lifetime_points ?? 0) + correctionPoints,
          })
          .eq("id", report.profile_id);
      }

      const { data: latestQuiz } = await supabase
        .from("quiz_results")
        .select("*")
        .eq("profile_id", report.profile_id)
        .eq("book_title", report.book_title)
        .eq("difficulty", report.difficulty)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestQuiz) {
        await supabase
          .from("quiz_results")
          .update({
            score: Math.min(Number(latestQuiz.max_score ?? 1), Number(latestQuiz.score ?? 0) + 1),
            earned_points: Number(latestQuiz.earned_points ?? 0) + correctionPoints,
          })
          .eq("id", latestQuiz.id);
      }
    }

    const { error } = await supabase
      .from("quiz_issue_reports")
      .update({
        status,
        parent_note: parentNote ?? (status === "accepted" ? "Parent agreed this quiz item needs review." : "Parent dismissed this report."),
        correction_points_awarded: status === "accepted" ? Boolean(report.correction_points_awarded || correctionPoints > 0) : Boolean(report.correction_points_awarded),
        correction_points: status === "accepted" ? (report.correction_points ?? (correctionPoints || null)) : report.correction_points,
      })
      .eq("id", reportId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, correctionPoints });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update quiz report." },
      { status: 500 },
    );
  }
}
