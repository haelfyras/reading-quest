"use client";

import type { User } from "@supabase/supabase-js";
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

function generateProfileCode(name: string) {
  const prefix = name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "READ";
  return `RQ-${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
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

async function fetchParentProfile(user: User) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("account_type", "parent")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function createParentProfile(user: User, realName: string) {
  const supabase = createBrowserSupabaseClient();
  const email = user.email ?? "";
  const screenName = realName.trim() || email.split("@")[0] || "Parent";

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      account_type: "parent",
      screen_name: screenName,
      real_name: realName.trim() || screenName,
      email,
      profile_code: generateProfileCode(screenName),
      can_add_friends: true,
      avatar_style: "Library Hero",
      verified: Boolean(user.email_confirmed_at),
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
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

  const dbProfile = await fetchParentProfile(data.user) ?? await createParentProfile(
    data.user,
    typeof data.user.user_metadata?.real_name === "string"
      ? data.user.user_metadata.real_name
      : data.user.email?.split("@")[0] ?? "Parent",
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
  const { data, error } = await supabase.auth.signUp({
    email: details.email.trim(),
    password: details.password,
    options: {
      data: {
        real_name: details.realName.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user || !data.session) {
    throw new Error("Check your email to finish creating your parent account.");
  }

  const existingProfile = await fetchParentProfile(data.user);
  const dbProfile = existingProfile ?? await createParentProfile(data.user, details.realName);
  return saveLocalMirror(mapDbProfileToLocalProfile(dbProfile));
}

export async function signOutSupabase() {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signOut();
}
