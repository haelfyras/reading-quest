import { getNextAllowedDifficulty } from "./scoring";

export type QuizHistory = {
  bookTitle: string;
  date: string;
  score: number;
  maxScore: number;
  earnedPoints?: number;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
};

export type BookAccessType = "owned" | "library" | "audiobook" | "ebook" | "read_aloud" | "borrowed";

export type ReadingLog = {
  id: string;
  bookTitle: string;
  date: string;
  minutes: number;
  chaptersFinished: number;
  accessType: BookAccessType;
  assisted: boolean;
  effortPoints: number;
};

export type ReadingPreferences = {
  storyKinds: string;
  characters: string;
  places: string;
  feelings: string;
  topics: string;
  updatedAt?: string;
};

export type PrizeRedemption = {
  id: string;
  prizeId: string;
  prizeName: string;
  pointsSpent: number;
  date: string;
};

export type Review = {
  id: string;
  profileId: string;
  profileName: string;
  bookTitle: string;
  rating: number;
  reviewText: string;
  date: string;
};

export type QuizIssueReport = {
  id: string;
  profileId: string;
  profileName: string;
  bookTitle: string;
  difficulty: string;
  question: string;
  choices: string[];
  answerIndex: number;
  selectedChoice: number;
  reason: "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book";
  status?: "open" | "accepted" | "dismissed";
  parentNote?: string;
  date: string;
};

export type ChallengeQuizQuestion = {
  question: string;
  choices: string[];
  answerIndex: number;
  answerText?: string;
  explanation?: string;
};

export type ReadingChallenge = {
  id: string;
  bookTitle: string;
  difficulty: string;
  bookLevel: string;
  quizTitle: string;
  quizDescription: string;
  questions: ChallengeQuizQuestion[];
  fromProfileId: string;
  fromName: string;
  toProfileId: string;
  toName: string;
  initiatorScore: number;
  initiatorMaxScore: number;
  initiatorAnswers: number[];
  responderScore?: number;
  responderMaxScore?: number;
  responderAnswers?: number[];
  status: "pending" | "completed";
  createdAt: string;
  completedAt?: string;
};

export type FriendContact = {
  id: string;
  name: string;
  profileId?: string;
  profileCode?: string;
  email?: string;
  phone?: string;
  date: string;
};

export type ParentVerificationRequest = {
  id: string;
  parentId: string;
  parentName: string;
  parentEmail?: string;
  childId: string;
  childScreenName: string;
  childFirstName: string;
  status: "child_pending" | "code_pending" | "verified" | "expired" | "rejected";
  code?: string;
  parentCodeEntered?: boolean;
  childCodeEntered?: boolean;
  createdAt: string;
  expiresAt?: string;
};

export type ParentControls = {
  prizeApprovalRequired: boolean;
  allowQuizRetakes: boolean;
  maxGoalDifficulty: "easy" | "medium" | "hard";
  requireAiQuizReview: boolean;
  allowLocationLookup: boolean;
  testingLevel: TestingLevel;
};

export type SubscriptionTier = "free" | "ad_free" | "plus";

export type TestingLevel =
  | "habit_formation"
  | "basic_recollection"
  | "further_understanding"
  | "full_understanding";

export type Profile = {
  id: string;
  name: string;
  password: string;
  realName?: string;
  phone?: string;
  friends?: FriendContact[];
  canAddFriends?: boolean;
  profileCode?: string;
  friendProfileIds?: string[];
  points: number;
  lifetimePoints?: number;
  prizeRedemptions?: PrizeRedemption[];
  quizzes: QuizHistory[];
  learningGoal?: string;
  favoriteBooks?: string[];
  readingPreferences?: ReadingPreferences;
  readingNow?: string[];
  readingLogs?: ReadingLog[];
  bookAccess?: Record<string, BookAccessType>;
  avatarStyle?: string;
  badges?: string[];
  parentControls?: ParentControls;
  leaderboardPrivate?: boolean;
  subscriptionTier?: SubscriptionTier;
  isParent?: boolean;
  email?: string;
  verified?: boolean;
  linkedChildren?: string[]; // array of child profile ids
};

export const difficultyLevels = ["easy", "medium", "hard"] as const;
export type Difficulty = typeof difficultyLevels[number];

export function getNextDifficulty(difficulty: string): Difficulty | null {
  const index = difficultyLevels.indexOf(difficulty as Difficulty);
  if (index === -1 || index >= difficultyLevels.length - 1) {
    return null;
  }
  return difficultyLevels[index + 1];
}

export function getLastQuizEntry(profile: Profile, bookTitle: string): QuizHistory | null {
  const normalizedTitle = bookTitle.trim().toLowerCase();
  const matching = profile.quizzes
    .filter((quiz) => quiz.bookTitle.trim().toLowerCase() === normalizedTitle)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return matching.length ? matching[0] : null;
}

