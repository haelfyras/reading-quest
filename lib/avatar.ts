export type AvatarSkinTone = "default" | "fair" | "light" | "tan" | "brown" | "dark" | "deep";
export type AvatarColor = "default" | "black" | "brown" | "blonde" | "red" | "white" | "blue" | "pink" | "purple" | "green" | "teal" | "orange" | "yellow" | "gray";

export type AvatarSelection = {
  characterId: "wizard";
  skinTone: AvatarSkinTone;
  hairColor: AvatarColor;
  clothingColor: AvatarColor;
};

export type AvatarSwatch<T extends string> = {
  id: T;
  label: string;
  color: string;
};

export const wizardTemplateImage = "/characters/wizard/wizard-1-template-keyed.png";

export const sourceAvatarPalettes = {
  hair: ["#7DE0D4", "#3CB8AE", "#1B6E68", "#0F4542"],
  skin: ["#FFD7B6", "#E8A87C", "#B46A42", "#7A4327"],
  clothing: ["#C7B1F4", "#B499E6", "#956FE0", "#7A4AC7", "#4A2D8F", "#221455"],
} as const;

export const skinToneOptions: Array<AvatarSwatch<AvatarSkinTone>> = [
  { id: "default", label: "Default", color: "#FFC296" },
  { id: "fair", label: "Fair", color: "#FFF2E0" },
  { id: "light", label: "Light", color: "#FFD9B3" },
  { id: "tan", label: "Tan", color: "#E8A87C" },
  { id: "brown", label: "Brown", color: "#C6865A" },
  { id: "dark", label: "Dark", color: "#7A472E" },
  { id: "deep", label: "Deep", color: "#4A2A1A" },
];

export const hairColorOptions: Array<AvatarSwatch<AvatarColor>> = [
  { id: "default", label: "Default", color: "#6B442A" },
  { id: "black", label: "Black", color: "#1A1A1A" },
  { id: "brown", label: "Brown", color: "#6B442A" },
  { id: "blonde", label: "Blonde", color: "#E0C35A" },
  { id: "red", label: "Red", color: "#B23A2E" },
  { id: "white", label: "White", color: "#DADADA" },
  { id: "blue", label: "Blue", color: "#3C7FE6" },
  { id: "pink", label: "Pink", color: "#FF79C7" },
  { id: "purple", label: "Purple", color: "#9A5CFF" },
  { id: "green", label: "Green", color: "#3DBB6A" },
];

export const clothingColorOptions: Array<AvatarSwatch<AvatarColor>> = [
  { id: "default", label: "Default", color: "#1E4FD6" },
  { id: "blue", label: "Blue", color: "#1E4FD6" },
  { id: "teal", label: "Teal", color: "#17A2A6" },
  { id: "green", label: "Green", color: "#2E9E4C" },
  { id: "red", label: "Red", color: "#D13434" },
  { id: "purple", label: "Purple", color: "#7A3DC2" },
  { id: "orange", label: "Orange", color: "#F08A1E" },
  { id: "yellow", label: "Yellow", color: "#FFD23D" },
  { id: "gray", label: "Gray", color: "#7F7F7F" },
  { id: "black", label: "Black", color: "#1A1A1A" },
];

export const defaultAvatarSelection: AvatarSelection = {
  characterId: "wizard",
  skinTone: "default",
  hairColor: "default",
  clothingColor: "default",
};

function isSkinTone(value: string): value is AvatarSkinTone {
  return skinToneOptions.some((option) => option.id === value);
}

function isAvatarColor(value: string): value is AvatarColor {
  return hairColorOptions.some((option) => option.id === value) || clothingColorOptions.some((option) => option.id === value);
}

export function getSkinToneColor(id: AvatarSkinTone) {
  return skinToneOptions.find((option) => option.id === id)?.color ?? skinToneOptions[0].color;
}

export function getAvatarColor(id: AvatarColor, options: Array<AvatarSwatch<AvatarColor>>) {
  return options.find((option) => option.id === id)?.color ?? options[0].color;
}

export function serializeAvatarSelection(selection: AvatarSelection) {
  return `wizard:${selection.skinTone}:${selection.hairColor}:${selection.clothingColor}`;
}

export function parseAvatarSelection(value?: string): AvatarSelection {
  const [characterId, first, second, third] = String(value ?? "").split(":");

  if (characterId !== "wizard") {
    return defaultAvatarSelection;
  }

  // Legacy format was wizard:variant:skin:hair. Preserve user choices if encountered.
  if (/^\d+$/.test(first ?? "")) {
    return {
      characterId: "wizard",
      skinTone: isSkinTone(second) ? second : defaultAvatarSelection.skinTone,
      hairColor: isAvatarColor(third) ? third : defaultAvatarSelection.hairColor,
      clothingColor: defaultAvatarSelection.clothingColor,
    };
  }

  return {
    characterId: "wizard",
    skinTone: isSkinTone(first) ? first : defaultAvatarSelection.skinTone,
    hairColor: isAvatarColor(second) ? second : defaultAvatarSelection.hairColor,
    clothingColor: isAvatarColor(third) ? third : defaultAvatarSelection.clothingColor,
  };
}

export function getAvatarJourneyLabel(value?: string) {
  const selection = parseAvatarSelection(value);
  const clothing = clothingColorOptions.find((option) => option.id === selection.clothingColor)?.label ?? "Default";
  return `${clothing} Wizard mode`;
}
