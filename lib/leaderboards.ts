import type { Profile } from "./user";

export async function loadSiteLeaderboardProfiles(currentProfileId?: string) {
  const response = await fetch(`/api/leaderboards?currentProfileId=${encodeURIComponent(currentProfileId ?? "")}`);
  if (!response.ok) {
    throw new Error("Unable to load site-wide leaderboards.");
  }

  const data = await response.json() as { profiles?: Profile[] };
  return data.profiles ?? [];
}