export function getLastQuizEntryForDifficulty(
  profile: Profile,
  bookTitle: string,
  difficulty: string,
): QuizHistory | null {
  const normalizedTitle = bookTitle.trim().toLowerCase();
  const matching = profile.quizzes
    .filter(
      (quiz) =>
        quiz.bookTitle.trim().toLowerCase() === normalizedTitle &&
        quiz.difficulty === difficulty,
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return matching.length ? matching[0] : null;
}

export type RetakeStatus = {
  nextDifficulty: Difficulty | null;
  available: boolean;
  waitText: string;
  pointsAvailable: number;
  forFunOnly: boolean;
};

export function getRetakeDifficulty(profile: Profile, bookTitle: string): Difficulty | null {
  const lastQuiz = getLastQuizEntry(profile, bookTitle);
  if (!lastQuiz) {
    return "easy";
  }

  const mastered = lastQuiz.score === lastQuiz.maxScore;
  if (!mastered) {
    return lastQuiz.difficulty as Difficulty;
  }

  return getNextAllowedDifficulty(lastQuiz.difficulty, lastQuiz.bookLevel);
}

export function getRetakeStatus(profile: Profile, bookTitle: string): RetakeStatus {
  const lastQuiz = getLastQuizEntry(profile, bookTitle);
  if (!lastQuiz) {
    return { nextDifficulty: "easy", available: true, waitText: "Start", pointsAvailable: 0, forFunOnly: false };
  }

  const mastered = lastQuiz.score === lastQuiz.maxScore;
  const nextDifficulty = mastered ? getNextAllowedDifficulty(lastQuiz.difficulty, lastQuiz.bookLevel) : (lastQuiz.difficulty as Difficulty);

  if (mastered) {
    if (nextDifficulty) {
      return { nextDifficulty, available: true, waitText: `Try ${nextDifficulty}`, pointsAvailable: 0, forFunOnly: false };
    }
    const lastDate = new Date(lastQuiz.date);
    const ageMs = Date.now() - lastDate.getTime();
    const isReady = ageMs >= 24 * 60 * 60 * 1000;
    return {
      nextDifficulty: lastQuiz.difficulty as Difficulty,
      available: isReady,
      waitText: isReady ? "Retake for fun" : "Fun retake tomorrow",
      pointsAvailable: 0,
      forFunOnly: true,
    };
  }

  const pointsAvailable = Math.max(0, lastQuiz.maxScore - lastQuiz.score);

  return {
    nextDifficulty,
    available: true,
    waitText: `Earn up to ${pointsAvailable}`,
    pointsAvailable,
    forFunOnly: false,
  };
}

const STORAGE_KEY = "readingQuestProfiles";
const CURRENT_USER_KEY = "readingQuestCurrentUserId";
const PARENT_REQUESTS_KEY = "readingQuestParentVerificationRequests";
const READING_CHALLENGES_KEY = "readingQuestReadingChallenges";

export const defaultParentControls: ParentControls = {
  prizeApprovalRequired: true,
  allowQuizRetakes: true,
  maxGoalDifficulty: "hard",
  requireAiQuizReview: false,
  allowLocationLookup: false,
  testingLevel: "basic_recollection",
};

export const avatarStyles = ["Explorer", "Story Mage", "Space Reader", "Library Hero", "Mystery Solver"] as const;

export const subscriptionPlans: Record<SubscriptionTier, {
  name: string;
  monthlyPrice: string;
  annualPrice?: string;
  includedChildren: number;
  extraChildPrice?: string;
  quizRule: string;
  description: string;
  limits: string[];
}> = {
  free: {
    name: "Free",
    monthlyPrice: "$0",
    includedChildren: 2,
    quizRule: "Ads required before quizzes",
    description: "A simple starter plan for families beginning a reading habit.",
    limits: ["2 child profiles", "Prizes", "Ad-unlocked quizzes", "Basic points"],
  },
  ad_free: {
    name: "Ad-Free Family",
    monthlyPrice: "$2.99/mo",
    annualPrice: "$24.99/year",
    includedChildren: 3,
    extraChildPrice: "+$1/mo per extra child",
    quizRule: "10 quizzes per child per 24 hours",
    description: "The same core reading loop without ads.",
    limits: ["3 child profiles included", "No ads", "10 quizzes per child per 24 hours", "Prizes and basic progress"],
  },
  plus: {
    name: "Reading Quest Plus",
    monthlyPrice: "$7.99/mo",
    annualPrice: "$69.99/year",
    includedChildren: 5,
    extraChildPrice: "+$1/mo per extra child",
    quizRule: "Unlimited quizzes",
    description: "The complete family reading toolkit.",
    limits: ["5 child profiles included", "Unlimited quizzes", "All reading, friend, location, leaderboard, and parent review features", "Full prize and progress tools"],
  },
};

function readStorage<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

const defaultProfiles: Profile[] = [
  {
    id: "demo-child-1",
    name: "Test1Test",
    password: "password123",
    points: 0,
    lifetimePoints: 0,
    prizeRedemptions: [],
    quizzes: [],
    favoriteBooks: [],
    readingPreferences: undefined,
    readingNow: [],
    readingLogs: [],
    bookAccess: {},
    avatarStyle: "Explorer",
    badges: [],
    parentControls: defaultParentControls,
    leaderboardPrivate: false,
    subscriptionTier: "free",
    isParent: false,
    verified: true,
    linkedChildren: [],
    canAddFriends: false,
    profileCode: "RQ-TEST1",
    friendProfileIds: [],
    friends: [],
  },
];

export function getProfiles(): Profile[] {
  const stored = readStorage<Profile[]>(STORAGE_KEY);
  if (stored && stored.length > 0) {
    return stored;
  }

  saveProfiles(defaultProfiles);
  return defaultProfiles;
}

export function saveProfiles(profiles: Profile[]) {
  writeStorage(STORAGE_KEY, profiles);
}

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (id) {
    window.localStorage.setItem(CURRENT_USER_KEY, id);
  } else {
    window.localStorage.removeItem(CURRENT_USER_KEY);
  }
}

