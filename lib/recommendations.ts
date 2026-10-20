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
  reasons: Record<string, string>;
  teasers: Record<string, string>;
  categories: string[];
  updatedLabel: string;
};

const pathLabels = {
  explorer: "Explorer",
  genre_adventurer: "Genre Adventurer",
  skill_builder: "Skill Builder",
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
  "sports and games": [
    "The Crossover",
    "Roller Girl",
    "The Million Dollar Shot",
    "Ghost",
    "STAT: Standing Tall and Talented",
    "Game Changer",
    "The Wild Soccer Bunch",
    "Jake Maddox: Soccer Shootout",
  ],
  "thoughtful stories": [
    "Wonder",
    "The Giver",
    "Number the Stars",
    "A Long Walk to Water",
    "Bridge to Terabithia",
    "Esperanza Rising",
    "The Watsons Go to Birmingham - 1963",
    "Inside Out and Back Again",
  ],
  "knowledge builders": [
    "Hidden Figures: Young Readers' Edition",
    "The Boy Who Harnessed the Wind: Young Readers Edition",
    "Who Was Marie Curie?",
    "What If You Had Animal Teeth?",
    "The Way Things Work Now",
    "Tracking Trash",
    "The Story of Ruby Bridges",
    "Ada Twist, Scientist",
  ],
  "problem solvers": [
    "The Mysterious Benedict Society",
    "Escape from Mr. Lemoncello's Library",
    "Chasing Vermeer",
    "Frindle",
    "The Westing Game",
    "The Invention of Hugo Cabret",
    "The Wild Robot",
    "The City of Ember",
  ],
  "great stories": fallbackTitles,
};

const categoryPatterns: Array<[RegExp, string]> = [
  [/\b(fantasy|dragon|wizard|magic|kingdom|princess(?:es)?|castle(?:s)?|spell|narnia|hobbit)\b/, "fantasy"],
  [/\b(children|child|kids|kid|picture book|beginner|early reader|little|mouse|friendship|family|cozy|school)\b/, "children's books"],
  [/\b(mystery|detective|secret|clue|spy|investigation|case|escape|spooky)\b/, "mystery"],
  [/\b(science fiction|sci[- ]?fi|space|robot|alien|future|planet|city of ember)\b/, "science fiction"],
  [/\b(adventure|quest|journey|explorer|treasure|pirate(?:s)?|island|mountain|ocean)\b/, "adventure"],
  [/\b(animal|lion|dog|cat|horse|mouse|cricket|swan|wolf|ivan|winn-dixie)\b/, "animals"],
  [/\b(funny|humor|silly|diary|wimpy|wayside|terrible|milk)\b/, "humor"],
  [/\b(sports?|soccer|basketball|baseball|football|games?|gaming)\b/, "sports and games"],
];

const sourceWeights = {
  favorite: 3,
  quiz: 3,
  preference: 1,
};

const sourceLabels = {
  favorite: "favorite books",
  quiz: "quiz history",
  preference: "reading taste quiz",
};

