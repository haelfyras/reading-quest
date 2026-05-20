import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../../../../lib/adminAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

function getProfileControls(profile: Record<string, any>) {
  return typeof profile.parent_controls === "object" && profile.parent_controls ? profile.parent_controls : {};
}

export async function PATCH(request: Request) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const action = typeof body.action === "string" ? body.action : "";

  if (!profileId) {
    return NextResponse.json({ error: "Profile id is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, points, lifetime_points, leaderboard_private, parent_controls")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: profileError?.message || "Profile not found." }, { status: 404 });
    }

    if (action === "add_points") {
      const points = Math.max(0, Math.min(10000, Math.ceil(Number(body.points ?? 0))));
      if (!points) {
        return NextResponse.json({ error: "Enter at least 1 point to add." }, { status: 400 });
      }

      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          points: Number(profile.points ?? 0) + points,
          lifetime_points: Number(profile.lifetime_points ?? 0) + points,
        })
        .eq("id", profileId)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to add points." }, { status: 500 });
      }

      return NextResponse.json({ profile: updated });
    }

    if (action === "soft_delete") {
      const controls = getProfileControls(profile);
      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          can_add_friends: false,
          leaderboard_private: true,
          parent_controls: {
            ...controls,
            appDeletedAt: new Date().toISOString(),
            appDeletedReason: "Admin beta soft delete",
          },
        })
        .eq("id", profileId)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to remove profile from the app." }, { status: 500 });
      }

      return NextResponse.json({ profile: updated });
    }

    if (action === "toggle_test_account") {
      const controls = getProfileControls(profile);
      const makeTestAccount = Boolean(body.enabled);
      const nextControls = { ...controls };
      if (makeTestAccount) {
        nextControls.testAccountAt = new Date().toISOString();
        nextControls.testAccountPreviousLeaderboardPrivate = Boolean(profile.leaderboard_private);
      } else {
        delete nextControls.testAccountAt;
        delete nextControls.testAccountPreviousLeaderboardPrivate;
      }

      const previousLeaderboardPrivate = Boolean(controls.testAccountPreviousLeaderboardPrivate);
      const { data: updated, error } = await supabase
        .from("profiles")
        .update({
          leaderboard_private: makeTestAccount ? true : previousLeaderboardPrivate,
          parent_controls: nextControls,
        })
        .eq("id", profileId)
        .select("*")
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to update test account status." }, { status: 500 });
      }

      return NextResponse.json({ profile: updated });
    }

    return NextResponse.json({ error: "Unsupported account action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update account." },
      { status: 500 },
    );
  }
}