export function getCurrentProfile(): Profile | null {
  const currentId = getCurrentUserId();
  if (!currentId) {
    return null;
  }

  return getProfiles().find((profile) => profile.id === currentId) ?? null;
}

export function normalizeSubscriptionTier(tier: string | undefined): SubscriptionTier {
  if (tier === "ad_free" || tier === "plus" || tier === "free") {
    return tier;
  }

  if (tier === "premium" || tier === "school" || tier === "library") {
    return "plus";
  }

  return "free";
}

export function getEffectiveSubscriptionTier(profile: Profile): SubscriptionTier {
  if (profile.isParent) {
    return normalizeSubscriptionTier(profile.subscriptionTier);
  }

  const parent = getProfiles().find((item) => item.isParent && item.linkedChildren?.includes(profile.id));
  return normalizeSubscriptionTier(parent?.subscriptionTier ?? profile.subscriptionTier);
}

export function getQuizCountInLast24Hours(profile: Profile) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return profile.quizzes.filter((quiz) => new Date(quiz.date).getTime() >= cutoff).length;
}

export function getPlanQuizAvailability(profile: Profile) {
  const tier = getEffectiveSubscriptionTier(profile);
  if (tier === "ad_free") {
    const used = getQuizCountInLast24Hours(profile);
    const limit = 10;
    return {
      tier,
      available: used < limit,
      requiresAd: false,
      used,
      limit,
      message: used < limit
        ? `${limit - used} ad-free quizzes left in this 24-hour period.`
        : "This Ad-Free plan has reached 10 quizzes in the last 24 hours.",
    };
  }

  if (tier === "plus") {
    return {
      tier,
      available: true,
      requiresAd: false,
      used: getQuizCountInLast24Hours(profile),
      limit: null,
      message: "Plus includes unlimited quizzes.",
    };
  }

  return {
    tier,
    available: true,
    requiresAd: true,
    used: getQuizCountInLast24Hours(profile),
    limit: null,
    message: "Free quizzes require an ad unlock before each quiz.",
  };
}

export function getLastQuizForBook(profile: Profile, bookTitle: string) {
  const normalizedTitle = bookTitle.trim().toLowerCase();
  const matching = profile.quizzes
    .filter((quiz) => quiz.bookTitle.trim().toLowerCase() === normalizedTitle)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return matching.length ? new Date(matching[0].date) : null;
}

export function canRetakeBook(profile: Profile, bookTitle: string) {
  const lastQuiz = getLastQuizEntry(profile, bookTitle);
  if (!lastQuiz) return true;

  const mastered = lastQuiz.score === lastQuiz.maxScore;
  if (mastered) {
    if (getNextAllowedDifficulty(lastQuiz.difficulty, lastQuiz.bookLevel) !== null) {
      return true;
    }
    const lastDate = new Date(lastQuiz.date);
    const ageMs = Date.now() - lastDate.getTime();
    return ageMs >= 24 * 60 * 60 * 1000;
  }

  return true;
}

export function getQuizAvailability(profile: Profile, bookTitle: string, difficulty: string) {
  const lastSameDifficulty = getLastQuizEntryForDifficulty(profile, bookTitle, difficulty);
  if (!lastSameDifficulty) {
    return { available: true, message: "", forFunOnly: false };
  }

  const mastered = lastSameDifficulty.score === lastSameDifficulty.maxScore;
  if (!mastered) {
    return {
      available: true,
      message: `You can retake this ${difficulty} quiz to earn up to ${lastSameDifficulty.maxScore - lastSameDifficulty.score} missing points.`,
      forFunOnly: false,
    };
  }

  const lastDate = new Date(lastSameDifficulty.date);
  const ageMs = Date.now() - lastDate.getTime();
  const available = ageMs >= 24 * 60 * 60 * 1000;

  return {
    available,
    message: available
      ? `You already mastered this ${difficulty} quiz, so this retake is just for fun.`
      : `You already mastered this ${difficulty} quiz. Fun retakes are available once per day.`,
    forFunOnly: true,
  };
}

