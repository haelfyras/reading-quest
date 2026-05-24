import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../../../../lib/adminAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";
import type { PrizeRedemption, Profile, QuizHistory, QuizIssueReport, ReadingLog } from "../../../../lib/user";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mapProfile(
  row: Record<string, any>,
  linkedChildren: string[],
  quizzes: QuizHistory[],
  readingLogs: ReadingLog[],
  prizeRedemptions: PrizeRedemption[],
): Profile & { appDeletedAt?: string; appDeletedReason?: string; testAccountAt?: string } {
  const parentControls = typeof row.parent_controls === "object" && row.parent_controls ? row.parent_controls : undefined;

  return {
    id: row.id,
    name: row.screen_name,
    password: "__supabase_auth__",
    realName: row.real_name ?? row.screen_name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    friends: [],
    canAddFriends: Boolean(row.can_add_friends),
    profileCode: row.profile_code ?? undefined,
    friendProfileIds: [],
    points: Number(row.points ?? 0),
    lifetimePoints: Number(row.lifetime_points ?? 0),
    prizeRedemptions,
    quizzes,
    learningGoal: row.learning_goal ?? undefined,
    favoriteBooks: asStringArray(row.favorite_books),
    readingPreferences: typeof row.reading_preferences === "object" && row.reading_preferences ? row.reading_preferences : undefined,
    readingPath: row.reading_path ?? "explorer",
    readingNow: asStringArray(row.reading_now),
    readingLogs,
    bookAccess: typeof row.book_access === "object" && row.book_access ? row.book_access : {},
    avatarStyle: row.avatar_style ?? "tassel",
    badges: asStringArray(row.badges),
    parentControls,
    leaderboardPrivate: Boolean(row.leaderboard_private),
    subscriptionTier: row.subscription_tier ?? "free",
    isParent: row.account_type === "parent",
    verified: Boolean(row.verified),
    linkedChildren,
    appDeletedAt: typeof parentControls?.appDeletedAt === "string" ? parentControls.appDeletedAt : undefined,
    appDeletedReason: typeof parentControls?.appDeletedReason === "string" ? parentControls.appDeletedReason : undefined,
    testAccountAt: typeof parentControls?.testAccountAt === "string" ? parentControls.testAccountAt : undefined,
  };
}

function mapQuiz(row: Record<string, any>): QuizHistory {
  return {
    bookTitle: row.book_title,
    date: row.created_at,
    score: Number(row.score ?? 0),
    maxScore: Number(row.max_score ?? 1),
    earnedPoints: Number(row.earned_points ?? 0),
    difficulty: row.difficulty,
    bookLevel: row.book_level,
    bookDifficultyScore: row.book_difficulty_score === null || row.book_difficulty_score === undefined
      ? undefined
      : Number(row.book_difficulty_score),
    bookDifficultyRatingId: row.book_difficulty_rating_id ?? undefined,
    learningGoal: row.learning_goal,
  };
}

function mapReport(row: Record<string, any>, profileName: string): QuizIssueReport & { source: "supabase" } {
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
    questionValue: row.question_value ?? undefined,
    correctionPointsAwarded: Boolean(row.correction_points_awarded),
    correctionPoints: row.correction_points ?? undefined,
    reason: row.reason,
    status: row.status,
    parentNote: row.parent_note ?? undefined,
    date: row.created_at,
    source: "supabase",
  };
}

