import { NextResponse } from "next/server";
import { createServiceSupabaseClient, isServiceSupabaseConfigured } from "../../../lib/supabase/server";
import type { Profile } from "../../../lib/user";

function mapLeaderboardProfile(row: Record<string, any>, quizCount: number): Profile {
  return {
    id: row.id,
    name: row.account_type === "parent"
      ? row.real_name || row.screen_name || "Parent"
      : row.screen_name || "Reader",
    password: "__supabase_leaderboard__",
    realName: row.account_type === "parent" ? row.real_name ?? undefined : undefined,
    points: Number(row.points ?? 0),
    lifetimePoints: Number(row.lifetime_points ?? 0),
    prizeRedemptions: [],
    quizzes: Array.from({ length: quizCount }, (_, index) => ({
      bookTitle: "Quiz",
      date: row.updated_at ?? row.created_at,
      score: 0,
      maxScore: 0,
      earnedPoints: 0,
      difficulty: "easy",
      bookLevel: "beginner",
      learningGoal: "leaderboard",
    })),
    favoriteBooks: [],
    readingNow: [],
    readingLogs: [],
    bookAccess: {},
    avatarStyle: row.avatar_style ?? "tassel",
    badges: Array.isArray(row.badges) ? row.badges : [],
    leaderboardPrivate: Boolean(row.leaderboard_private),
    subscriptionTier: row.subscription_tier ?? "free",
    isParent: row.account_type === "parent",
    email: undefined,
    verified: Boolean(row.verified),
    linkedChildren: [],
    canAddFriends: Boolean(row.can_add_friends),
    profileCode: undefined,
    friendProfileIds: [],
    friends: [],
  };
}

function isAppDeleted(profile: Record<string, any>) {
  return Boolean(
    typeof profile.parent_controls === "object" &&
    profile.parent_controls &&
    typeof profile.parent_controls.appDeletedAt === "string",
  );
}

function isTestAccount(profile: Record<string, any>) {
  return Boolean(
    typeof profile.parent_controls === "object" &&
    profile.parent_controls &&
    typeof profile.parent_controls.testAccountAt === "string",
  );
}

export async function GET(request: Request) {
  const currentProfileId = new URL(request.url).searchParams.get("currentProfileId") ?? "";

  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json({ profiles: [] });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, account_type, screen_name, real_name, points, lifetime_points, avatar_style, badges, leaderboard_private, subscription_tier, verified, can_add_friends, parent_controls, created_at, updated_at")
      .or(`leaderboard_private.eq.false,id.eq.${currentProfileId || "00000000-0000-0000-0000-000000000000"}`);

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    const activeProfiles = (profiles ?? []).filter((profile: any) => !isAppDeleted(profile) && !isTestAccount(profile));
    const profileIds = activeProfiles.map((profile: any) => profile.id);
    const { data: quizzes, error: quizzesError } = profileIds.length
      ? await supabase.from("quiz_results").select("profile_id").in("profile_id", profileIds)
      : { data: [], error: null };

    if (quizzesError) {
      return NextResponse.json({ error: quizzesError.message }, { status: 500 });
    }

    const quizCounts = new Map<string, number>();
    (quizzes ?? []).forEach((quiz: any) => {
      quizCounts.set(quiz.profile_id, (quizCounts.get(quiz.profile_id) ?? 0) + 1);
    });

    const leaderboardProfiles = activeProfiles.map((profile: any) =>
      mapLeaderboardProfile(profile, quizCounts.get(profile.id) ?? 0),
    );

    return NextResponse.json({ profiles: leaderboardProfiles });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load leaderboards." },
      { status: 500 },
    );
  }
}
