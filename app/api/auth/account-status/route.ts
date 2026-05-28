import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

function isAppDeleted(profile: Record<string, any> | null) {
  return Boolean(
    profile &&
    typeof profile.parent_controls === "object" &&
    profile.parent_controls &&
    typeof profile.parent_controls.appDeletedAt === "string",
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accountType = body.accountType === "parent" ? "parent" : body.accountType === "child" ? "child" : "";
  const email = String(body.email || "").trim();
  const screenName = String(body.screenName || "").trim();

  if (!accountType) {
    return NextResponse.json({ error: "Account type is required." }, { status: 400 });
  }

  if (accountType === "parent" && !email) {
    return NextResponse.json({ error: "Parent email is required." }, { status: 400 });
  }

  if (accountType === "child" && !screenName) {
    return NextResponse.json({ error: "Child screen name is required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    let query = supabase
      .from("profiles")
      .select("id,parent_controls")
      .eq("account_type", accountType)
      .limit(1);

    query = accountType === "parent"
      ? query.ilike("email", email)
      : query.ilike("screen_name", screenName);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const profile = data?.[0] ?? null;
    return NextResponse.json({
      exists: Boolean(profile),
      appRemoved: isAppDeleted(profile),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check account status." },
      { status: 500 },
    );
  }
}