const categoryTeasers: Record<string, string[]> = {
  fantasy: [
    "Magic, danger, and an unexpected hero collide in this adventure. Open the cover and see which impossible choice comes first.",
    "A strange new world is waiting, filled with secrets and a quest that will test its heroes. The next surprise may be only one page away.",
  ],
  "children's books": [
    "Meet memorable characters facing a problem that feels much bigger than expected. Their funny, brave, or surprising solution makes this story worth discovering.",
    "A warm adventure begins with an ordinary day and one very unexpected turn. Follow along to see how friendship changes everything.",
  ],
  mystery: [
    "A puzzling secret is hiding in plain sight, and every clue matters. See if you can solve it before the characters do.",
    "Something does not add up, and a curious hero is determined to learn why. Each chapter brings the truth a little closer.",
  ],
  "science fiction": [
    "A strange world and a huge challenge push young heroes beyond everything they know. Their next discovery could change the future.",
    "New technology, unfamiliar places, and one bold question launch this adventure. Find out what happens when the impossible suddenly feels real.",
  ],
  adventure: [
    "A daring journey begins, packed with danger, discoveries, and choices that cannot be undone. The destination is only part of the adventure.",
    "An unlikely hero steps beyond the familiar and into a challenge full of surprises. Every mile brings a new reason to keep reading.",
  ],
  animals: [
    "An unforgettable animal hero faces a world filled with friendship, danger, and change. Follow the journey to see where courage leads.",
    "The animals in this story have problems, hopes, and adventures all their own. Their next choice may surprise every human around them.",
  ],
  humor: [
    "A perfectly normal situation spins wildly out of control in this laugh-filled story. The characters' next plan may be their funniest mistake yet.",
    "Big personalities and even bigger mix-ups turn every chapter into a new surprise. See how much trouble one clever idea can cause.",
  ],
  "sports and games": [
    "The pressure is on, but winning is not the only challenge. Teamwork, courage, and one crucial moment could change the whole game.",
    "Practice meets a high-stakes challenge in this fast-moving story. Find out what the hero learns when the score is not the only thing that matters.",
  ],
  "thoughtful stories": [
    "A young person faces a choice that changes how they see family, friendship, and the world around them. This story leaves plenty to think about after the last page.",
    "Life takes an unexpected turn, asking the hero to find courage in a new way. Small moments build toward a choice that truly matters.",
  ],
  "knowledge builders": [
    "Real ideas and remarkable people come alive in a story powered by curiosity. Discover the questions that led to an extraordinary breakthrough.",
    "This true-to-life journey shows how one determined thinker tackled a difficult problem. The answer begins with noticing what everyone else missed.",
  ],
  "problem solvers": [
    "A difficult puzzle demands sharp thinking, teamwork, and a willingness to try the unexpected. See whether you can spot the solution first.",
    "Clues are everywhere, but solving this challenge will take more than one clever idea. Each discovery opens the door to a bigger mystery.",
  ],
  "great stories": [
    "An unforgettable cast steps into a challenge that will test courage and friendship. Start reading to discover why this story has stayed a favorite.",
    "One unexpected event changes everything for the characters in this beloved story. Their journey is full of heart, surprises, and moments worth sharing.",
  ],
};

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

function addCategorySignals(
  scores: Map<string, number>,
  sources: Map<string, Set<keyof typeof sourceLabels>>,
  text: string,
  source: keyof typeof sourceWeights,
) {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return;

  for (const [pattern, category] of categoryPatterns) {
    if (pattern.test(normalized)) {
      scores.set(category, (scores.get(category) ?? 0) + sourceWeights[source]);
      const categorySources = sources.get(category) ?? new Set<keyof typeof sourceLabels>();
      categorySources.add(source);
      sources.set(category, categorySources);
    }
  }
}

function getSourceText(categoryList: string[], categorySources: Map<string, Set<keyof typeof sourceLabels>>) {
  const strongestSources = new Set<keyof typeof sourceLabels>();
  categoryList.forEach((category) => {
    categorySources.get(category)?.forEach((source) => strongestSources.add(source));
  });

  const orderedSources = (["favorite", "quiz", "preference"] as Array<keyof typeof sourceLabels>)
    .filter((source) => strongestSources.has(source))
    .map((source) => sourceLabels[source]);

  if (orderedSources.length === 0) {
    return "popular books for young readers";
  }

  if (orderedSources.length === 1) {
    return `your ${orderedSources[0]}`;
  }

  return `your ${orderedSources.slice(0, -1).join(", ")} and ${orderedSources[orderedSources.length - 1]}`;
}

function getPath(profile?: Profile | null) {
  return profile?.readingPath ?? "explorer";
}

