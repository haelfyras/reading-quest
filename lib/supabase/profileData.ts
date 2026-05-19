import { getProfiles, saveProfiles, setCurrentUserId } from "../user";
import type { Profile } from "../types";
import { isUuid } from "../ids";

export type SharedProfileData = {
  profile: Profile;
  linkedChildren: Profile[];
};

export async function loadSharedProfileData(profileId: string): Promise<SharedProfileData> {
  if (!isUuid(profileId)) {
    throw new Error("This beta profile has not been synced to Supabase yet.");
  }

  const response = await fetch(`/api/profile-data?profileId=${encodeURIComponent(profileId)}`);
  const data = await response.json().catch(() => ({})) as Partial<SharedProfileData> & { error?: string };

  if (!response.ok || !data.profile) {
    throw new Error(data.error || "Unable to load shared profile data.");
  }

  return {
    profile: data.profile,
    linkedChildren: data.linkedChildren ?? [],
  };
}

export function mirrorSharedProfileData(data: SharedProfileData) {
  const incoming = [data.profile, ...data.linkedChildren];
  const incomingById = new Map(incoming.map((profile) => [profile.id, profile]));
  const existing = getProfiles();
  const merged = [
    ...existing.map((profile) => incomingById.get(profile.id) ?? profile),
    ...incoming.filter((profile) => !existing.some((item) => item.id === profile.id)),
  ];

  saveProfiles(merged);
  setCurrentUserId(data.profile.id);
  return data.profile;
}

export async function refreshSharedProfileData(profileId: string) {
  const data = await loadSharedProfileData(profileId);
  mirrorSharedProfileData(data);
  return data;
}