export function getPotentialEarnedPoints(
  profile: Profile,
  score: number,
  maxScore: number,
  details: {
    bookTitle: string;
    difficulty: string;
  },
) {
  const normalizedTitle = details.bookTitle.trim().toLowerCase();
  const previousBest = profile.quizzes
    .filter(
      (quiz) =>
        quiz.bookTitle.trim().toLowerCase() === normalizedTitle &&
        quiz.difficulty === details.difficulty,
    )
    .reduce((best, quiz) => Math.max(best, quiz.score), 0);

  return Math.max(0, Math.min(score, maxScore - previousBest));
}

export function getLifetimePoints(profile: Profile) {
  return profile.lifetimePoints ?? profile.quizzes.reduce(
    (total, quiz) => total + (quiz.earnedPoints ?? quiz.score),
    0,
  );
}

export function getSpentPoints(profile: Profile) {
  return profile.prizeRedemptions?.reduce((total, redemption) => total + redemption.pointsSpent, 0) ?? 0;
}

export function getSpendablePoints(profile: Profile) {
  return profile.points ?? Math.max(0, getLifetimePoints(profile) - getSpentPoints(profile));
}

export function getPointTimeline(profile: Profile) {
  const events = [
    ...profile.quizzes.map((quiz) => ({
      date: quiz.date,
      earned: quiz.earnedPoints ?? quiz.score,
      spent: 0,
    })),
    ...(profile.prizeRedemptions ?? []).map((redemption) => ({
      date: redemption.date,
      earned: 0,
      spent: redemption.pointsSpent,
    })),
    ...(profile.readingLogs ?? []).map((log) => ({
      date: log.date,
      earned: log.effortPoints,
      spent: 0,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let earned = 0;
  let spent = 0;

  return events.map((event, index) => {
    earned += event.earned;
    spent += event.spent;

    return {
      eventNumber: index + 1,
      date: new Date(event.date).toLocaleDateString(),
      earned,
      spent,
      available: Math.max(0, earned - spent),
    };
  });
}

export function getEffortPoints(profile: Profile) {
  return profile.readingLogs?.reduce((total, log) => total + log.effortPoints, 0) ?? 0;
}

export function getWeeklyEffort(profile: Profile) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return profile.readingLogs
    ?.filter((log) => new Date(log.date).getTime() >= weekAgo)
    .reduce((total, log) => total + log.effortPoints, 0) ?? 0;
}

export function getForgivingStreak(profile: Profile) {
  const readingDays = new Set(
    (profile.readingLogs ?? []).map((log) => new Date(log.date).toDateString()),
  );
  const today = new Date();
  let activeDaysThisWeek = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    if (readingDays.has(date.toDateString())) {
      activeDaysThisWeek += 1;
    }
  }

  return {
    activeDaysThisWeek,
    goalDays: 4,
    metThisWeek: activeDaysThisWeek >= 4,
  };
}

export function getImprovementScore(profile: Profile) {
  const byBook = new Map<string, QuizHistory[]>();
  for (const quiz of profile.quizzes) {
    const key = `${quiz.bookTitle.trim().toLowerCase()}-${quiz.difficulty}`;
    byBook.set(key, [...(byBook.get(key) ?? []), quiz]);
  }

  let improvement = 0;
  byBook.forEach((quizzes) => {
    const sorted = quizzes.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (sorted.length < 2) return;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    improvement += Math.max(0, last.score - first.score);
  });

  return improvement;
}

export function getGenreExplorerScore(profile: Profile) {
  const categories = new Set<string>();
  const text = [...(profile.favoriteBooks ?? []), ...profile.quizzes.map((quiz) => quiz.bookTitle)].join(" ").toLowerCase();
  const checks: Array<[RegExp, string]> = [
    [/\b(dragon|magic|fantasy|narnia|hobbit)\b/, "fantasy"],
    [/\b(space|robot|future|alien|science)\b/, "sci-fi"],
    [/\b(mystery|secret|clue|detective)\b/, "mystery"],
    [/\b(dog|cat|mouse|horse|animal|fish)\b/, "animals"],
    [/\b(funny|diary|silly|humor)\b/, "humor"],
    [/\b(history|biography|true|science)\b/, "nonfiction"],
  ];

  for (const [pattern, category] of checks) {
    if (pattern.test(text)) {
      categories.add(category);
    }
  }

  return categories.size;
}

export function getBadges(profile: Profile) {
  const badges = new Set(profile.badges ?? []);
  if (profile.quizzes.length > 0) badges.add("Finished first quiz");
  if (profile.quizzes.some((quiz) => quiz.difficulty !== "easy")) badges.add("Tried a harder book");
  if (getGenreExplorerScore(profile) >= 3) badges.add("Genre explorer");
  if (getImprovementScore(profile) > 0) badges.add("Re-read and improved");
  if (getReviewsForProfile(profile.id).length > 0) badges.add("Helped recommend a book");
  if (getForgivingStreak(profile).metThisWeek) badges.add("Reading week complete");
  return Array.from(badges);
}

export function getLeaderboardScore(profile: Profile, kind: "lifetime" | "weeklyEffort" | "improvement" | "genreExplorer" | "streak") {
  switch (kind) {
    case "weeklyEffort":
      return getWeeklyEffort(profile);
    case "improvement":
      return getImprovementScore(profile);
    case "genreExplorer":
      return getGenreExplorerScore(profile);
    case "streak":
      return getForgivingStreak(profile).activeDaysThisWeek;
    default:
      return getLifetimePoints(profile);
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateProfileCode(name: string) {
  const prefix = name.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase().padEnd(4, "RQST");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RQ-${prefix}-${suffix}`;
}

function normalizeProfileCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "-");
}

function isExpired(request: ParentVerificationRequest) {
  return Boolean(request.expiresAt && Date.now() > new Date(request.expiresAt).getTime());
}

export function getParentVerificationRequests(): ParentVerificationRequest[] {
  const requests = readStorage<ParentVerificationRequest[]>(PARENT_REQUESTS_KEY) ?? [];
  let changed = false;
  const next = requests.map((request) => {
    if (request.status === "code_pending" && isExpired(request)) {
      changed = true;
      return { ...request, status: "expired" as const };
    }
    return request;
  });

  if (changed) {
    writeStorage(PARENT_REQUESTS_KEY, next);
  }

  return next;
}

export function saveParentVerificationRequests(requests: ParentVerificationRequest[]) {
  writeStorage(PARENT_REQUESTS_KEY, requests);
}

export function createParentVerificationRequest(
  parent: Profile,
  details: {
    childScreenName: string;
    childFirstName: string;
  },
) {
  const child = getProfiles().find(
    (profile) =>
      !profile.isParent &&
      profile.name.toLowerCase() === details.childScreenName.trim().toLowerCase(),
  );

  if (!child) {
    throw new Error("Child not found. Please enter their screen name exactly.");
  }

  const existing = getParentVerificationRequests().find(
    (request) =>
      request.parentId === parent.id &&
      request.childId === child.id &&
      ["child_pending", "code_pending", "verified"].includes(request.status),
  );

  if (existing?.status === "verified") {
    throw new Error("This child is already verified for your account.");
  }

  if (existing) {
    throw new Error("A verification request is already in progress for this child.");
  }

  const request: ParentVerificationRequest = {
    id: generateId(),
    parentId: parent.id,
    parentName: parent.realName || parent.name,
    parentEmail: parent.email,
    childId: child.id,
    childScreenName: child.name,
    childFirstName: details.childFirstName.trim(),
    status: "child_pending",
    createdAt: new Date().toISOString(),
  };

  saveParentVerificationRequests([...getParentVerificationRequests(), request]);
  return request;
}

export function childConfirmParentRequest(requestId: string) {
  const requests = getParentVerificationRequests();
  const request = requests.find((item) => item.id === requestId);
  if (!request || request.status !== "child_pending") {
    throw new Error("That verification request is no longer available.");
  }

  const updatedRequest: ParentVerificationRequest = {
    ...request,
    status: "code_pending",
    code: generateCode(),
    parentCodeEntered: false,
    childCodeEntered: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  saveParentVerificationRequests(requests.map((item) => item.id === requestId ? updatedRequest : item));
  return updatedRequest;
}

export function rejectParentVerificationRequest(requestId: string) {
  const requests = getParentVerificationRequests();
  saveParentVerificationRequests(
    requests.map((request) =>
      request.id === requestId ? { ...request, status: "rejected" as const } : request,
    ),
  );
}

export function enterParentVerificationCode(
  requestId: string,
  actor: "parent" | "child",
  code: string,
) {
  const requests = getParentVerificationRequests();
  const request = requests.find((item) => item.id === requestId);
  if (!request || request.status !== "code_pending") {
    throw new Error("That verification request is not waiting for a code.");
  }

  if (isExpired(request)) {
    const expiredRequests = requests.map((item) =>
      item.id === requestId ? { ...item, status: "expired" as const } : item,
    );
    saveParentVerificationRequests(expiredRequests);
    throw new Error("That verification code expired. Please start again.");
  }

  if (request.code !== code.trim()) {
    throw new Error("That code does not match.");
  }

  const updatedRequest: ParentVerificationRequest = {
    ...request,
    parentCodeEntered: actor === "parent" ? true : request.parentCodeEntered,
    childCodeEntered: actor === "child" ? true : request.childCodeEntered,
  };

  if (updatedRequest.parentCodeEntered && updatedRequest.childCodeEntered) {
    const profiles = getProfiles();
    const parent = profiles.find((profile) => profile.id === updatedRequest.parentId);
    const currentChildCount = parent?.linkedChildren?.length ?? 0;
    const parentTier = normalizeSubscriptionTier(parent?.subscriptionTier);
    const childLimit = subscriptionPlans[parentTier].includedChildren;

    if (currentChildCount >= childLimit) {
      throw new Error(`${subscriptionPlans[parentTier].name} includes ${childLimit} child profiles. Add an extra child seat or change plans before linking another child.`);
    }

    const nextProfiles = profiles.map((profile) => {
      if (profile.id === updatedRequest.parentId) {
        return {
          ...profile,
          linkedChildren: Array.from(new Set([...(profile.linkedChildren ?? []), updatedRequest.childId])),
        };
      }
      return profile;
    });
    saveProfiles(nextProfiles);
    updatedRequest.status = "verified";
  }

  saveParentVerificationRequests(requests.map((item) => item.id === requestId ? updatedRequest : item));
  return updatedRequest;
}

export function addFriendContact(profile: Profile, details: { name: string; email?: string; phone?: string }) {
  if (!profile.isParent && !profile.canAddFriends) {
    throw new Error("A parent needs to allow friend adding first.");
  }

  if (!details.name.trim()) {
    throw new Error("Friend name is required.");
  }

  const updated = {
    ...profile,
    friends: [
      ...(profile.friends ?? []),
      {
        id: generateId(),
        name: details.name.trim(),
        email: details.email?.trim() || undefined,
        phone: details.phone?.trim() || undefined,
        date: new Date().toISOString(),
      },
    ],
  };

  return updateProfile(updated);
}

export function ensureProfileCode(profile: Profile) {
  if (profile.profileCode) {
    return profile;
  }

  const existingCodes = new Set(getProfiles().map((item) => item.profileCode).filter(Boolean));
  let nextCode = generateProfileCode(profile.name);
  while (existingCodes.has(nextCode)) {
    nextCode = generateProfileCode(profile.name);
  }

  return updateProfile({ ...profile, profileCode: nextCode });
}

export function regenerateProfileCode(profile: Profile) {
  const existingCodes = new Set(
    getProfiles()
      .filter((item) => item.id !== profile.id)
      .map((item) => item.profileCode)
      .filter(Boolean),
  );
  let nextCode = generateProfileCode(profile.name);
  while (existingCodes.has(nextCode)) {
    nextCode = generateProfileCode(profile.name);
  }
  return updateProfile({ ...profile, profileCode: nextCode });
}

export function addFriendByProfileCode(profile: Profile, code: string) {
  if (!profile.isParent && !profile.canAddFriends) {
    throw new Error("Ask your parent to turn on code sharing first.");
  }

  const normalizedCode = normalizeProfileCode(code);
  const profiles = getProfiles();
  const currentWithCode = ensureProfileCode(profile);
  const friend = profiles.find((item) => normalizeProfileCode(item.profileCode ?? "") === normalizedCode);

  if (!friend) {
    throw new Error("No reader was found with that profile code.");
  }

  if (friend.id === profile.id) {
    throw new Error("That is your own profile code.");
  }

  if (!friend.isParent && !friend.canAddFriends) {
    throw new Error("That child profile needs parent permission before connecting.");
  }

  const friendIds = new Set(currentWithCode.friendProfileIds ?? []);
  if (friendIds.has(friend.id)) {
    throw new Error("That reader is already your friend.");
  }
  friendIds.add(friend.id);

  const friendFriendIds = new Set(friend.friendProfileIds ?? []);
  friendFriendIds.add(profile.id);

  const nextProfiles = getProfiles().map((item) => {
    if (item.id === currentWithCode.id) {
      return {
        ...currentWithCode,
        friendProfileIds: Array.from(friendIds),
        friends: [
          ...(currentWithCode.friends ?? []),
          {
            id: generateId(),
            name: friend.realName || friend.name,
            profileId: friend.id,
            profileCode: friend.profileCode,
            date: new Date().toISOString(),
          },
        ],
      };
    }

    if (item.id === friend.id) {
      return {
        ...friend,
        friendProfileIds: Array.from(friendFriendIds),
        friends: [
          ...(friend.friends ?? []),
          {
            id: generateId(),
            name: currentWithCode.realName || currentWithCode.name,
            profileId: currentWithCode.id,
            profileCode: currentWithCode.profileCode,
            date: new Date().toISOString(),
          },
        ],
      };
    }

    return item;
  });

  saveProfiles(nextProfiles);
  return nextProfiles.find((item) => item.id === currentWithCode.id) ?? currentWithCode;
}

export function getFriendProfiles(profile: Profile) {
  const friendIds = new Set([
    ...(profile.friendProfileIds ?? []),
    ...(profile.friends ?? []).map((friend) => friend.profileId).filter(Boolean) as string[],
  ]);
  return getProfiles().filter((item) => friendIds.has(item.id));
}

export function getBookCompetitionRows(profile: Profile) {
  const friends = getFriendProfiles(profile);
  return friends.flatMap((friend) => {
    const friendQuizzesByBook = new Map<string, QuizHistory>();
    friend.quizzes.forEach((quiz) => {
      const key = quiz.bookTitle.trim().toLowerCase();
      const previous = friendQuizzesByBook.get(key);
      if (!previous || quiz.score > previous.score) {
        friendQuizzesByBook.set(key, quiz);
      }
    });

    return profile.quizzes
      .filter((quiz) => friendQuizzesByBook.has(quiz.bookTitle.trim().toLowerCase()))
      .map((quiz) => {
        const friendQuiz = friendQuizzesByBook.get(quiz.bookTitle.trim().toLowerCase());
        return {
          friend,
          bookTitle: quiz.bookTitle,
          difficulty: quiz.difficulty,
          yourScore: quiz.score,
          yourMaxScore: quiz.maxScore,
          friendScore: friendQuiz?.score ?? 0,
          friendMaxScore: friendQuiz?.maxScore ?? quiz.maxScore,
        };
      });
  });
}

export function getReadingChallenges(): ReadingChallenge[] {
  return readStorage<ReadingChallenge[]>(READING_CHALLENGES_KEY) ?? [];
}

export function saveReadingChallenges(challenges: ReadingChallenge[]) {
  writeStorage(READING_CHALLENGES_KEY, challenges);
}

export function createReadingChallenge(details: {
  bookTitle: string;
  difficulty: string;
  bookLevel: string;
  quizTitle: string;
  quizDescription: string;
  questions: ChallengeQuizQuestion[];
  fromProfile: Profile;
  toProfileId: string;
  initiatorScore: number;
  initiatorMaxScore: number;
  initiatorAnswers: number[];
}) {
  const friend = getProfiles().find((profile) => profile.id === details.toProfileId);
  if (!friend) {
    throw new Error("Challenge friend was not found.");
  }

  const challenge: ReadingChallenge = {
    id: generateId(),
    bookTitle: details.bookTitle,
    difficulty: details.difficulty,
    bookLevel: details.bookLevel,
    quizTitle: details.quizTitle,
    quizDescription: details.quizDescription,
    questions: details.questions,
    fromProfileId: details.fromProfile.id,
    fromName: details.fromProfile.realName || details.fromProfile.name,
    toProfileId: friend.id,
    toName: friend.realName || friend.name,
    initiatorScore: details.initiatorScore,
    initiatorMaxScore: details.initiatorMaxScore,
    initiatorAnswers: details.initiatorAnswers,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  saveReadingChallenges([challenge, ...getReadingChallenges()]);
  return challenge;
}

export function completeReadingChallenge(
  challengeId: string,
  details: {
    responderScore: number;
    responderMaxScore: number;
    responderAnswers: number[];
  },
) {
  const challenges = getReadingChallenges();
  const next = challenges.map((challenge) =>
    challenge.id === challengeId
      ? {
          ...challenge,
          responderScore: details.responderScore,
          responderMaxScore: details.responderMaxScore,
          responderAnswers: details.responderAnswers,
          status: "completed" as const,
          completedAt: new Date().toISOString(),
        }
      : challenge,
  );
  saveReadingChallenges(next);
  return next.find((challenge) => challenge.id === challengeId) ?? null;
}

export function verifyProfile(name: string, password: string): Profile | null {
  const profile = getProfiles().find((item) => {
    const identifier = item.isParent ? item.email ?? "" : item.name;
    return identifier.toLowerCase() === name.trim().toLowerCase() && item.password === password;
  });
  return profile ?? null;
}

export function createProfile(name: string, password: string, isParent = false, email?: string): Profile {
  const trimmedName = name.trim();
  if (!trimmedName || !password.trim()) {
    throw new Error("Please enter both a name and password.");
  }

  if (isParent && !email?.trim()) {
    throw new Error("Email is required for parent accounts.");
  }

  const existing = getProfiles().find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
  if (existing) {
    throw new Error("A profile with this name already exists.");
  }

  if (isParent) {
    const existingEmail = getProfiles().find((item) => item.email === email);
    if (existingEmail) {
      throw new Error("A profile with this email already exists.");
    }
  }

  const profile: Profile = {
    id: generateId(),
    name: trimmedName,
    password: password.trim(),
    realName: isParent ? trimmedName : undefined,
    points: 0,
    lifetimePoints: 0,
    prizeRedemptions: [],
    quizzes: [],
    favoriteBooks: [],
    readingPreferences: undefined,
    readingNow: [],
    readingLogs: [],
    bookAccess: {},
    avatarStyle: isParent ? "Library Hero" : "Explorer",
    badges: [],
    parentControls: defaultParentControls,
    leaderboardPrivate: false,
    subscriptionTier: "free",
    isParent,
    email: isParent ? email : undefined,
    verified: !isParent, // children are auto-verified, parents need email verification
    linkedChildren: [],
    canAddFriends: isParent,
    profileCode: generateProfileCode(trimmedName),
    friendProfileIds: [],
    friends: [],
  };

  const profiles = getProfiles();
  saveProfiles([...profiles, profile]);
  setCurrentUserId(profile.id);
  return profile;
}

export function updateProfile(updated: Profile): Profile {
  const profiles = getProfiles();
  const next = profiles.map((profile) => (profile.id === updated.id ? updated : profile));
  saveProfiles(next);
  return updated;
}

export function addQuizResult(
  score: number,
  maxScore: number,
  details: {
    bookTitle: string;
    difficulty: string;
    bookLevel: string;
    learningGoal: string;
  },
): Profile | null {
  const current = getCurrentProfile();
  if (!current) {
    return null;
  }

  const earnedPoints = getPotentialEarnedPoints(current, score, maxScore, details);

  const quizEntry: QuizHistory = {
    bookTitle: details.bookTitle,
    date: new Date().toISOString(),
    score,
    maxScore,
    earnedPoints,
    difficulty: details.difficulty,
    bookLevel: details.bookLevel,
    learningGoal: details.learningGoal,
  };

  const updated: Profile = {
    ...current,
    points: getSpendablePoints(current) + earnedPoints,
    lifetimePoints: getLifetimePoints(current) + earnedPoints,
    prizeRedemptions: current.prizeRedemptions ?? [],
    quizzes: [...current.quizzes, quizEntry],
  };
  updated.badges = getBadges(updated);

  return updateProfile(updated);
}

export function saveReadingNow(profile: Profile, books: string[]) {
  const nextBooks = books.map((book) => book.trim()).filter(Boolean).slice(0, 6);
  return updateProfile({
    ...profile,
    readingNow: nextBooks,
  });
}

export function saveBookAccess(profile: Profile, bookTitle: string, accessType: BookAccessType) {
  const title = bookTitle.trim();
  if (!title) return profile;
  return updateProfile({
    ...profile,
    bookAccess: {
      ...(profile.bookAccess ?? {}),
      [title]: accessType,
    },
  });
}

export function addReadingLog(details: {
  bookTitle: string;
  minutes: number;
  chaptersFinished: number;
  accessType: BookAccessType;
  assisted: boolean;
}): Profile | null {
  const current = getCurrentProfile();
  if (!current) return null;

  const minutes = Math.max(0, Math.min(240, Math.round(details.minutes)));
  const chaptersFinished = Math.max(0, Math.min(20, Math.round(details.chaptersFinished)));
  const effortPoints = Math.min(20, Math.floor(minutes / 10) + chaptersFinished * 2 + (details.assisted ? 1 : 0));

  const log: ReadingLog = {
    id: generateId(),
    bookTitle: details.bookTitle.trim(),
    date: new Date().toISOString(),
    minutes,
    chaptersFinished,
    accessType: details.accessType,
    assisted: details.assisted,
    effortPoints,
  };

  const updated: Profile = {
    ...current,
    readingNow: Array.from(new Set([...(current.readingNow ?? []), log.bookTitle])).slice(0, 6),
    bookAccess: {
      ...(current.bookAccess ?? {}),
      [log.bookTitle]: log.accessType,
    },
    readingLogs: [...(current.readingLogs ?? []), log],
    points: getSpendablePoints(current) + effortPoints,
    lifetimePoints: getLifetimePoints(current) + effortPoints,
  };
  updated.badges = getBadges(updated);

  return updateProfile(updated);
}

export function redeemPrize(details: {
  prizeId: string;
  prizeName: string;
  pointsSpent: number;
}): Profile | null {
  const current = getCurrentProfile();
  if (!current) {
    return null;
  }

  const spendablePoints = getSpendablePoints(current);
  if (spendablePoints < details.pointsSpent) {
    throw new Error("Not enough points available for that prize.");
  }

  const updated: Profile = {
    ...current,
    points: spendablePoints - details.pointsSpent,
    lifetimePoints: getLifetimePoints(current),
    prizeRedemptions: [
      ...(current.prizeRedemptions ?? []),
      {
        id: generateId(),
        prizeId: details.prizeId,
        prizeName: details.prizeName,
        pointsSpent: details.pointsSpent,
        date: new Date().toISOString(),
      },
    ],
  };

  return updateProfile(updated);
}

export function getReviews(): Review[] {
  return readStorage<Review[]>("readingQuestReviews") ?? [];
}

export function addReview(review: Omit<Review, "id" | "date">): Review {
  const reviews = getReviews();
  const next: Review = {
    ...review,
    id: generateId(),
    date: new Date().toISOString(),
  };
  writeStorage("readingQuestReviews", [...reviews, next]);
  return next;
}

export function getReviewsForBook(bookTitle: string): Review[] {
  const normalized = bookTitle.trim().toLowerCase();
  return getReviews().filter(
    (review) => review.bookTitle.trim().toLowerCase() === normalized,
  );
}

export function getReviewsForProfile(profileId: string): Review[] {
  return getReviews().filter((review) => review.profileId === profileId);
}

export function getQuizIssueReports(): QuizIssueReport[] {
  return readStorage<QuizIssueReport[]>("readingQuestQuizIssueReports") ?? [];
}

export function addQuizIssueReport(report: Omit<QuizIssueReport, "id" | "date">): QuizIssueReport {
  const reports = getQuizIssueReports();
  const next: QuizIssueReport = {
    ...report,
    id: generateId(),
    status: report.status ?? "open",
    date: new Date().toISOString(),
  };
  writeStorage("readingQuestQuizIssueReports", [...reports, next]);
  return next;
}

export function updateQuizIssueReport(
  reportId: string,
  updates: { status: "open" | "accepted" | "dismissed"; parentNote?: string },
) {
  const reports = getQuizIssueReports();
  const next = reports.map((report) =>
    report.id === reportId
      ? { ...report, status: updates.status, parentNote: updates.parentNote ?? report.parentNote }
      : report,
  );
  writeStorage("readingQuestQuizIssueReports", next);
  return next.find((report) => report.id === reportId) ?? null;
}

