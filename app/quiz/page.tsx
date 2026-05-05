"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import type { BookLookupResult, BookMatch } from "../../lib/books";
import {
  getAllowedDifficulties,
  getBasePoints,
  getMaxScore,
  getNextAllowedDifficulty,
  getQuestionValue,
  isDifficultyAllowedForBookLevel,
} from "../../lib/scoring";

type QuizQuestion = {
  question: string;
  choices: string[];
  answerIndex: number;
  answerText?: string;
  explanation?: string;
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
  const [confirmedBook, setConfirmedBook] = useState<BookMatch | null>(null);
  const [bookOptions, setBookOptions] = useState<BookMatch[]>([]);
  const [isbn, setIsbn] = useState("");
  const [isCheckingBook, setIsCheckingBook] = useState(false);
  const [bookLookupMessage, setBookLookupMessage] = useState("");
  const [showIsbnFallback, setShowIsbnFallback] = useState(false);
  const [difficulty, setDifficulty] = useState("easy");
  const [bookLevel, setBookLevel] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
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
      setDifficulty(challenge.difficulty);
      setBookLevel(challenge.bookLevel);
      setQuizData({
        quizTitle: challenge.quizTitle,
        quizDescription: challenge.quizDescription,
        questions: challenge.questions,
      });
      setSelectedAnswers(Array(challenge.questions.length).fill(-1));
      setCurrentQuestion(0);
      setSelectedChoice(null);
      setScore(0);
      setCompleted(false);
      setSaved(false);
      setEarnedPoints(0);
      setChallengeSavedMessage("");
      setTimeLeft(30);
      setTimerActive(true);
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
          setDifficulty(approvedQuiz.difficulty || "easy");
          setBookLevel(approvedQuiz.bookLevel || "intermediate");
          setQuizData(approvedQuiz);
          setSelectedAnswers([]);
          setParentApprovedQuiz(approvedQuiz);
          setTimeLeft(30);
          setTimerActive(true);
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

      if (bookTitleParam.trim()) {
        setBookTitle(bookTitleParam);
        setConfirmedBook({
          id: bookTitleParam,
          title: bookTitleParam,
          author: "Saved quiz history",
        });
      }
      if (difficultyLevels.includes(difficultyParam as typeof difficultyLevels[number])) {
        setDifficulty(difficultyParam);
      }
      if (bookLevelParam.trim()) {
        setBookLevel(bookLevelParam);
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
    const handleFocus = () => setFocusLost(false);
    const handleBlur = () => setFocusLost(true);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const allowedDifficulties = getAllowedDifficulties(bookLevel);
  const nextAllowedDifficulty = bookLevel ? getNextAllowedDifficulty(difficulty, bookLevel) : null;
  const questionValue = getQuestionValue(difficulty);
  const basePoints = getBasePoints(difficulty);
  const maxScore = quizData ? getMaxScore(difficulty) : 0;
  const timerClass = timeLeft > 10 ? "good" : timeLeft > 5 ? "warn" : "danger";
  const homeHref = user?.isParent ? "/parent" : "/home";
  const planQuizAvailability = user ? getPlanQuizAvailability(user) : null;
  const loadingSuggestion = user ? getBookRecommendations({ profile: user, limit: 1 }).suggestions[0] : "";

  const detectReadingLevel = async (book: BookMatch) => {
    setError("");
    setIsDetectingLevel(true);

    try {
      const response = await fetch("/api/book-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookTitle: book.title }),
      });

      if (!response.ok) {
        throw new Error("Failed to determine book level.");
      }

      const data = await response.json();
      setBookLevel(data.level);
      if (!isDifficultyAllowedForBookLevel(difficulty, data.level)) {
        setDifficulty(getAllowedDifficulties(data.level)[0]);
      }
      return data.level as string;
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
    setBookLevel(null);
    setBookOptions([]);
    setBookLookupMessage("");
    setShowIsbnFallback(false);
    setIsbn("");
    void detectReadingLevel(book);
  };

  const lookupBook = async (payload: { bookTitle?: string; isbn?: string }) => {
    setIsCheckingBook(true);
    setError("");
    setBookLookupMessage("");

    try {
      const response = await fetch("/api/book-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as BookLookupResult;
      if (data.status === "exact" && data.books[0]) {
        applyConfirmedBook(data.books[0]);
        return data.books[0];
      }

      if (data.status === "options") {
        setConfirmedBook(null);
        setBookOptions(data.books);
        setShowIsbnFallback(false);
        setBookLookupMessage("We found a few possible matches. Which book did you mean?");
        return null;
      }

      setConfirmedBook(null);
      setBookOptions([]);
      setShowIsbnFallback(!payload.isbn);
      setBookLookupMessage(
        payload.isbn
          ? "Sorry, we still could not find that book. Please try another book title."
          : "We could not find that book by title. Try the ISBN, or enter a different book.",
      );
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to look up book.");
      return null;
    } finally {
      setIsCheckingBook(false);
    }
  };

  const handleCheckBookTitle = () => {
    if (!bookTitle.trim()) {
      setError("Please enter a book title.");
      return;
    }
    lookupBook({ bookTitle });
  };

  const handleCheckIsbn = () => {
    if (!isbn.trim()) {
      setError("Please enter an ISBN.");
      return;
    }
    lookupBook({ isbn });
  };

  const ensureBookConfirmed = async () => {
    if (confirmedBook && confirmedBook.title === bookTitle.trim()) {
      return confirmedBook;
    }
    return lookupBook({ bookTitle });
  };

  const handleGenerate = async () => {
    if (!bookTitle.trim()) {
      setError("Please enter a book title.");
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
      setError("That difficulty is not available for this book's reading level.");
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
        setError("A parent has asked to review AI-generated quizzes before they are taken.");
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

    const learningGoal = getProfileTestingGoal(user);

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookTitle: book.title,
          difficulty,
          bookLevel: resolvedBookLevel,
          learningGoal,
        }),
      });

      if (!response.ok) {
        const message = await response.text();
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

      setQuizData(payload);
      setSelectedAnswers(Array(payload.questions.length).fill(-1));
      setTimeLeft(30);
      setTimerActive(true);
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
      learningGoal,
    });

    if (updated) {
      setUser(updated);
      setEarnedPoints(pointsEarned);
      setSaved(true);
    }
  };

  const handleChoice = (choiceIndex: number) => {
    if (!quizData || selectedChoice !== null || completed) return;

    const current = quizData.questions[currentQuestion];
    const correct = choiceIndex === current.answerIndex;
    const isTimeout = choiceIndex === -1;

    if (correct && !isTimeout) {
      setScore((prev) => prev + 1);
    }
    setSelectedChoice(choiceIndex);
    setSelectedAnswers((current) => {
      const next = quizData.questions.map((_, index) => current[index] ?? -1);
      next[currentQuestion] = choiceIndex;
      return next;
    });
    setTimerActive(false);
  };

  const handleNext = () => {
    if (!quizData) return;

    if (currentQuestion + 1 >= quizData.questions.length) {
      setCompleted(true);
      saveResult();
      return;
    }

    setCurrentQuestion((prev) => prev + 1);
    setSelectedChoice(null);
    setTimeLeft(30);
    setTimerActive(true);
  };

  const reportQuestionIssue = (
    questionIndex: number,
    reason: "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book",
  ) => {
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
          <div className="kicker">Quiz Challenge</div>
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
        <div className="topbar-buttons">
          <Link href={homeHref}>
            <button type="button" className="secondary">
              Home
            </button>
          </Link>
          <Link href="/">
            <button type="button" className="secondary">
              Sign out
            </button>
          </Link>
        </div>
      </div>

      {!quizData ? (
        <div className="quest-panel output">
          <h2>Build Your Quiz</h2>
          <p>
            Enter a book title, choose the matching book, pick a difficulty, and start the challenge.
          </p>

          <div className="field">
            <label htmlFor="bookTitle">Book title</label>
            <input
              id="bookTitle"
              type="text"
              value={bookTitle}
              onChange={(event) => {
                setBookTitle(event.target.value);
                setConfirmedBook(null);
                setBookLevel(null);
                setBookOptions([]);
                setBookLookupMessage("");
                setShowIsbnFallback(false);
              }}
              placeholder="e.g. The Lion, the Witch and the Wardrobe"
            />
          </div>

          <div className="book-check-panel">
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={handleCheckBookTitle}
                disabled={isCheckingBook || !bookTitle.trim()}
              >
                {isCheckingBook ? "Checking book..." : "Check book"}
              </button>
            </div>

            {confirmedBook ? (
              <div className="confirmed-book">
                <strong>Using: {confirmedBook.title}</strong>
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
              <div className="field">
                <label htmlFor="isbn">ISBN</label>
                <input
                  id="isbn"
                  value={isbn}
                  onChange={(event) => setIsbn(event.target.value)}
                  placeholder="e.g. 9780064404990"
                />
                <p className="setting-description">
                  Tip: Look near the barcode on the back cover or inside the copyright page for a 10- or 13-digit ISBN.
                </p>
                <div className="button-row">
                  <button type="button" onClick={handleCheckIsbn} disabled={isCheckingBook || !isbn.trim()}>
                    Check ISBN
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setBookLookupMessage("Sorry, we still could not find that book. Please try another book title.");
                      setShowIsbnFallback(false);
                      setIsbn("");
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
            <p className="success-box">Reading level detected: {bookLevel}</p>
          ) : null}

          <div className="field">
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              {allowedDifficulties.map((level) => (
                <option key={level} value={level}>
                  {level === "easy" ? "Easy (5 questions, 10 base points)" : level === "medium" ? "Medium (10 questions, 40 base points)" : "Hard (20 questions, 100 base points)"}
                </option>
              ))}
            </select>
            {bookLevel ? (
              <p className="setting-description">
                {bookLevel === "beginner"
                  ? "Beginner books can only be tested on Easy."
                  : bookLevel === "intermediate"
                    ? "Intermediate books can be tested on Easy or Medium."
                    : "Advanced books can be tested on Easy, Medium, or Hard."}
              </p>
            ) : null}
          </div>

          <button onClick={handleGenerate} disabled={isLoading || isDetectingLevel || isCheckingBook}>
            {isLoading ? "Generating quiz..." : "Generate quiz"}
          </button>

          {isLoading ? (
            <div className="quiz-loading-panel" role="status" aria-live="polite">
              <div className="quiz-loading-spinner" aria-hidden="true" />
              <div>
                <strong>Building and checking your quiz...</strong>
                <p>
                  We are checking the questions and answers before the quiz starts.
                  {loadingSuggestion ? ` After this, you might like ${loadingSuggestion}.` : " Keep a favorite book nearby in case you want to look back after the quiz."}
                </p>
              </div>
            </div>
          ) : null}

          {!isFriendlyChallenge && planQuizAvailability ? (
            <div className="nested-section plan-quiz-gate">
              <strong>
                {planQuizAvailability.requiresAd
                  ? "Free quiz unlock"
                  : planQuizAvailability.tier === "plus"
                    ? "Plus beta quiz limit"
                    : "Beta quiz limit"}
              </strong>
              <p>{planQuizAvailability.message}</p>
              {planQuizAvailability.requiresAd ? (
                <button type="button" className="secondary" onClick={() => {
                  setAdUnlocked(true);
                  setError("");
                }}>
                  {adUnlocked ? "Ad unlock ready" : "Watch ad to unlock quiz"}
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
          <h2>{quizData.quizTitle}</h2>
          <p>{quizData.quizDescription}</p>
          <div className="quiz-status">
            <span>Question {currentQuestion + 1} of {quizData.questions.length}</span>
            <span>Correct answers: {score} / {maxScore}</span>
          </div>

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

            {selectedChoice !== null ? (
              <div className="answer-feedback">
                {selectedChoice === quizData.questions[currentQuestion].answerIndex ? (
                  <p>Great job! That answer is correct.</p>
                ) : (
                  <p>
                    Good try. The story says the expected answer was "{quizData.questions[currentQuestion].choices[
                      quizData.questions[currentQuestion].answerIndex
                    ]}". You can look back at the book and try again later.
                  </p>
                )}
                <button type="button" onClick={handleNext}>
                  {currentQuestion + 1 === quizData.questions.length ? "Finish quiz" : "Next question"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {completed ? (
        <div className="output">
          <h2>Quiz complete!</h2>
          <p>
            You answered <strong>{score}</strong> / {maxScore} correctly.
          </p>
          {!isFriendlyChallenge ? (
            <p className="setting-description">
              Base points: {basePoints}. Accuracy and first-time book bonuses are included in the points earned below.
            </p>
          ) : null}
          <p>
            {isFriendlyChallenge ? (
              <>Friendly challenge complete. No points were awarded to your account.</>
            ) : (
              <>You earned <strong>{earnedPoints}</strong> new points. You now have <strong>{getSpendablePoints(user)}</strong> points available.</>
            )}
          </p>
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
            <h3>Quiz Review</h3>
            <p>Review each question, the answer choices, what you chose, and the answer the quiz expected.</p>
            {quizData?.questions.map((question, index) => {
              const chosenIndex = selectedAnswers[index] ?? -1;
              const chosenText = chosenIndex >= 0 ? question.choices[chosenIndex] : "No answer selected";
              const correctText = question.choices[question.answerIndex] ?? question.answerText ?? "Unknown";
              const wasCorrect = chosenIndex === question.answerIndex;

              return (
                <div key={`${question.question}-${index}`} className="quiz-review-item">
                  <div>
                    <h4>Question {index + 1}</h4>
                    <p>{question.question}</p>
                  </div>
                  <div className="quiz-review-answers">
                    <p><strong>Your answer:</strong> {chosenText}</p>
                    <p><strong>Expected answer:</strong> {correctText}</p>
                    <p><strong>Result:</strong> {wasCorrect ? "Correct" : "Incorrect"}</p>
                    {question.explanation ? <p><strong>Quiz explanation:</strong> {question.explanation}</p> : null}
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
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => reportQuestionIssue(index, "impossible")}
                    >
                      Impossible to answer
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => reportQuestionIssue(index, "wrong_answer")}
                    >
                      Answer was wrong
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => reportQuestionIssue(index, "too_hard")}
                    >
                      Too hard
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => reportQuestionIssue(index, "spoiler")}
                    >
                      Spoiler
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => reportQuestionIssue(index, "not_from_book")}
                    >
                      Not from this book
                    </button>
                  </div>
                  {["impossible", "wrong_answer", "too_hard", "spoiler", "not_from_book"].map((reason) =>
                    reportedQuestions[`${index}-${reason}`] ? (
                      <div key={reason} className="notice">{reportedQuestions[`${index}-${reason}`]}</div>
                    ) : null,
                  )}
                </div>
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
                    onClick={() => setReviewRating(star)}
                  >
                    Star
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
