import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

function generateProfileCode(name: string) {
  const prefix = name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "READ";
  return `RQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

export async function POST(request: Request) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Missing Supabase session token." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const realName = String(body.realName || "").trim();

  try {
    const supabase = createServiceSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: userError?.message || "Unable to verify the Supabase user." },
        { status: 401 },
      );
    }

    const user = userData.user;
    const { data: existing, error: existingError } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .eq("account_type", "parent")
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json({ profile: existing });
    }

    const email = user.email ?? "";
    const metadataName = typeof user.user_metadata?.real_name === "string"
      ? user.user_metadata.real_name
      : "";
    const screenName = realName || metadataName || email.split("@")[0] || "Parent";
    const safeScreenName = screenName.trim() || "Parent";

    if (email) {
      const { data: existingByEmail, error: emailLookupError } = await supabase
        .from("profiles")
        .select("*")
        .eq("account_type", "parent")
        .ilike("email", email)
        .maybeSingle();

      if (emailLookupError) {
        return NextResponse.json({ error: emailLookupError.message }, { status: 500 });
      }

      if (existingByEmail) {
        const { data: reclaimed, error: reclaimError } = await supabase
          .from("profiles")
          .update({
            auth_user_id: user.id,
            real_name: realName || existingByEmail.real_name || safeScreenName,
            screen_name: existingByEmail.screen_name || safeScreenName,
            can_add_friends: true,
            verified: Boolean(user.email_confirmed_at),
          })
          .eq("id", existingByEmail.id)
          .select("*")
          .single();

        if (reclaimError || !reclaimed) {
          return NextResponse.json(
            { error: reclaimError?.message || "Unable to reconnect your parent profile." },
            { status: 500 },
          );
        }

        return NextResponse.json({ profile: reclaimed });
      }
    }

    const { data: created, error: createError } = await supabase
      .from("profiles")
      .insert({
        auth_user_id: user.id,
        account_type: "parent",
        screen_name: safeScreenName,
        real_name: realName || safeScreenName,
        email,
        profile_code: generateProfileCode(safeScreenName),
        can_add_friends: true,
        avatar_style: "Library Hero",
        verified: Boolean(user.email_confirmed_at),
      })
      .select("*")
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ profile: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load parent profile." },
      { status: 500 },
    );
  }
}
