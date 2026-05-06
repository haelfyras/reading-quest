export const preferencePrompts = [
  {
    key: "storyKinds",
    label: "What kind of stories do you like?",
    placeholder: "space, fantasy, princesses, pirates",
    suggestions: ["space", "fantasy", "princesses", "pirates", "mystery", "animals"],
  },
  {
    key: "characters",
    label: "Who do you like reading about?",
    placeholder: "dragons, kids like me, robots, funny animals",
    suggestions: ["dragons", "kids like me", "robots", "funny animals", "superheroes", "detectives"],
  },
  {
    key: "places",
    label: "Where should the story happen?",
    placeholder: "school, castles, forests, other planets",
    suggestions: ["school", "castles", "forests", "other planets", "the ocean", "big cities"],
  },
  {
    key: "feelings",
    label: "How should the book feel?",
    placeholder: "funny, exciting, cozy, spooky",
    suggestions: ["funny", "exciting", "cozy", "spooky", "magical", "adventurous"],
  },
  {
    key: "topics",
    label: "What else do you want in a book?",
    placeholder: "friendship, games, science, treasure",
    suggestions: ["friendship", "games", "science", "treasure", "family", "sports"],
  },
] as const;

export type PreferenceKey = typeof preferencePrompts[number]["key"];

export const emptyReadingPreferences: Record<PreferenceKey, string> = {
  storyKinds: "",
  characters: "",
  places: "",
  feelings: "",
  topics: "",
};
