import type { Profile } from "./user";

type RecommendationInput = {
  profile?: Profile | null;
  favoriteBooks?: string[];
  rotationOffset?: number;
  limit?: number;
};

type RecommendationResult = {
  summary: string;
  suggestions: string[];
  categories: string[];
  updatedLabel: string;
};

const fallbackTitles = [
  "Matilda",
  "Charlotte's Web",
  "The Magic Tree House",
  "The Lion, the Witch and the Wardrobe",
  "Because of Winn-Dixie",
  "The Tale of Despereaux",
  "Holes",
  "Stuart Little",
  "James and the Giant Peach",
  "The One and Only Ivan",
];

const suggestionPools: Record<string, string[]> = {
  fantasy: [
    "The Neverending Story",
    "The Dragon of the Lost Sea",
    "Ella Enchanted",
    "How to Train Your Dragon",
    "The Girl Who Drank the Moon",
    "Dealing with Dragons",
    "The Spiderwick Chronicles",
    "The Penderwicks at Last",
  ],
  "children's books": [
    "Charlotte's Web",
    "The Tale of Despereaux",
    "The Magic Tree House",
    "Where the Wild Things Are",
    "Mercy Watson to the Rescue",
    "Ramona Quimby, Age 8",
    "The Year of Billy Miller",
    "Toys Go Out",
  ],
  mystery: [
    "The Boxcar Children",
    "Encyclopedia Brown",
    "The Westing Game",
    "Nancy Drew and the Clue Crew",
    "The Secret Garden",
    "Chasing Vermeer",
    "The Mysterious Benedict Society",
    "Escape from Mr. Lemoncello's Library",
  ],
  "science fiction": [
    "A Wrinkle in Time",
    "The Wild Robot",
    "The City of Ember",
    "Space Case",
    "The Last Kids on Earth",
    "Zita the Spacegirl",
    "The Search for WondLa",
    "We're Not from Here",
  ],
  adventure: [
    "Percy Jackson and the Lightning Thief",
    "The Adventures of Tintin",
    "The Hobbit",
    "Island of the Blue Dolphins",
    "Treasure Island",
    "The Wild Robot Escapes",
    "My Side of the Mountain",
    "The Explorer",
  ],
  animals: [
    "The One and Only Ivan",
    "Because of Winn-Dixie",
    "Pax",
    "The Cricket in Times Square",
    "Mrs. Frisby and the Rats of NIMH",
    "The Trumpet of the Swan",
    "A Wolf Called Wander",
    "The Mouse and the Motorcycle",
  ],
  humor: [
    "Sideways Stories from Wayside School",
    "Frindle",
    "The Terrible Two",
    "Fortunately, the Milk",
    "The Best Christmas Pageant Ever",
    "Wedgie and Gizmo",
    "The 13-Story Treehouse",
    "Diary of a Wimpy Kid",
  ],
  "great stories": fallbackTitles,
};

const categoryPatterns: Array<[RegExp, string]> = [
  [/\b(fantasy|dragon|wizard|magic|kingdom|princess|castle|spell|narnia|hobbit)\b/, "fantasy"],
  [/\b(children|child|kids|picture book|beginner|early reader|little|mouse)\b/, "children's books"],
  [/\b(mystery|detective|secret|clue|spy|investigation|case|escape)\b/, "mystery"],
  [/\b(science fiction|sci[- ]?fi|space|robot|alien|future|planet|city of ember)\b/, "science fiction"],
  [/\b(adventure|quest|journey|explorer|treasure|pirate|island|mountain)\b/, "adventure"],
  [/\b(animal|dog|cat|horse|mouse|cricket|swan|wolf|ivan|winn-dixie)\b/, "animals"],
  [/\b(funny|humor|silly|diary|wimpy|wayside|terrible|milk)\b/, "humor"],
];

function normalizeTitle(title: string) {
  return title.trim().toLowerCase().replace(/^the\s+/, "");
}

function getDailySeed(rotationOffset = 0) {
  const today = new Date();
  const dayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  return dayNumber + rotationOffset;
}

function rotate<T>(items: T[], seed: number) {
  if (items.length === 0) return items;
  const start = Math.abs(seed) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function uniqueTitles(titles: string[]) {
  const seen = new Set<string>();
  return titles.filter((title) => {
    const key = normalizeTitle(title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getBookRecommendations({
  profile,
  favoriteBooks = [],
  rotationOffset = 0,
  limit = 5,
}: RecommendationInput): RecommendationResult {
  const favorites = favoriteBooks.length ? favoriteBooks : profile?.favoriteBooks ?? [];
  const quizTitles = profile?.quizzes.map((quiz) => quiz.bookTitle) ?? [];
  const combinedText = [...favorites, ...quizTitles].join(" ").toLowerCase();
  const excludedTitles = new Set([...favorites, ...quizTitles].map(normalizeTitle));

  const categories = new Set<string>();
  for (const [pattern, category] of categoryPatterns) {
    if (pattern.test(combinedText)) {
      categories.add(category);
    }
  }

  if (categories.size === 0) {
    categories.add(combinedText.trim() ? "great stories" : "children's books");
  }

  const seed = getDailySeed(rotationOffset);
  const categoryList = rotate(Array.from(categories), seed).slice(0, 3);
  const candidateTitles = categoryList.flatMap((category, index) => {
    const pool = suggestionPools[category] ?? fallbackTitles;
    return rotate(pool, seed + index * 3);
  });

  const suggestions = uniqueTitles([...candidateTitles, ...rotate(fallbackTitles, seed)])
    .filter((title) => !excludedTitles.has(normalizeTitle(title)))
    .slice(0, limit);

  const interestText = categoryList.slice(0, 2).join(" and ");
  const sourceText = quizTitles.length
    ? "your favorite books and quiz history"
    : favorites.length
      ? "your favorite books"
      : "popular books for young readers";

  return {
    summary: `Fresh picks based on ${sourceText}. Today's list leans toward ${interestText}.`,
    suggestions,
    categories: categoryList,
    updatedLabel: "Refreshes daily",
  };
}
