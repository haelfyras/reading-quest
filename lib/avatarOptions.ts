export type AvatarOption = {
  id: string;
  name: string;
  group: string;
  src: string;
};

export type AvatarArchetypeId = "tassel" | "knight" | "scholar" | "space" | "spooky" | "wizard";

export type AvatarArchetype = {
  id: AvatarArchetypeId;
  name: string;
  src: string;
  description: string;
};

export const tasselAvatar: AvatarOption = {
  id: "tassel",
  name: "Tassel",
  group: "Tassel",
  src: "/avatars/tassel.png",
};

const avatarGroups = [
  { group: "Knight", prefix: "knight", archetype: "knight" },
  { group: "Scholar", prefix: "scholar", archetype: "scholar" },
  { group: "Space", prefix: "space", archetype: "space" },
  { group: "Spooky", prefix: "spooky", archetype: "spooky" },
  { group: "Wizard", prefix: "wizard", archetype: "wizard" },
] as const;

export const avatarArchetypes: AvatarArchetype[] = [
  { id: "tassel", name: "Tassel", src: tasselAvatar.src, description: "Reading Quest guide" },
  { id: "knight", name: "Knight", src: "/avatars/knight-1.png", description: "Brave quest heroes" },
  { id: "scholar", name: "Scholar", src: "/avatars/scholar-1.png", description: "Curious book experts" },
  { id: "space", name: "Space", src: "/avatars/space-1.png", description: "Galaxy explorers" },
  { id: "spooky", name: "Spooky", src: "/avatars/spooky-1.png", description: "Mystery seekers" },
  { id: "wizard", name: "Wizard", src: "/avatars/wizard-1.png", description: "Magic readers" },
];

export const avatarOptions: AvatarOption[] = [
  tasselAvatar,
  ...avatarGroups.flatMap(({ group, prefix }) =>
  Array.from({ length: 9 }, (_, index) => {
    const number = index + 1;
    return {
      id: `${prefix}-${number}`,
      name: `${group} ${number}`,
      group,
      src: `/avatars/${prefix}-${number}.png`,
    };
  }),
  ),
];

export const defaultAvatarId = "tassel";

export function getAvatarArchetypeForAvatar(avatarId?: string | null): AvatarArchetypeId {
  if (!avatarId || avatarId === "tassel") return "tassel";
  const match = avatarGroups.find((group) => avatarId.startsWith(`${group.prefix}-`));
  return match?.archetype ?? "tassel";
}

export function getAvatarOptionsForArchetype(archetypeId: AvatarArchetypeId): AvatarOption[] {
  if (archetypeId === "tassel") return [tasselAvatar];
  const group = avatarGroups.find((item) => item.archetype === archetypeId);
  if (!group) return [tasselAvatar];
  return avatarOptions.filter((avatar) => avatar.id.startsWith(`${group.prefix}-`));
}

export function getAvatarOption(avatarId?: string | null) {
  return avatarOptions.find((avatar) => avatar.id === avatarId) ?? tasselAvatar;
}
