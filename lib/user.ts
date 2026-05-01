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
  reason: "impossible" | "wrong_answer";
  date: string;
};

export type FriendContact = {
  id: string;
  name: string;
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

export type Profile = {
  id: string;
  name: string;
  password: string;
  realName?: string;
  phone?: string;
  friends?: FriendContact[];
  canAddFriends?: boolean;
  points: number;
  lifetimePoints?: number;
  prizeRedemptions?: PrizeRedemption[];
  quizzes: QuizHistory[];
  learningGoal?: string;
  favoriteBooks?: string[];
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
    isParent: false,
    verified: true,
    linkedChildren: [],
    canAddFriends: false,
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

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
    isParent,
    email: isParent ? email : undefined,
    verified: !isParent, // children are auto-verified, parents need email verification
    linkedChildren: [],
    canAddFriends: isParent,
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

  const updated: Profile = {
    ...current,
    points: getSpendablePoints(current) + earnedPoints,
    lifetimePoints: getLifetimePoints(current) + earnedPoints,
    prizeRedemptions: current.prizeRedemptions ?? [],
    quizzes: [
      ...current.quizzes,
      {
        bookTitle: details.bookTitle,
        date: new Date().toISOString(),
        score,
        maxScore,
        earnedPoints,
        difficulty: details.difficulty,
        bookLevel: details.bookLevel,
        learningGoal: details.learningGoal,
      },
    ],
  };

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
    date: new Date().toISOString(),
  };
  writeStorage("readingQuestQuizIssueReports", [...reports, next]);
  return next;
}

