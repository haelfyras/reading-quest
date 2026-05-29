"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import HeroProfileActions from "../components/HeroProfileActions";
import {
  addQuizResult,
  addQuizIssueReport,
  addReview,
  awardQuizIssueReportPoints,
  completeReadingChallenge,
  createReadingChallenge,
  defaultParentControls,
  getCurrentProfile,
  getLastQuizEntry,
  getPotentialEarnedPoints,
  getPlanQuizAvailability,
  getQuizAvailability,
  getReadingChallenges,
  ReadingChallenge,
  getSpendablePoints,
  difficultyLevels,
  Profile,
} from "../../lib/user";
import { getBookRecommendations } from "../../lib/recommendations";
import type { BookMatch } from "../../lib/books";
import type { QuestionType } from "../../lib/quizQuestionTypes";
import { detectBookLevel as detectBookLevelFromApi, lookupBook as lookupBookFromApi, type BookLookupPayload } from "../../lib/bookClient";
import { getDifficultyIndexRange } from "../../lib/bookDifficulty";
import { getEncouragementMessage } from "../../lib/quizFeedback";
import {
  getBasePoints,
  getAllowedDifficulties,
  getMaxScore,
  getNextAllowedDifficulty,
  getQuestionValue,
  isBookLevel,
  isDifficultyAllowedForBookLevel,
  type BookLevel,
} from "../../lib/scoring";

