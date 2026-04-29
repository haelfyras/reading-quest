export type QuizHistory = {
  bookTitle: string;
  date: string;
  score: number;
  maxScore: number;
  difficulty: string;
  bookLevel: string;
  learningGoal: string;
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

export type Profile = {
  id: string;
  name: string;
  password: string;
  points: number;
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

export type RetakeStatus = {
  nextDifficulty: Difficulty | null;
  available: boolean;
  waitText: string;
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

  return getNextDifficulty(lastQuiz.difficulty);
}

export function getRetakeStatus(profile: Profile, bookTitle: string): RetakeStatus {
  const lastQuiz = getLastQuizEntry(profile, bookTitle);
  if (!lastQuiz) {
    return { nextDifficulty: "easy", available: true, waitText: "Retake" };
  }

  const mastered = lastQuiz.score === lastQuiz.maxScore;
  const nextDifficulty = mastered ? getNextDifficulty(lastQuiz.difficulty) : (lastQuiz.difficulty as Difficulty);

  if (mastered) {
    if (nextDifficulty) {
      return { nextDifficulty, available: true, waitText: `Retake @ ${nextDifficulty}` };
    }
    return { nextDifficulty: null, available: false, waitText: "No retake available" };
  }

  const lastDate = new Date(lastQuiz.date);
  const ageMs = Date.now() - lastDate.getTime();
  const isReady = ageMs >= 24 * 60 * 60 * 1000;

  return {
    nextDifficulty,
    available: isReady,
    waitText: isReady ? "Retake" : "24hr wait",
  };
}

const STORAGE_KEY = "readingQuestProfiles";
const CURRENT_USER_KEY = "readingQuestCurrentUserId";

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
    quizzes: [],
    favoriteBooks: [],
    isParent: false,
    verified: true,
    linkedChildren: [],
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
    return getNextDifficulty(lastQuiz.difficulty) !== null;
  }

  const lastDate = new Date(lastQuiz.date);
  const ageMs = Date.now() - lastDate.getTime();
  return ageMs >= 24 * 60 * 60 * 1000;
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    points: 0,
    quizzes: [],
    favoriteBooks: [],
    isParent,
    email: isParent ? email : undefined,
    verified: !isParent, // children are auto-verified, parents need email verification
    linkedChildren: [],
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

  const updated: Profile = {
    ...current,
    points: current.points + score,
    quizzes: [
      ...current.quizzes,
      {
        bookTitle: details.bookTitle,
        date: new Date().toISOString(),
        score,
        maxScore,
        difficulty: details.difficulty,
        bookLevel: details.bookLevel,
        learningGoal: details.learningGoal,
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