export function getBookRecommendations({
  profile,
  favoriteBooks = [],
  rotationOffset = 0,
  limit = 5,
}: RecommendationInput): RecommendationResult {
  const favorites = favoriteBooks.length ? favoriteBooks : profile?.favoriteBooks ?? [];
  const quizTitles = profile?.quizzes.map((quiz) => quiz.bookTitle) ?? [];
  const preferenceAnswers = profile?.readingPreferences
    ? [
        profile.readingPreferences.storyKinds,
        profile.readingPreferences.characters,
        profile.readingPreferences.places,
        profile.readingPreferences.feelings,
        profile.readingPreferences.topics,
      ].filter(Boolean)
    : [];
  const excludedTitles = new Set([...favorites, ...quizTitles].map(normalizeTitle));

  const categoryScores = new Map<string, number>();
  const categorySources = new Map<string, Set<keyof typeof sourceLabels>>();
  favorites.forEach((title) => addCategorySignals(categoryScores, categorySources, title, "favorite"));
  quizTitles.forEach((title) => addCategorySignals(categoryScores, categorySources, title, "quiz"));
  preferenceAnswers.forEach((answer) => addCategorySignals(categoryScores, categorySources, answer, "preference"));

  if (categoryScores.size === 0) {
    const hasAnyTasteData = [...favorites, ...quizTitles, ...preferenceAnswers].join(" ").trim();
    categoryScores.set(hasAnyTasteData ? "great stories" : "children's books", 1);
  }

  const seed = getDailySeed(rotationOffset);
  const rankedCategories = Array.from(categoryScores.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category]) => category);
  const usualCategories = rankedCategories.slice(0, 3);
  const readingPath = getPath(profile);
  const categoryList = (() => {
    if (readingPath === "genre_adventurer") {
      const usual = new Set(usualCategories);
      const outsideUsual = Object.keys(suggestionPools)
        .filter((category) => category !== "great stories" && !category.startsWith("thoughtful") && !category.startsWith("knowledge") && !category.startsWith("problem"))
        .filter((category) => !usual.has(category));
      return rotate(outsideUsual.length ? outsideUsual : usualCategories, seed).slice(0, 3);
    }

    if (readingPath === "skill_builder") {
      return ["thoughtful stories", "knowledge builders", "problem solvers"];
    }

    return usualCategories;
  })();
  const candidateTitles = categoryList.flatMap((category, index) => {
    const pool = suggestionPools[category] ?? fallbackTitles;
    return rotate(pool, seed + index * 3);
  });

  const suggestions = uniqueTitles([...candidateTitles, ...rotate(fallbackTitles, seed)])
    .filter((title) => !excludedTitles.has(normalizeTitle(title)))
    .slice(0, limit);

  const interestText = categoryList.slice(0, 2).join(" and ");
  const sourceText = getSourceText(categoryList, categorySources);
  const reasons = Object.fromEntries(
    suggestions.map((title, index) => {
      const category = categoryList[index % categoryList.length] ?? "great stories";
      const categorySourceText = getSourceText([category], categorySources);
      if (readingPath === "genre_adventurer") {
        return [
          title,
          `Suggested by Genre Adventurer to help you try ${category} beyond your usual reading patterns.`,
        ];
      }
      if (readingPath === "skill_builder") {
        return [
          title,
          `Suggested by Skill Builder because it can stretch thinking, discussion, or real-world understanding.`,
        ];
      }
      return [
        title,
        `Suggested because ${categorySourceText} ${categorySourceText === "popular books for young readers" ? "include" : "point toward"} ${category}.`,
      ];
    }),
  );
  const teasers = Object.fromEntries(
    suggestions.map((title, index) => {
      const category = Object.entries(suggestionPools)
        .find(([, titles]) => titles.some((candidate) => normalizeTitle(candidate) === normalizeTitle(title)))?.[0]
        ?? categoryList[index % Math.max(categoryList.length, 1)]
        ?? "great stories";
      const options = categoryTeasers[category] ?? categoryTeasers["great stories"];
      return [title, options[index % options.length]];
    }),
  );
  const summary = (() => {
    if (readingPath === "genre_adventurer") {
      return `${pathLabels.genre_adventurer} picks branch into ${interestText || "new genres"} so reading does not get stuck in one lane.`;
    }
    if (readingPath === "skill_builder") {
      return `${pathLabels.skill_builder} picks emphasize thoughtful stories, problem solving, and useful ideas.`;
    }
    return `Fresh picks based on ${sourceText}. Today's list leans toward ${interestText}.`;
  })();

  return {
    summary,
    suggestions,
    reasons,
    teasers,
    categories: categoryList,
    updatedLabel: "Refreshes daily",
  };
}
