import type { QuestionType } from "./quizQuestionTypes";

export type QuizHistory = {
  bookTitle: string;
  date: string;
  score: number;
  maxScore: number;
  earnedPoints?: number;
  difficulty: string;
  bookLevel: string;
  bookDifficultyScore?: number;
  bookDifficultyRatingId?: string;
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
  poolQuestionId?: string;
  questionValue?: number;
  correctionPointsAwarded?: boolean;
  correctionPoints?: number;
  reason: "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book";
  status?: "open" | "accepted" | "dismissed";
  parentNote?: string;
  date: string;
};

export type ChallengeQuizQuestion = {
  question: string;
  questionKey?: string;
  questionType?: QuestionType;
  choices: string[];
  answerIndex: number;
  answerText?: string;
  explanation?: string;
  qualityScore?: number;
  questionVersion?: number;
  poolQuestionId?: string;
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
  childFirstName?: string;
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
  testAccountAt?: string;
};

export type SubscriptionTier = "free" | "ad_free" | "plus";

export type ReadingPath = "explorer" | "genre_adventurer" | "skill_builder";

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
  readingPath?: ReadingPath;
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
  linkedChildren?: string[];
};

export const difficultyLevels = ["easy", "medium", "hard"] as const;
export type Difficulty = typeof difficultyLevels[number];