type QuizQuestion = {
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

type QuizData = {
  quizTitle: string;
  quizDescription: string;
  questions: QuizQuestion[];
};

type ParentApprovedQuiz = QuizData & {
  bookTitle?: string;
  difficulty?: string;
  bookLevel?: string;
  learningGoal?: string;
  pointEstimate?: number;
};

type QuizIssueReason = "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book";

function formatBookLevel(level: BookLevel) {
  if (level === "beginner") return "Beginner";
  if (level === "advanced") return "Advanced";
  return "Intermediate";
}

function getQuizDifficultyLabel(level: typeof difficultyLevels[number]) {
  if (level === "easy") return "Wanderer (Easy)";
  if (level === "medium") return "Adventurer (Medium)";
  return "QuestMaster (Hard)";
}

function getQuestionCategory(questionType?: QuestionType) {
  if (!questionType) return "Story Recall";
  if (["character", "setting", "object", "plot_event"].includes(questionType)) return "Story Recall";
  if (["cause_effect", "problem_solution", "prediction_inference"].includes(questionType)) return "Detective Question";
  if (["simple_motive", "character_motivation", "relationship", "character_arc"].includes(questionType)) return "Character Insight";
  if (["theme", "symbolism", "moral_analysis", "tone_author_intent"].includes(questionType)) return "Theme Question";
  return "Lore Question";
}

const correctPraise = ["Brilliant!", "Great questing!", "Excellent reading!"];
const retryPraise = ["Not quite, but keep going.", "Good try. Look for the clue.", "Almost there. The story can help."];

const quizIssueOptions: Array<{ value: QuizIssueReason; label: string }> = [
  { value: "impossible", label: "Impossible to answer" },
  { value: "wrong_answer", label: "Answer was wrong" },
  { value: "too_hard", label: "Too hard for this quiz level" },
  { value: "spoiler", label: "Spoiler or unfair detail" },
  { value: "not_from_book", label: "Not from this book" },
];

function getProfileTestingGoal(profile: Profile | null, approvedQuiz?: ParentApprovedQuiz | null) {
  if (approvedQuiz?.learningGoal) {
    return approvedQuiz.learningGoal;
  }

  if (!profile) {
    return "basic_recollection";
  }

  if (!profile.isParent) {
    return { ...defaultParentControls, ...(profile.parentControls ?? {}) }.testingLevel;
  }

  return profile.learningGoal || "basic_recollection";
}

function QuizPageContent() {
  const [user, setUser] = useState<Profile | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [confirmedBook, setConfirmedBook] = useState<BookMatch | null>(null);
  const [bookOptions, setBookOptions] = useState<BookMatch[]>([]);
  const [isbn, setIsbn] = useState("");
  const [publicationYear, setPublicationYear] = useState("");
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [isCheckingBook, setIsCheckingBook] = useState(false);
  const [bookLookupMessage, setBookLookupMessage] = useState("");
  const [showIsbnFallback, setShowIsbnFallback] = useState(false);
  const [difficulty, setDifficulty] = useState<typeof difficultyLevels[number]>("easy");
  const [bookLevel, setBookLevel] = useState<BookLevel | null>(null);
  const [bookDifficultyIndex, setBookDifficultyIndex] = useState<number | null>(null);
  const [bookDifficultyRatingId, setBookDifficultyRatingId] = useState<string | null>(null);
  const [bookDifficultyCanonicalKey, setBookDifficultyCanonicalKey] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFillingQuiz, setIsFillingQuiz] = useState(false);
  const [isWaitingForQuestion, setIsWaitingForQuestion] = useState(false);
  const [quizTargetCount, setQuizTargetCount] = useState(0);
  const [firstQuestionLoadMs, setFirstQuestionLoadMs] = useState<number | null>(null);
  const [isFirstReaderForBook, setIsFirstReaderForBook] = useState(false);
  const [quizGenerationStatus, setQuizGenerationStatus] = useState("");
  const [startCountdown, setStartCountdown] = useState<number | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [isDetectingLevel, setIsDetectingLevel] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [parentApprovedQuiz, setParentApprovedQuiz] = useState<ParentApprovedQuiz | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [focusLost, setFocusLost] = useState(false);
  const [reportedQuestions, setReportedQuestions] = useState<Record<string, string>>({});
  const [activeChallenge, setActiveChallenge] = useState<ReadingChallenge | null>(null);
  const [challengeSavedMessage, setChallengeSavedMessage] = useState("");
  const [adUnlocked, setAdUnlocked] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewWordCount = reviewText.trim().split(/\s+/).filter(Boolean).length;
  const isFriendlyChallenge = searchParams?.get("challenge") === "true";
  const challengeId = searchParams?.get("challengeId") || "";
  const challengeFriendId = searchParams?.get("friendId") || "";
  const challengeFriendName = searchParams?.get("friendName") || "a friend";

  useEffect(() => {
    const currentProfile = getCurrentProfile();
    setUser(currentProfile);

    const challengeIdParam = searchParams?.get("challengeId") || "";
    if (challengeIdParam) {
      const challenge = getReadingChallenges().find((item) => item.id === challengeIdParam);
      if (!challenge) {
        setError("That challenge could not be found.");
        return;
      }
      if (currentProfile && challenge.toProfileId !== currentProfile.id) {
        setError("This challenge was sent to another reader.");
        return;
      }

      setActiveChallenge(challenge);
      setBookTitle(challenge.bookTitle);
      setConfirmedBook({
        id: challenge.bookTitle,
        title: challenge.bookTitle,
        author: "Friend challenge",
      });
      const challengeLevel = isBookLevel(challenge.bookLevel) ? challenge.bookLevel : "intermediate";
      setBookDifficultyIndex(null);
      const challengeDifficulty = difficultyLevels.includes(challenge.difficulty as typeof difficultyLevels[number])
        ? challenge.difficulty as typeof difficultyLevels[number]
        : "easy";
      setBookLevel(challengeLevel);
      setDifficulty(isDifficultyAllowedForBookLevel(challengeDifficulty, challengeLevel) ? challengeDifficulty : getAllowedDifficulties(challengeLevel)[0]);
      setQuizData({
        quizTitle: challenge.quizTitle,
        quizDescription: challenge.quizDescription,
        questions: challenge.questions,
      });
      setQuizTargetCount(challenge.questions.length);
      setSelectedAnswers(Array(challenge.questions.length).fill(-1));
      setCurrentQuestion(0);
      setSelectedChoice(null);
      setScore(0);
      setCompleted(false);
      setSaved(false);
      setEarnedPoints(0);
      setChallengeSavedMessage("");
      setTimeLeft(30);
      setTimerActive(false);
      setQuizStarted(false);
      setStartCountdown(3);
      return;
    }

    const fromParent = searchParams?.get("fromParent") === "true";
    if (fromParent) {
      const approvedQuizStr = localStorage.getItem("approvedQuiz");
      if (approvedQuizStr) {
        try {
          const approvedQuiz = JSON.parse(approvedQuizStr) as ParentApprovedQuiz;
          const approvedTitle = approvedQuiz.bookTitle || "";
          setBookTitle(approvedTitle);
          if (approvedTitle) {
            setConfirmedBook({
              id: approvedTitle,
              title: approvedTitle,
              author: "Parent approved",
            });
          }
          const approvedLevel = isBookLevel(approvedQuiz.bookLevel || "") ? approvedQuiz.bookLevel as BookLevel : "intermediate";
          const approvedDifficulty = difficultyLevels.includes(approvedQuiz.difficulty as typeof difficultyLevels[number])
            ? approvedQuiz.difficulty as typeof difficultyLevels[number]
            : "easy";
          setBookLevel(approvedLevel);
          setDifficulty(isDifficultyAllowedForBookLevel(approvedDifficulty, approvedLevel) ? approvedDifficulty : getAllowedDifficulties(approvedLevel)[0]);
          setQuizData(approvedQuiz);
          setQuizTargetCount(approvedQuiz.questions.length);
          setSelectedAnswers([]);
          setParentApprovedQuiz(approvedQuiz);
          setTimeLeft(30);
          setTimerActive(false);
          setQuizStarted(false);
          setStartCountdown(3);
          localStorage.removeItem("approvedQuiz");
          return;
        } catch {
          setError("Failed to load approved quiz.");
        }
      }
    }

    if (searchParams) {
      const bookTitleParam = searchParams.get("bookTitle") || "";
      const difficultyParam = searchParams.get("difficulty") || "easy";
      const bookLevelParam = searchParams.get("bookLevel") || "";
      const parsedBookLevel = isBookLevel(bookLevelParam) ? bookLevelParam : null;
      const parsedDifficulty = difficultyLevels.includes(difficultyParam as typeof difficultyLevels[number])
        ? difficultyParam as typeof difficultyLevels[number]
        : "easy";

      if (bookTitleParam.trim()) {
        setBookTitle(bookTitleParam);
        setConfirmedBook({
          id: bookTitleParam,
          title: bookTitleParam,
          author: "Saved quiz history",
        });
      }
      if (parsedBookLevel) {
        setBookLevel(parsedBookLevel);
        setBookDifficultyIndex(null);
      }
      setDifficulty(isDifficultyAllowedForBookLevel(parsedDifficulty, parsedBookLevel) ? parsedDifficulty : getAllowedDifficulties(parsedBookLevel)[0]);
      if (bookLevelParam.trim() && !parsedBookLevel) {
        setBookLevel(null);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && timeLeft > 0 && !completed) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      handleChoice(-1);
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft, completed]);

  useEffect(() => {
    if (startCountdown === null) return;

    if (startCountdown <= 0) {
      setQuizStarted(true);
      setStartCountdown(null);
      setTimerActive(true);
      setTimeLeft(30);
      return;
    }

    const timer = window.setTimeout(() => {
      setStartCountdown((current) => current === null ? null : current - 1);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [startCountdown]);

  useEffect(() => {
    const handleFocus = () => setFocusLost(false);
    const handleBlur = () => setFocusLost(true);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!isWaitingForQuestion || !quizData) return;
    if (currentQuestion + 1 < quizData.questions.length) {
      setCurrentQuestion((prev) => prev + 1);
      setSelectedChoice(null);
      setTimeLeft(30);
      setTimerActive(true);
      setIsWaitingForQuestion(false);
    }
  }, [currentQuestion, isWaitingForQuestion, quizData]);

  const allowedDifficulties = getAllowedDifficulties(bookLevel);
  const nextAllowedDifficulty = getNextAllowedDifficulty(difficulty, bookLevel);
  const questionValue = getQuestionValue(difficulty);
  const basePoints = getBasePoints(difficulty);
  const maxScore = quizData ? getMaxScore(difficulty) : 0;
  const quizDisplayTotal = quizData ? (quizTargetCount || quizData.questions.length) : 0;
  const timerClass = timeLeft > 10 ? "good" : timeLeft > 5 ? "warn" : "danger";
  const homeHref = user?.isParent ? "/parent" : "/home";
  const planQuizAvailability = user ? getPlanQuizAvailability(user) : null;
  const loadingSuggestion = user ? getBookRecommendations({ profile: user, limit: 1 }).suggestions[0] : "";
  const encouragementMessage = quizData ? getEncouragementMessage(score, maxScore, bookTitle) : "";
  const currentCorrectStreak = quizData ? (() => {
    let streak = 0;
    for (let index = currentQuestion - 1; index >= 0; index -= 1) {
      if (selectedAnswers[index] === quizData.questions[index]?.answerIndex) {
        streak += 1;
      } else {
        break;
      }
    }
    return streak;
  })() : 0;

  const checkFirstReaderStatus = async (book: BookMatch) => {
    if (!bookDifficultyCanonicalKey) return false;
    try {
      const params = new URLSearchParams({
        canonicalKey: bookDifficultyCanonicalKey,
        bookTitle: book.title,
        author: book.author,
        isbn: book.isbn ?? "",
      });
      const response = await fetch(`/api/book-quiz-status?${params.toString()}`);
      if (!response.ok) return false;
      const data = await response.json() as { firstReader?: boolean; certain?: boolean };
      return Boolean(data.certain && data.firstReader);
    } catch {
      return false;
    }
  };

  const detectReadingLevel = async (book: BookMatch) => {
    setError("");
    setIsDetectingLevel(true);

    try {
      const rating = await detectBookLevelFromApi(book);
      const level = rating.level;
      setBookLevel(level);
      setBookDifficultyIndex(rating.difficultyIndex);
      setBookDifficultyRatingId(rating.ratingId ?? null);
      setBookDifficultyCanonicalKey(rating.canonicalKey ?? null);
      if (!isDifficultyAllowedForBookLevel(difficulty, level)) {
        setDifficulty(getAllowedDifficulties(level)[0]);
      }
      return level;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect book level.");
      return null;
    } finally {
      setIsDetectingLevel(false);
    }
  };

  const applyConfirmedBook = (book: BookMatch) => {
    setConfirmedBook(book);
    setBookTitle(book.title);
    setBookAuthor(book.author === "Unknown author" ? "" : book.author);
    setIsbn(book.isbn ?? "");
    setPublicationYear(book.year ? String(book.year) : "");
    setBookLevel(null);
    setBookDifficultyIndex(null);
    setBookDifficultyRatingId(null);
    setBookDifficultyCanonicalKey(null);
    setBookOptions([]);
    setBookLookupMessage("");
    setShowIsbnFallback(false);
    void detectReadingLevel(book);
  };

  const resetBookLookupState = () => {
    setConfirmedBook(null);
    setBookLevel(null);
    setBookDifficultyIndex(null);
    setBookDifficultyRatingId(null);
    setBookDifficultyCanonicalKey(null);
    setBookOptions([]);
    setBookLookupMessage("");
    setShowIsbnFallback(false);
  };

  const getBookLookupPayload = (): BookLookupPayload | null => {
    const payload = {
      bookTitle: bookTitle.trim(),
      author: bookAuthor.trim(),
      isbn: showAdvancedSearch ? isbn.trim() : "",
      year: showAdvancedSearch ? publicationYear.trim() : "",
    };
    if (!payload.bookTitle && !payload.author && !payload.isbn && !payload.year) {
      return null;
    }
    return payload;
  };

  const lookupBook = async (payload: BookLookupPayload) => {
    setIsCheckingBook(true);
    setError("");
    setBookLookupMessage("");

    try {
      const data = await lookupBookFromApi(payload);
      const firstBook = data.books[0];
      if ((data.status === "exact" || data.status === "options") && data.books.length > 0) {
        setConfirmedBook(null);
        setBookOptions(data.books);
        setShowIsbnFallback(false);
        setBookLookupMessage(data.status === "exact" && firstBook ? "Please confirm this is the book you want." : "We found a few possible matches. Which book did you mean?");
        return null;
      }

      setConfirmedBook(null);
      setBookOptions([]);
      setShowIsbnFallback(!payload.isbn);
      if (!payload.isbn) setShowAdvancedSearch(true);
      setBookLookupMessage(
        payload.isbn
          ? "Sorry, we still could not find that book. Please try another book title."
          : "We could not find that book from the title or author. Not seeing it? Try Advanced Search with an ISBN or publication year.",
      );
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to look up book.");
      return null;
    } finally {
      setIsCheckingBook(false);
    }
  };

  const handleCheckBook = () => {
    const payload = getBookLookupPayload();
    if (!payload) {
      setError("Enter a title or author to search. You can also open Advanced Search for ISBN or publication year.");
      return;
    }
    lookupBook(payload);
  };

  const ensureBookConfirmed = async () => {
    if (confirmedBook && confirmedBook.title === bookTitle.trim()) {
      return confirmedBook;
    }
    const payload = getBookLookupPayload();
    return payload ? lookupBook(payload) : null;
  };

  const readQuizPayload = async (response: Response): Promise<QuizData> => {
    if (!response.ok) {
      const rawMessage = await response.text();
      let message = rawMessage;
      try {
        const parsed = JSON.parse(rawMessage) as { error?: string };
        message = parsed.error || rawMessage;
      } catch {
        message = rawMessage;
      }
      throw new Error(message || "Failed to generate quiz.");
    }

    const data = await response.json();
    let payload: QuizData;

    if (typeof data.quiz === "object" && data.quiz !== null) {
      payload = data.quiz;
    } else if (typeof data.quiz === "string") {
      const rawQuiz = data.quiz.trim();

      try {
        payload = JSON.parse(rawQuiz);
      } catch {
        const jsonMatch = rawQuiz.match(/\{[\s\S]*\}$/);
        if (!jsonMatch) {
          throw new Error("Quiz format is invalid. Please try again.");
        }
        payload = JSON.parse(jsonMatch[0]);
      }
    } else {
      throw new Error("Quiz format is invalid. Please try again.");
    }

    if (!Array.isArray(payload.questions) || payload.questions.length === 0) {
      throw new Error("Quiz format is invalid. Please try again.");
    }

    return payload;
  };

  const fetchQuizBatch = async (details: {
    book: BookMatch;
    resolvedBookLevel: BookLevel;
    learningGoal: string;
    mode: "procedural_starter" | "procedural_next";
    existingQuestions: QuizQuestion[];
  }) => {
    const response = await fetch("/api/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: details.mode,
        bookTitle: details.book.title,
        bookAuthor: details.book.author,
        bookYear: details.book.year,
        bookIsbn: details.book.isbn,
        bookDifficultyRatingId,
        bookDifficultyCanonicalKey,
        difficulty,
        bookLevel: details.resolvedBookLevel,
        learningGoal: details.learningGoal,
        generatedCount: details.existingQuestions.length,
        existingQuestionKeys: details.existingQuestions.map((question) => question.questionKey ?? question.question),
        existingQuestions: details.existingQuestions.map((question) => question.question),
      }),
    });

    return readQuizPayload(response);
  };

  const fillQuizInBackground = async (details: {
    book: BookMatch;
    resolvedBookLevel: BookLevel;
    learningGoal: string;
    initialQuiz: QuizData;
    targetCount: number;
  }) => {
    setIsFillingQuiz(true);
    setQuizGenerationStatus("Preparing the rest of the quiz...");
    let collectedQuestions = details.initialQuiz.questions.slice();

    try {
      while (collectedQuestions.length < details.targetCount) {
        const nextBatch = await fetchQuizBatch({
          book: details.book,
          resolvedBookLevel: details.resolvedBookLevel,
          learningGoal: details.learningGoal,
          mode: "procedural_next",
          existingQuestions: collectedQuestions,
        });

        const seen = new Set(collectedQuestions.map((question) => question.questionKey ?? question.question));
        const freshQuestions = nextBatch.questions.filter((question) => {
          const key = question.questionKey ?? question.question;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });

        if (freshQuestions.length === 0) {
          throw new Error("The quiz generator repeated itself. Please try again.");
        }

        collectedQuestions = [...collectedQuestions, ...freshQuestions].slice(0, details.targetCount);
        setQuizData((current) => current ? {
          ...current,
          questions: collectedQuestions,
        } : {
          ...details.initialQuiz,
          questions: collectedQuestions,
        });
        setSelectedAnswers((current) => Array.from({ length: details.targetCount }, (_, index) => current[index] ?? -1));
        setQuizGenerationStatus(`${collectedQuestions.length} of ${details.targetCount} questions ready.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The rest of the quiz could not be prepared.");
    } finally {
      setIsFillingQuiz(false);
      setQuizGenerationStatus("");
    }
  };

  const handleGenerate = async () => {
    if (!bookTitle.trim() && !bookAuthor.trim() && !(showAdvancedSearch && isbn.trim()) && !(showAdvancedSearch && publicationYear.trim())) {
      setError("Enter a title or author to search. Advanced Search can use ISBN or publication year when needed.");
      return;
    }

    const book = await ensureBookConfirmed();
    if (!book) {
      return;
    }

    const resolvedBookLevel = bookLevel ?? await detectReadingLevel(book);
    if (!resolvedBookLevel) {
      return;
    }
    if (!isDifficultyAllowedForBookLevel(difficulty, resolvedBookLevel)) {
      const allowedDifficulty = getAllowedDifficulties(resolvedBookLevel)[0];
      setDifficulty(allowedDifficulty);
      setError(`Beginner books can only use Easy quizzes. I switched this quiz to ${allowedDifficulty}.`);
      return;
    }

    if (user) {
      const controls = { ...defaultParentControls, ...(user.parentControls ?? {}) };
      const order = ["easy", "medium", "hard"];
      if (order.indexOf(difficulty) > order.indexOf(controls.maxGoalDifficulty)) {
        setError(`Your current goal setting allows quizzes up to ${controls.maxGoalDifficulty}.`);
        return;
      }
      if (!controls.allowQuizRetakes && getLastQuizEntry(user, book.title)) {
        setError("A parent has turned off quiz retakes for this profile.");
        return;
      }
      if (!user.isParent && controls.requireAiQuizReview) {
        setError("A parent has asked to review new quizzes before they are taken.");
        return;
      }
      if (!isFriendlyChallenge) {
        const planAvailability = getPlanQuizAvailability(user);
        if (planAvailability.requiresAd && !adUnlocked) {
          setError("Watch the ad unlock before starting this Free quiz.");
          return;
        }
        if (!planAvailability.available) {
          setError(planAvailability.message);
          return;
        }

        const availability = getQuizAvailability(user, book.title, difficulty);
        if (!availability.available) {
          setError(availability.message);
          return;
        }
      }
    }

    setError("");
    setIsLoading(true);
    setQuizData(null);
    setCurrentQuestion(0);
    setSelectedChoice(null);
    setSelectedAnswers([]);
    setScore(0);
    setCompleted(false);
    setSaved(false);
    setEarnedPoints(0);
    setReportedQuestions({});
    setAdUnlocked(false);
    setIsFillingQuiz(false);
    setIsWaitingForQuestion(false);
    setQuizTargetCount(0);
    setFirstQuestionLoadMs(null);
    setIsFirstReaderForBook(false);
    setQuizGenerationStatus("");
    setQuizStarted(false);
    setStartCountdown(null);

    const learningGoal = getProfileTestingGoal(user);
    const targetQuestionCount = getMaxScore(difficulty);
    const shouldUseProceduralQuiz = targetQuestionCount > 5;
    const generationStartedAt = performance.now();

    try {
      setIsFirstReaderForBook(await checkFirstReaderStatus(book));
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: shouldUseProceduralQuiz ? "procedural_starter" : "full",
          bookTitle: book.title,
          bookAuthor: book.author,
          bookYear: book.year,
          bookIsbn: book.isbn,
          bookDifficultyRatingId,
          bookDifficultyCanonicalKey,
          difficulty,
          bookLevel: resolvedBookLevel,
          learningGoal,
        }),
      });

      const payload = await readQuizPayload(response);

      setQuizData(payload);
      setQuizTargetCount(targetQuestionCount);
      setSelectedAnswers(Array(targetQuestionCount).fill(-1));
      setFirstQuestionLoadMs(Math.round(performance.now() - generationStartedAt));
      setTimeLeft(30);
      setTimerActive(false);
      setStartCountdown(3);

      if (shouldUseProceduralQuiz && payload.questions.length < targetQuestionCount) {
        void fillQuizInBackground({
          book,
          resolvedBookLevel,
          learningGoal,
          initialQuiz: payload,
          targetCount: targetQuestionCount,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveResult = () => {
    if (!quizData || saved || !user || !bookLevel) return;

    if (isFriendlyChallenge) {
      if (activeChallenge) {
        completeReadingChallenge(activeChallenge.id, {
          responderScore: score,
          responderMaxScore: maxScore,
          responderAnswers: selectedAnswers,
        });
        setChallengeSavedMessage(`Challenge complete. ${activeChallenge.fromName} scored ${activeChallenge.initiatorScore} / ${activeChallenge.initiatorMaxScore}.`);
      } else if (challengeFriendId) {
        try {
          const challenge = createReadingChallenge({
            bookTitle,
            difficulty,
            bookLevel,
            quizTitle: quizData.quizTitle,
            quizDescription: quizData.quizDescription,
            questions: quizData.questions,
            fromProfile: user,
            toProfileId: challengeFriendId,
            initiatorScore: score,
            initiatorMaxScore: maxScore,
            initiatorAnswers: selectedAnswers,
          });
          setActiveChallenge(challenge);
          setChallengeSavedMessage(`Challenge sent to ${challenge.toName}. They can accept it from Friends anytime.`);
        } catch (err) {
          setChallengeSavedMessage(err instanceof Error ? err.message : "Unable to save the challenge.");
        }
      }
      setEarnedPoints(0);
      setSaved(true);
      return;
    }

    const learningGoal = getProfileTestingGoal(user, parentApprovedQuiz);
    const pointsEarned = getPotentialEarnedPoints(user, score, maxScore, {
      bookTitle,
      difficulty,
    });
    const updated = addQuizResult(score, maxScore, {
      bookTitle,
      difficulty,
      bookLevel,
      bookDifficultyScore: bookDifficultyIndex ?? undefined,
      bookDifficultyRatingId: bookDifficultyRatingId ?? undefined,
      quizPayload: quizData,
      selectedAnswers,
      learningGoal,
    });

    if (updated) {
      setUser(updated);
      setEarnedPoints(pointsEarned);
      setSaved(true);
    }
  };

  const handleChoice = (choiceIndex: number) => {
    if (!quizData || selectedChoice !== null || completed || !quizStarted) return;

    const current = quizData.questions[currentQuestion];
    const correct = choiceIndex === current.answerIndex;
    const isTimeout = choiceIndex === -1;

    if (correct && !isTimeout) {
      setScore((prev) => prev + 1);
    }
    setSelectedChoice(choiceIndex);
    setSelectedAnswers((current) => {
      const answerCount = quizTargetCount || quizData.questions.length;
      const next = Array.from({ length: answerCount }, (_, index) => current[index] ?? -1);
      next[currentQuestion] = choiceIndex;
      return next;
    });
    setTimerActive(false);
  };

  const handleNext = () => {
    if (!quizData) return;
    const targetCount = quizTargetCount || quizData.questions.length;

    if (currentQuestion + 1 >= targetCount) {
      setCompleted(true);
      setStartCountdown(null);
      setTimerActive(false);
      saveResult();
      return;
    }

    if (currentQuestion + 1 >= quizData.questions.length) {
      setIsWaitingForQuestion(true);
      setTimerActive(false);
      return;
    }

    setCurrentQuestion((prev) => prev + 1);
    setSelectedChoice(null);
    setTimeLeft(30);
    setTimerActive(true);
  };

  const reportQuestionIssue = (questionIndex: number, reason: QuizIssueReason) => {
    if (!quizData || !user) return;
    const alreadyReportedForQuestion = Object.keys(reportedQuestions).some((key) => key.startsWith(`${questionIndex}-`));
    if (alreadyReportedForQuestion) {
      setReportedQuestions((current) => ({
        ...current,
        [`${questionIndex}-${reason}`]: "This question has already been sent for review.",
      }));
      return;
    }

    const question = quizData.questions[questionIndex];
    const report = addQuizIssueReport({
      profileId: user.id,
      profileName: user.name,
      bookTitle,
      difficulty,
      question: question.question,
      choices: question.choices,
      answerIndex: question.answerIndex,
      selectedChoice: selectedAnswers[questionIndex] ?? -1,
      poolQuestionId: question.poolQuestionId,
      questionValue,
      reason,
    });

    if (user.isParent) {
      const updated = awardQuizIssueReportPoints(report.id);
      if (updated) {
        setUser(updated);
      }
    }

    setReportedQuestions((current) => ({
      ...current,
      [`${questionIndex}-${reason}`]: user.isParent
        ? "Accepted. Correction points were added for this question."
        : "Sent to the parent review queue.",
    }));
  };

  if (!user) {
    return (
      <main>
        <h1>Reading Quest Quiz</h1>
        <p>Please sign in first so quiz points attach to your profile.</p>
        <Link href="/">
          <button type="button">Return to login</button>
        </Link>
      </main>
    );
  }

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">{user.isParent ? "Quiz Challenge" : "Reading Challenge"}</div>
          <h1>Reading Quest</h1>
          <p>Logged in as {user.name} - {getSpendablePoints(user)} points available</p>
          {isFriendlyChallenge ? (
            <p className="setting-description">
              {activeChallenge
                ? `Accepted challenge from ${activeChallenge.fromName}. Same quiz, no points.`
                : `Friendly challenge against ${challengeFriendName}. You take the quiz first, then the same quiz is sent to them. No points will be awarded.`}
            </p>
          ) : null}
        </div>
        <HeroProfileActions profile={user} homeHref={homeHref}>
          <Link href="/">
            <button type="button" className="secondary">
              Sign out
            </button>
          </Link>
        </HeroProfileActions>
      </div>

      {!quizData ? (
        <div className="quest-panel output">
          <h2>{user.isParent ? "Build Your Quiz" : "Build Your Quest"}</h2>
          <p>
            Start with a book title, author, or both. Choose the matching book, pick a path, and begin the challenge.
          </p>

          <div className="field">
            <label htmlFor="bookTitle">Book title</label>
            <input
              id="bookTitle"
              type="text"
              value={bookTitle}
              onChange={(event) => {
                setBookTitle(event.target.value);
                resetBookLookupState();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCheckBook();
                }
              }}
              placeholder="e.g. The Lion, the Witch and the Wardrobe"
            />
          </div>

          <div className="field">
            <label htmlFor="bookAuthor">Author</label>
            <input
              id="bookAuthor"
              type="text"
              value={bookAuthor}
              onChange={(event) => {
                setBookAuthor(event.target.value);
                resetBookLookupState();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCheckBook();
                }
              }}
              placeholder="e.g. C. S. Lewis"
            />
          </div>

          <div className="book-check-panel">
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={handleCheckBook}
                disabled={isCheckingBook || !getBookLookupPayload()}
              >
                {isCheckingBook ? "Searching..." : "Search the Library"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setShowAdvancedSearch((current) => !current);
                  setShowIsbnFallback(false);
                  setBookLookupMessage("");
                }}
              >
                {showAdvancedSearch ? "Hide Advanced Search" : "Not seeing it? Advanced Search"}
              </button>
            </div>

            {showAdvancedSearch ? (
              <div className="nested-section advanced-book-search">
                <div>
                  <h3>Advanced Search</h3>
                  <p>Use these only when the title or author search does not find the right book.</p>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="isbn">ISBN</label>
                    <input
                      id="isbn"
                      value={isbn}
                      onChange={(event) => {
                        setIsbn(event.target.value);
                        resetBookLookupState();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCheckBook();
                        }
                      }}
                      placeholder="e.g. 9780064404990"
                    />
                    <p className="setting-description">
                      Look near the barcode on the back cover or inside the copyright page for a 10- or 13-digit ISBN.
                    </p>
                  </div>
                  <div className="field">
                    <label htmlFor="publicationYear">Publication year</label>
                    <input
                      id="publicationYear"
                      value={publicationYear}
                      onChange={(event) => {
                        setPublicationYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4));
                        resetBookLookupState();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCheckBook();
                        }
                      }}
                      inputMode="numeric"
                      placeholder="e.g. 1950"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {confirmedBook ? (
              <div className="confirmed-book">
                <strong>Adventure Found: {confirmedBook.title}</strong>
                <span>
                  {confirmedBook.author}
                  {confirmedBook.year ? ` - ${confirmedBook.year}` : ""}
                </span>
              </div>
            ) : null}

            {bookLookupMessage ? <div className={showIsbnFallback ? "warning-box" : "notice"}>{bookLookupMessage}</div> : null}

            {bookOptions.length > 0 ? (
              <div className="book-option-grid">
                {bookOptions.map((book) => (
                  <button key={book.id} type="button" className="book-option" onClick={() => applyConfirmedBook(book)}>
                    {book.coverUrl ? (
                      <img className="book-cover" src={book.coverUrl} alt="" />
                    ) : (
                      <span className="book-cover-placeholder">No cover</span>
                    )}
                    <span>
                      <strong>{book.title}</strong>
                      <span>
                        {book.author}
                        {book.year ? ` - ${book.year}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {showIsbnFallback ? (
              <div className="nested-section">
                <p>ISBN is often the most accurate way to find an exact edition. Open Advanced Search, enter the ISBN, then press Enter or Search the Library.</p>
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setBookLookupMessage("Sorry, we still could not find that book. Please try another book title.");
                      setShowIsbnFallback(false);
                      setIsbn("");
                      setPublicationYear("");
                    }}
                  >
                    Try another book
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {isDetectingLevel ? (
            <p className="notice">Detecting reading level...</p>
          ) : bookLevel ? (
            <div className="success-box">
              <strong>Reading Level Detected: {formatBookLevel(bookLevel)}</strong>
              {bookDifficultyIndex ? (
                <>
                  <br />
                  <br />
                  <span>
                    RQ Difficulty Index: {bookDifficultyIndex.toFixed(1)} / 9.9 (Range {getDifficultyIndexRange(bookLevel)})
                  </span>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="field">
            <label htmlFor="difficulty">{user.isParent ? "Quiz Difficulty" : "Challenge Path"}</label>
            <select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficultyLevels[number])}>
              {allowedDifficulties.map((level) => (
                <option key={level} value={level}>
                  {getQuizDifficultyLabel(level)}
                </option>
              ))}
            </select>
            {bookLevel ? (
              <p className="setting-description">
                {formatBookLevel(bookLevel)} books can be tested on{" "}
                {bookLevel === "beginner"
                  ? "Wanderer (Easy)"
                  : bookLevel === "intermediate"
                    ? "Wanderer (Easy) or Adventurer (Medium)"
                    : "Wanderer (Easy), Adventurer (Medium), or QuestMaster (Hard)"}
                . Wanderer checks the story path, Adventurer asks you to connect clues, and QuestMaster looks for the bigger meaning of the book.
              </p>
            ) : confirmedBook ? (
              <p className="setting-description">Reading Quest will detect the book reading level after you confirm the book.</p>
            ) : null}
          </div>

          <button onClick={handleGenerate} disabled={isLoading || isDetectingLevel || isCheckingBook}>
            {isLoading ? "Preparing challenge..." : "Begin Challenge"}
          </button>

          {isLoading ? (
            <div className="quiz-loading-panel" role="status" aria-live="polite">
              <div className="quiz-loading-spinner" aria-hidden="true" />
              <div>
                <strong>Building and checking your challenge...</strong>
                {isFirstReaderForBook ? (
                  <p>You&apos;re the first Reading Quest reader to challenge this book! Good luck, and we&apos;d love your feedback afterward!</p>
                ) : (
                  <p>
                    We are checking the questions and answers before the challenge starts.
                    {loadingSuggestion ? ` After this, you might like ${loadingSuggestion}.` : " Keep a favorite book nearby in case you want to look back after the challenge."}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {!isFriendlyChallenge && planQuizAvailability ? (
            <div className="nested-section plan-quiz-gate">
              <strong>
                {planQuizAvailability.requiresAd
                  ? "Free quest unlock"
                  : planQuizAvailability.tier === "plus"
                    ? "Plus beta quest limit"
                    : "Beta quest limit"}
              </strong>
              <p>{planQuizAvailability.message}</p>
              {planQuizAvailability.requiresAd ? (
                <button type="button" className="secondary" onClick={() => {
                  setAdUnlocked(true);
                  setError("");
                }}>
                  {adUnlocked ? "Ad unlock ready" : "Watch ad to unlock quest"}
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="error-box">
              <strong>Error:</strong> {error}
            </div>
          ) : null}
        </div>
      ) : !completed ? (
        <div className="output">
          {startCountdown !== null ? (
            <div className="quiz-start-modal-shell" role="dialog" aria-modal="true" aria-labelledby="quiz-start-title">
              <div className="quiz-start-modal-scrim" />
              <section className="quiz-start-modal">
                <div className="kicker">Challenge Ready</div>
                <h2 id="quiz-start-title">Your quest is about to begin</h2>
                <p>Get ready for {quizDisplayTotal} questions on {bookTitle}.</p>
                <div className="quiz-countdown" aria-live="assertive">
                  {startCountdown > 0 ? startCountdown : "GO!"}
                </div>
              </section>
            </div>
          ) : null}
          <h2>{quizData.quizTitle}</h2>
          <p>{quizData.quizDescription}</p>
          <div className="quiz-status">
            <span>Question {currentQuestion + 1} of {quizDisplayTotal}</span>
            <span>Correct answers: {score} / {maxScore}</span>
            {currentCorrectStreak >= 3 ? (
              <span className="knowledge-streak">Knowledge Streak! {currentCorrectStreak} correct in a row</span>
            ) : null}
            {firstQuestionLoadMs !== null ? <span>First question ready in {(firstQuestionLoadMs / 1000).toFixed(1)}s</span> : null}
          </div>
          {isFillingQuiz || quizGenerationStatus ? (
            <div className="notice" role="status" aria-live="polite">
              {quizGenerationStatus || "Preparing the next questions..."}
            </div>
          ) : null}

          <div className="question-card">
            {focusLost && (
              <div className="warning-box">
                Warning: App focus was lost. Please stay focused on the quiz.
              </div>
            )}
            <div className="question-meta">
              <span>Time left: {timeLeft}s</span>
              <div className="timer-track">
                <div
                  className={`timer-fill ${timerClass}`}
                  style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
              </div>
            </div>
            {isWaitingForQuestion || !quizData.questions[currentQuestion] ? (
              <div className="quiz-loading-panel" role="status" aria-live="polite">
                <div className="quiz-loading-spinner" aria-hidden="true" />
                <div>
                  <strong>Preparing the next question...</strong>
                  <p>The quiz is checking that it has not repeated an idea.</p>
                </div>
              </div>
            ) : (
              <>
            <span className="question-category">{getQuestionCategory(quizData.questions[currentQuestion].questionType)}</span>
            <h3>{quizData.questions[currentQuestion].question}</h3>
            <div className="choice-grid">
              {quizData.questions[currentQuestion].choices.map((choice, index) => {
                const isSelected = selectedChoice === index;
                const isCorrect = quizData.questions[currentQuestion].answerIndex === index;
                const showCorrect = selectedChoice !== null;
                return (
                  <button
                    key={choice}
                    type="button"
                    className={`choice-button ${isSelected ? "selected" : ""} ${
                      showCorrect && isCorrect ? "correct" : ""
                    } ${showCorrect && isSelected && !isCorrect ? "incorrect" : ""}`}
                    onClick={() => handleChoice(index)}
                    disabled={selectedChoice !== null}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
              </>
            )}

            {selectedChoice !== null && quizData.questions[currentQuestion] ? (
              <div className="answer-feedback">
                {selectedChoice === quizData.questions[currentQuestion].answerIndex ? (
                  <p className="correct-praise">{correctPraise[currentQuestion % correctPraise.length]} That answer is correct.</p>
                ) : (
                  <p className="retry-praise">
                    {retryPraise[currentQuestion % retryPraise.length]} The story says the expected answer was "{quizData.questions[currentQuestion].choices[
                      quizData.questions[currentQuestion].answerIndex
                    ]}". You can look back at the book and try again later.
                  </p>
                )}
                <button type="button" onClick={handleNext}>
                  {currentQuestion + 1 === quizDisplayTotal ? "Finish Challenge" : "Next question"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {completed ? (
        <div className="output">
          <h2>{score === maxScore ? "Book Mastered!" : "Challenge complete!"}</h2>
          <p className="completed-challenge-title">
            {bookTitle} - {getQuizDifficultyLabel(difficulty)}
          </p>
          <div className="success-box quiz-encouragement quest-complete-celebration">
            <strong>{encouragementMessage}</strong>
          </div>
          <p>
            You answered <strong>{score}</strong> / {maxScore} correctly.
          </p>
          {!isFriendlyChallenge ? (
            <p className="setting-description">
              Base points: {basePoints}. Accuracy and first-time book bonuses are included in the points earned below.
            </p>
          ) : null}
          {isFriendlyChallenge ? (
            <p>Friendly challenge complete. No points were awarded to your account.</p>
          ) : (
            <div className="quiz-points-summary" aria-label="Challenge points summary">
              <div>
                <span>Earned</span>
                <strong className="earned-points-pop">{earnedPoints}</strong>
                <small>new points</small>
              </div>
              <div>
                <span>Total Ready</span>
                <strong>{getSpendablePoints(user)}</strong>
                <small>points available</small>
              </div>
            </div>
          )}
          {isFriendlyChallenge ? (
            <div className="notice">
              {challengeSavedMessage || `Compare your score with ${challengeFriendName} in Friends.`}
            </div>
          ) : score === maxScore && nextAllowedDifficulty ? (
            <div className="success-box">
              Perfect score! This book can be tested at {nextAllowedDifficulty} difficulty next.
            </div>
          ) : earnedPoints === 0 ? (
            <div className="notice">
              This retake was for fun, so no new points were added.
            </div>
          ) : null}

          <div className="quiz-review-summary">
            <h3>Challenge Review</h3>
            <p>Open each story insight to review the choices, what you chose, and the answer the challenge expected.</p>
            {quizData?.questions.map((question, index) => {
              const chosenIndex = selectedAnswers[index] ?? -1;
              const chosenText = chosenIndex >= 0 ? question.choices[chosenIndex] : "No answer selected";
              const correctText = question.choices[question.answerIndex] ?? question.answerText ?? "Unknown";
              const wasCorrect = chosenIndex === question.answerIndex;

              return (
                <details key={`${question.question}-${index}`} className="quiz-review-item">
                  <summary>Question {index + 1} {wasCorrect ? "Correct" : "Review"}</summary>
                  <div>
                    <h4>{getQuestionCategory(question.questionType)}</h4>
                    <p>{question.question}</p>
                  </div>
                  <div className="quiz-review-answers">
                    <p><strong>Your answer:</strong> {chosenText}</p>
                    <p><strong>Expected answer:</strong> {correctText}</p>
                    <p><strong>Result:</strong> {wasCorrect ? "Correct" : "Incorrect"}</p>
                    {question.explanation ? <p><strong>Story Insight:</strong> {question.explanation}</p> : null}
                    <ul>
                      {question.choices.map((choice, choiceIndex) => (
                        <li key={`${choice}-${choiceIndex}`}>
                          {choiceIndex + 1}. {choice}
                          {choiceIndex === chosenIndex ? " - your choice" : ""}
                          {choiceIndex === question.answerIndex ? " - expected answer" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {(() => {
                    const reportedOption = quizIssueOptions.find((option) => reportedQuestions[`${index}-${option.value}`]);
                    return (
                      <div className="question-report-control">
                        <label htmlFor={`question-report-${index}`}>Report a problem with this question</label>
                        <select
                          id={`question-report-${index}`}
                          value={reportedOption?.value ?? ""}
                          disabled={Boolean(reportedOption)}
                          onChange={(event) => {
                            const reason = event.target.value as QuizIssueReason;
                            if (reason) {
                              reportQuestionIssue(index, reason);
                            }
                          }}
                        >
                          <option value="">Choose an issue, if needed</option>
                          {quizIssueOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {reportedOption ? (
                          <div className="notice">{reportedQuestions[`${index}-${reportedOption.value}`]}</div>
                        ) : null}
                      </div>
                    );
                  })()}
                </details>
              );
            })}
          </div>

          {!reviewStarted && !reviewSubmitted ? (
            <div className="review-prompt">
              <p>Would you like to review the book you were just tested on?</p>
              <div className="button-row">
                <button type="button" onClick={() => setReviewStarted(true)}>
                  Yes
                </button>
                <button type="button" className="secondary" onClick={() => router.push(homeHref)}>
                  No
                </button>
              </div>
            </div>
          ) : null}

          {reviewStarted && !reviewSubmitted ? (
            <div className="review-form">
              <h3>Write a review for {bookTitle}</h3>
              <p>Choose a star rating and write up to 250 words.</p>
              <div className="star-row">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`star-button ${reviewRating >= star ? "selected" : ""}`}
                    aria-label={`${star} star${star === 1 ? "" : "s"}`}
                    aria-pressed={reviewRating >= star}
                    onClick={() => setReviewRating(star)}
                  >
                    <img
                      src={reviewRating >= star ? "/images/star-filled.png" : "/images/star-empty.png"}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <div className="field">
                <label htmlFor="reviewText">Your review</label>
                <textarea
                  id="reviewText"
                  value={reviewText}
                  onChange={(event) => {
                    const words = event.target.value.trim().split(/\s+/).filter(Boolean).length;
                    if (words <= 250) {
                      setReviewText(event.target.value);
                    }
                  }}
                  rows={6}
                  placeholder="Tell us what you thought about the book..."
                />
                <p className="word-count">{reviewWordCount} / 250 words</p>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    if (reviewRating === 0) {
                      setError("Please choose a star rating before submitting.");
                      return;
                    }
                    const currentUser = getCurrentProfile();
                    if (!currentUser) return;
                    addReview({
                      profileId: currentUser.id,
                      profileName: currentUser.name,
                      bookTitle,
                      rating: reviewRating,
                      reviewText,
                    });
                    setReviewSubmitted(true);
                  }}
                >
                  Submit review
                </button>
                <button type="button" className="secondary" onClick={() => router.push(homeHref)}>
                  Skip
                </button>
              </div>
              {error ? <p className="error-box">{error}</p> : null}
            </div>
          ) : null}

          {reviewSubmitted ? (
            <div className="success-box">
              <h3>Thanks for your review!</h3>
              <p>Your review helps other readers and parents.</p>
              <button type="button" onClick={() => router.push(homeHref)}>Back to Home</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export default function QuizPage() {
  return (
    <Suspense fallback={<div>Loading quiz...</div>}>
      <QuizPageContent />
    </Suspense>
  );
}
