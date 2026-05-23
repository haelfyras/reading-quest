import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import type { PrizeRedemption, Profile, QuizHistory, ReadingLog, ReadingPath } from "../../../lib/types";

const readingPaths = new Set<ReadingPath>(["explorer", "genre_adventurer", "skill_builder"]);

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asObject(value: unknown) {
  return typeof value === "object" && value ? value as Record<string, unknown> : {};
}

function asReadingPath(value: unknown): ReadingPath {
  return typeof value === "string" && readingPaths.has(value as ReadingPath)
    ? value as ReadingPath
    : "explorer";
}

function isAppDeleted(profile: Record<string, any> | null) {
  return Boolean(
    profile &&
    typeof profile.parent_controls === "object" &&
    profile.parent_controls &&
    typeof profile.parent_controls.appDeletedAt === "string",
  );
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

function mapReadingLog(row: Record<string, any>): ReadingLog {
  return {
    id: row.id,
    bookTitle: row.book_title,
    date: row.created_at,
    minutes: Number(row.minutes ?? 0),
    chaptersFinished: Number(row.chapters_finished ?? 0),
    accessType: row.access_type,
    assisted: Boolean(row.assisted),
    effortPoints: Number(row.effort_points ?? 0),
  };
}

function mapPrizeRedemption(row: Record<string, any>): PrizeRedemption {
  return {
    id: row.id,
    prizeId: row.prize_id ?? "",
    prizeName: row.prize_name,
    pointsSpent: Number(row.points_spent ?? 0),
    date: row.created_at,
  };
}

function mapProfile(
  row: Record<string, any>,
  linkedChildren: string[],
  quizzes: QuizHistory[],
  readingLogs: ReadingLog[],
  prizeRedemptions: PrizeRedemption[],
): Profile {
  return {
    id: row.id,
    name: row.screen_name,
    password: "__supabase_auth__",
    realName: row.account_type === "parent" ? row.real_name ?? row.screen_name : undefined,
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
    readingPreferences: asObject(row.reading_preferences) as Profile["readingPreferences"],
    readingPath: asReadingPath(row.reading_path),
    readingNow: asStringArray(row.reading_now),
    readingLogs,
    bookAccess: asObject(row.book_access) as Profile["bookAccess"],
    avatarStyle: row.avatar_style ?? "tassel",
    badges: asStringArray(row.badges),
    parentControls: asObject(row.parent_controls) as Profile["parentControls"],
    leaderboardPrivate: Boolean(row.leaderboard_private),
    subscriptionTier: row.subscription_tier ?? "free",
    isParent: row.account_type === "parent",
    email: row.email ?? undefined,
    verified: Boolean(row.verified),
    linkedChildren,
  };
}

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  if (!profileId) {
    return NextResponse.json({ error: "Profile id is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError || !profileRow) {
      return NextResponse.json({ error: profileError?.message || "Profile not found." }, { status: 404 });
    }

    if (isAppDeleted(profileRow)) {
      return NextResponse.json({ error: "This account is no longer active in Reading Quest." }, { status: 403 });
    }

    const { data: childLinks, error: childLinksError } = profileRow.account_type === "parent"
      ? await supabase
          .from("parent_child_links")
          .select("child_profile_id")
          .eq("parent_profile_id", profileId)
          .eq("status", "verified")
      : { data: [], error: null };

    if (childLinksError) {
      return NextResponse.json({ error: childLinksError.message }, { status: 500 });
    }

    const linkedChildIds = (childLinks ?? []).map((link: any) => link.child_profile_id).filter(Boolean);
    const { data: childRows, error: childRowsError } = linkedChildIds.length
      ? await supabase.from("profiles").select("*").in("id", linkedChildIds)
      : { data: [], error: null };

    if (childRowsError) {
      return NextResponse.json({ error: childRowsError.message }, { status: 500 });
    }

    const profileRows = [profileRow, ...(childRows ?? []).filter((row: any) => !isAppDeleted(row))];
    const profileIds = profileRows.map((row: any) => row.id);

    const [quizzesResult, readingLogsResult, redemptionsResult] = profileIds.length
      ? await Promise.all([
          supabase.from("quiz_results").select("*").in("profile_id", profileIds).order("created_at", { ascending: false }),
          supabase.from("reading_logs").select("*").in("profile_id", profileIds).order("created_at", { ascending: false }),
          supabase.from("prize_redemptions").select("*").in("profile_id", profileIds).order("created_at", { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

    const firstError = [quizzesResult.error, readingLogsResult.error, redemptionsResult.error].find(Boolean);
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const quizzesByProfile = new Map<string, QuizHistory[]>();
    (quizzesResult.data ?? []).forEach((quiz: any) => {
      const current = quizzesByProfile.get(quiz.profile_id) ?? [];
      quizzesByProfile.set(quiz.profile_id, [...current, mapQuiz(quiz)]);
    });

    const logsByProfile = new Map<string, ReadingLog[]>();
    (readingLogsResult.data ?? []).forEach((log: any) => {
      const current = logsByProfile.get(log.profile_id) ?? [];
      logsByProfile.set(log.profile_id, [...current, mapReadingLog(log)]);
    });

    const redemptionsByProfile = new Map<string, PrizeRedemption[]>();
    (redemptionsResult.data ?? []).forEach((redemption: any) => {
      const current = redemptionsByProfile.get(redemption.profile_id) ?? [];
      redemptionsByProfile.set(redemption.profile_id, [...current, mapPrizeRedemption(redemption)]);
    });

    const profile = mapProfile(
      profileRow,
      linkedChildIds,
      quizzesByProfile.get(profileRow.id) ?? [],
      logsByProfile.get(profileRow.id) ?? [],
      redemptionsByProfile.get(profileRow.id) ?? [],
    );
    const linkedChildren = (childRows ?? [])
      .filter((row: any) => !isAppDeleted(row))
      .map((row: any) => mapProfile(
        row,
        [],
        quizzesByProfile.get(row.id) ?? [],
        logsByProfile.get(row.id) ?? [],
        redemptionsByProfile.get(row.id) ?? [],
      ));

    return NextResponse.json({ profile, linkedChildren });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load profile data." },
      { status: 500 },
    );
  }
}
