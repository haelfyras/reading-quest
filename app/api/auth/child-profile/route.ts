import crypto from "crypto";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

const PASSWORD_PREFIX = "pbkdf2_sha256";
const ITERATIONS = 120000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

function normalizeScreenName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function generateProfileCode(screenName: string) {
  const base = screenName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5)
    .padEnd(5, "R");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `RQ-${base}-${suffix}`;
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${PASSWORD_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [prefix, iterationsText, salt, expectedHash] = storedHash.split("$");
  const iterations = Number(iterationsText);

  if (prefix !== PASSWORD_PREFIX || !Number.isInteger(iterations) || !salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  return expectedBuffer.length === actualHash.length && crypto.timingSafeEqual(actualHash, expectedBuffer);
}

function isAppDeleted(profile: Record<string, any> | null) {
  return Boolean(
    profile &&
    typeof profile.parent_controls === "object" &&
    profile.parent_controls &&
    typeof profile.parent_controls.appDeletedAt === "string",
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "signIn");
    const screenName = normalizeScreenName(String(body.screenName || ""));
    const password = String(body.password || "");

    if (!screenName || !password) {
      return NextResponse.json({ error: "Screen name and password are required." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Use at least 6 characters for the password." }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    const { data: existingProfiles, error: lookupError } = await supabase
      .from("profiles")
      .select("*")
      .eq("account_type", "child")
      .ilike("screen_name", screenName)
      .limit(1);

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    const existingProfile = existingProfiles?.[0] ?? null;

    if (action === "create") {
      if (existingProfile) {
        return NextResponse.json({ error: "That screen name already exists. Try signing in or choose a different screen name." }, { status: 409 });
      }

      const { data: createdProfile, error: createError } = await supabase
        .from("profiles")
        .insert({
          account_type: "child",
          screen_name: screenName,
          child_password_hash: hashPassword(password),
          profile_code: generateProfileCode(screenName),
          can_add_friends: false,
          avatar_style: "tassel",
          verified: true,
        })
        .select("*")
        .single();

      if (createError || !createdProfile) {
        const message = createError?.code === "23505"
          ? "That screen name already exists. Try signing in or choose a different screen name."
          : createError?.message || "Unable to create child account.";
        return NextResponse.json({ error: message }, { status: createError?.code === "23505" ? 409 : 500 });
      }

      return NextResponse.json({ profile: createdProfile });
    }

    if (isAppDeleted(existingProfile)) {
      return NextResponse.json({ error: "This account is no longer active in Reading Quest." }, { status: 403 });
    }

    if (!existingProfile || !verifyPassword(password, existingProfile.child_password_hash)) {
      return NextResponse.json({ error: "That screen name or password did not match." }, { status: 401 });
    }

    return NextResponse.json({ profile: existingProfile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to access child account." },
      { status: 500 },
    );
  }
}
