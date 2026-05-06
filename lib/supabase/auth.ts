"use client";

import { createBrowserSupabaseClient, isSupabaseConfigured } from "./client";
import type { Database } from "./database.types";
import {
  defaultParentControls,
  getProfiles,
  Profile,
  saveProfiles,
  setCurrentUserId,
} from "../user";

type DbProfile = Database["public"]["Tables"]["profiles"]["Row"];

export class EmailConfirmationRequiredError extends Error {
  constructor(email: string) {
    super(`Almost done. Check ${email} and confirm your email address, then come back to sign in.`);
    this.name = "EmailConfirmationRequiredError";
  }
}

function getAuthRedirectUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const origin = configuredUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return origin ? `${origin.replace(/\/$/, "")}/` : undefined;
}

function mapDbProfileToLocalProfile(row: DbProfile): Profile {
  return {
    id: row.id,
    name: row.screen_name,
    password: "__supabase_auth__",
    realName: row.real_name ?? row.screen_name,
    phone: row.phone ?? undefined,
    friends: [],
    canAddFriends: row.can_add_friends,
    profileCode: row.profile_code ?? undefined,
    friendProfileIds: [],
    points: row.points,
    lifetimePoints: row.lifetime_points,
    prizeRedemptions: [],
    quizzes: [],
    learningGoal: row.learning_goal ?? undefined,
    favoriteBooks: row.favorite_books,
    readingPreferences: typeof row.reading_preferences === "object" && row.reading_preferences
      ? row.reading_preferences as Profile["readingPreferences"]
      : undefined,
    readingNow: row.reading_now,
    readingLogs: [],
    bookAccess: typeof row.book_access === "object" && row.book_access
      ? row.book_access as Profile["bookAccess"]
      : {},
    avatarStyle: row.avatar_style ?? "Library Hero",
    badges: row.badges,
    parentControls: typeof row.parent_controls === "object" && row.parent_controls
      ? { ...defaultParentControls, ...(row.parent_controls as Partial<NonNullable<Profile["parentControls"]>>) }
      : defaultParentControls,
    leaderboardPrivate: row.leaderboard_private,
    subscriptionTier: row.subscription_tier,
    isParent: row.account_type === "parent",
    email: row.email ?? undefined,
    verified: row.verified,
    linkedChildren: [],
  };
}

function saveLocalMirror(profile: Profile) {
  const profiles = getProfiles();
  const exists = profiles.some((item) => item.id === profile.id);
  const next = exists
    ? profiles.map((item) => item.id === profile.id ? { ...item, ...profile } : item)
    : [...profiles, profile];
  saveProfiles(next);
  setCurrentUserId(profile.id);
  return profile;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || "Unknown error");
  }
  return typeof error === "string" ? error : "Unknown error";
}

async function ensureParentProfile(accessToken: string, realName?: string) {
  const response = await fetch("/api/auth/parent-profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ realName }),
  });

  const data = await response.json().catch(() => ({})) as { profile?: DbProfile; error?: string };

  if (!response.ok || !data.profile) {
    throw new Error(data.error || "Unable to load your Reading Quest parent profile.");
  }

  return data.profile;
}

async function accessChildProfile(action: "create" | "signIn", screenName: string, password: string) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const response = await fetch("/api/auth/child-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, screenName, password }),
  });

  const data = await response.json().catch(() => ({})) as { profile?: DbProfile; error?: string };

  if (!response.ok || !data.profile) {
    throw new Error(data.error || "Unable to access that child account.");
  }

  return saveLocalMirror(mapDbProfileToLocalProfile(data.profile));
}

export async function signInChildWithSupabase(screenName: string, password: string) {
  return accessChildProfile("signIn", screenName, password);
}

export async function createChildWithSupabase(screenName: string, password: string) {
  return accessChildProfile("create", screenName, password);
}

export async function signInParentWithSupabase(email: string, password: string) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("Supabase did not return a parent account.");
  }

  if (!data.session?.access_token) {
    throw new Error("Supabase did not return a valid session. Please sign in again.");
  }

  const dbProfile = await ensureParentProfile(
    data.session.access_token,
    typeof data.user.user_metadata?.real_name === "string"
      ? data.user.user_metadata.real_name
      : data.user.email?.split("@")[0],
  );

  return saveLocalMirror(mapDbProfileToLocalProfile(dbProfile));
}

export async function createParentWithSupabase(details: {
  email: string;
  password: string;
  realName: string;
}) {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createBrowserSupabaseClient();
  const redirectTo = getAuthRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email: details.email.trim(),
    password: details.password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        real_name: details.realName.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user || !data.session) {
    throw new EmailConfirmationRequiredError(details.email.trim());
  }

  const dbProfile = await ensureParentProfile(data.session.access_token, details.realName);
  return saveLocalMirror(mapDbProfileToLocalProfile(dbProfile));
}

export { getErrorMessage as getSupabaseErrorMessage };

export async function signOutSupabase() {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signOut();
}