export async function GET() {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const adminSupabase = supabase as any;

    const [
      profilesResult,
      linksResult,
      quizzesResult,
      reportsResult,
      feedbackResult,
      telemetryResult,
      parentRequestsResult,
      prizeRequestsResult,
      redemptionsResult,
      readingLogsResult,
      challengesResult,
      questionPoolResult,
    ] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("parent_child_links").select("*"),
      supabase.from("quiz_results").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("quiz_issue_reports").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("feedback_entries").select("*").order("created_at", { ascending: false }).limit(200),
      adminSupabase.from("telemetry_events").select("*").order("created_at", { ascending: false }).limit(500),
      adminSupabase.from("parent_verification_requests").select("*").order("created_at", { ascending: false }).limit(200),
      adminSupabase.from("prize_add_requests").select("*").order("created_at", { ascending: false }).limit(200),
      adminSupabase.from("prize_redemptions").select("*").order("created_at", { ascending: false }).limit(200),
      adminSupabase.from("reading_logs").select("*").order("created_at", { ascending: false }).limit(500),
      adminSupabase.from("reading_challenges").select("*").order("created_at", { ascending: false }).limit(200),
      adminSupabase.from("book_question_pool").select("canonical_key,book_title,author,quiz_difficulty,question_version,active,created_at").limit(5000),
    ]);

    const firstError = [
      profilesResult.error,
      linksResult.error,
      quizzesResult.error,
      reportsResult.error,
      feedbackResult.error,
      telemetryResult.error,
      parentRequestsResult.error,
      prizeRequestsResult.error,
      redemptionsResult.error,
      readingLogsResult.error,
      challengesResult.error,
      questionPoolResult.error,
    ].find(Boolean);

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const profilesById = new Map((profilesResult.data ?? []).map((profile: any) => [profile.id, profile]));
    const quizzesByProfile = new Map<string, QuizHistory[]>();
    (quizzesResult.data ?? []).forEach((quiz: any) => {
      const current = quizzesByProfile.get(quiz.profile_id) ?? [];
      quizzesByProfile.set(quiz.profile_id, [...current, mapQuiz(quiz)]);
    });

    const readingLogsByProfile = new Map<string, ReadingLog[]>();
    (readingLogsResult.data ?? []).forEach((log: any) => {
      const current = readingLogsByProfile.get(log.profile_id) ?? [];
      readingLogsByProfile.set(log.profile_id, [
        ...current,
        {
          id: log.id,
          bookTitle: log.book_title,
          date: log.created_at,
          minutes: Number(log.minutes ?? 0),
          chaptersFinished: Number(log.chapters_finished ?? 0),
          accessType: log.access_type,
          assisted: Boolean(log.assisted),
          effortPoints: Number(log.effort_points ?? 0),
        },
      ]);
    });

    const redemptionsByProfile = new Map<string, PrizeRedemption[]>();
    (redemptionsResult.data ?? []).forEach((redemption: any) => {
      const current = redemptionsByProfile.get(redemption.profile_id) ?? [];
      redemptionsByProfile.set(redemption.profile_id, [
        ...current,
        {
          id: redemption.id,
          prizeId: redemption.prize_id ?? "",
          prizeName: redemption.prize_name,
          pointsSpent: Number(redemption.points_spent ?? 0),
          date: redemption.created_at,
        },
      ]);
    });

    const linkedChildrenByParent = new Map<string, string[]>();
    (linksResult.data ?? []).forEach((link: any) => {
      if (link.status !== "verified") return;
      const current = linkedChildrenByParent.get(link.parent_profile_id) ?? [];
      linkedChildrenByParent.set(link.parent_profile_id, [...current, link.child_profile_id]);
    });

    const profiles = (profilesResult.data ?? []).map((profile: any) =>
      mapProfile(
        profile,
        linkedChildrenByParent.get(profile.id) ?? [],
        quizzesByProfile.get(profile.id) ?? [],
        readingLogsByProfile.get(profile.id) ?? [],
        redemptionsByProfile.get(profile.id) ?? [],
      ),
    );

    const reports = (reportsResult.data ?? []).map((report: any) => {
      const profile = profilesById.get(report.profile_id) as Record<string, any> | undefined;
      return mapReport(report, profile?.real_name || profile?.screen_name || "Unknown profile");
    });

    const questionPoolRows = (questionPoolResult.data ?? []) as Array<Record<string, any>>;
    const poolBooksByVersion = questionPoolRows.reduce<Record<string, Set<string>>>((counts, row: any) => {
      const version = String(row.question_version ?? "unknown");
      counts[version] = counts[version] ?? new Set<string>();
      counts[version].add(row.canonical_key);
      return counts;
    }, {});
    const poolQuestionsByDifficulty = questionPoolRows.reduce<Record<string, number>>((counts, row: any) => {
      const difficulty = String(row.quiz_difficulty ?? "unknown");
      counts[difficulty] = (counts[difficulty] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({
      profiles,
      reports,
      questionPoolStats: {
        totalQuestions: questionPoolRows.length,
        activeQuestions: questionPoolRows.filter((row: any) => row.active !== false).length,
        uniqueBooks: new Set(questionPoolRows.map((row: any) => row.canonical_key)).size,
        versionCounts: Object.fromEntries(Object.entries(poolBooksByVersion).map(([version, books]) => [version, books.size])),
        difficultyCounts: poolQuestionsByDifficulty,
        recentBooks: Array.from(
          new Map(
            questionPoolRows
              .slice()
              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((row: any) => [row.canonical_key, {
                title: row.book_title,
                author: row.author ?? "",
                version: row.question_version,
                difficulty: row.quiz_difficulty,
                createdAt: row.created_at,
              }]),
          ).values(),
        ).slice(0, 8),
      },
      feedbackEntries: (feedbackResult.data ?? []).map((entry: any) => ({
        id: entry.id,
        profileId: entry.profile_id ?? undefined,
        profileName: entry.profile_name ?? undefined,
        category: entry.category ?? "General feedback",
        message: entry.message,
        page: entry.page ?? "Unknown page",
        adminStatus: entry.sentiment ?? "still_problem",
        date: entry.created_at,
      })),
      telemetry: (telemetryResult.data ?? []).map((event: any) => ({
        id: event.id,
        type: event.event_name === "page_view" ? "page_view" : "api_failure",
        message: event.metadata?.message || event.event_name || "Telemetry event",
        source: event.page,
        status: event.metadata?.status,
        date: event.created_at,
      })),
      parentRequests: (parentRequestsResult.data ?? []).map((request: any) => ({
        id: request.id,
        parentId: request.parent_profile_id,
        parentName: (profilesById.get(request.parent_profile_id) as any)?.real_name || (profilesById.get(request.parent_profile_id) as any)?.screen_name || "Parent",
        childId: request.child_profile_id ?? "",
        childScreenName: request.child_screen_name,
        status: request.status,
        createdAt: request.created_at,
        expiresAt: request.expires_at ?? undefined,
      })),
      prizeAddRequests: (prizeRequestsResult.data ?? []).map((request: any) => ({
        id: request.id,
        childId: request.child_profile_id,
        childName: (profilesById.get(request.child_profile_id) as any)?.screen_name || "Child",
        prizeName: request.prize_name,
        points: Number(request.suggested_points ?? 0),
        status: request.status === "approved" ? "added" : request.status === "dismissed" ? "dismissed" : "pending",
        date: request.created_at,
      })),
      challenges: (challengesResult.data ?? []).map((challenge: any) => ({
        id: challenge.id,
        bookTitle: challenge.book_title,
        difficulty: challenge.difficulty,
        bookLevel: challenge.book_level,
        quizTitle: challenge.quiz_title,
        quizDescription: challenge.quiz_description ?? "",
        questions: Array.isArray(challenge.questions) ? challenge.questions : [],
        fromProfileId: challenge.from_profile_id,
        fromName: (profilesById.get(challenge.from_profile_id) as any)?.screen_name || "Reader",
        toProfileId: challenge.to_profile_id,
        toName: (profilesById.get(challenge.to_profile_id) as any)?.screen_name || "Friend",
        initiatorScore: Number(challenge.initiator_score ?? 0),
        initiatorMaxScore: Number(challenge.initiator_max_score ?? 0),
        initiatorAnswers: Array.isArray(challenge.initiator_answers) ? challenge.initiator_answers : [],
        responderScore: challenge.responder_score ?? undefined,
        responderMaxScore: challenge.responder_max_score ?? undefined,
        responderAnswers: Array.isArray(challenge.responder_answers) ? challenge.responder_answers : undefined,
        status: challenge.status === "completed" ? "completed" : "pending",
        createdAt: challenge.created_at,
        completedAt: challenge.completed_at ?? undefined,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load admin data." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const feedbackId = typeof body.feedbackId === "string" ? body.feedbackId : "";
  const adminStatus = typeof body.adminStatus === "string" ? body.adminStatus : "";
  const allowedStatuses = new Set(["still_problem", "in_process", "resolved"]);

  if (!feedbackId || !allowedStatuses.has(adminStatus)) {
    return NextResponse.json({ error: "Feedback id and valid status are required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
      .from("feedback_entries")
      .update({ sentiment: adminStatus })
      .eq("id", feedbackId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update feedback status." },
      { status: 500 },
    );
  }
}
