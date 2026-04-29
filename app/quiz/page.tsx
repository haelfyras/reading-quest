"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addQuizResult,
  addReview,
  canRetakeBook,
  getCurrentProfile,
  difficultyLevels,
  Profile,
} from "../../lib/user";

type QuizQuestion = {
  question: string;
  choices: string[];
  answerIndex: number;
};

type QuizData = {
  quizTitle: string;
  quizDescription: string;
  questions: QuizQuestion[];
};

const getQuestionValue = (difficulty: string, bookLevel: string) => {
  if (difficulty === "easy") {
    return 10;
  }

  if (difficulty === "medium") {
    if (bookLevel === "beginner") return 20;
    if (bookLevel === "intermediate") return 35;
    return 50;
  }

  if (difficulty === "hard") {
    if (bookLevel === "beginner") return 60;
    if (bookLevel === "intermediate") return 70;
    return 80;
  }

  return 10;
};
 function QuizPageContent() {
  const [user, setUser] = useState<Profile | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [bookLevel, setBookLevel] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLevel, setIsDetectingLevel] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [reviewStarted, setReviewStarted] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const reviewWordCount = reviewText.trim().split(/\s+/).filter(Boolean).length;
  const [parentApprovedQuiz, setParentApprovedQuiz] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(30); // 30 seconds per question
  const [timerActive, setTimerActive] = useState(false);
  const [focusLost, setFocusLost] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    setUser(getCurrentProfile());

    const fromParent = searchParams?.get("fromParent") === "true";
    if (fromParent) {
      const approvedQuizStr = localStorage.getItem("approvedQuiz");
      if (approvedQuizStr) {
        try {
          const approvedQuiz = JSON.parse(approvedQuizStr);
          setBookTitle(approvedQuiz.bookTitle || "");
          setDifficulty(approvedQuiz.difficulty || "easy");
          setBookLevel(approvedQuiz.bookLevel || "intermediate");
          setQuizData(approvedQuiz);
          setParentApprovedQuiz(approvedQuiz);
          setTimeLeft(30);
          setTimerActive(true);
          localStorage.removeItem("approvedQuiz"); // Clean up
          return;
        } catch (err) {
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
      }

      if (difficultyLevels.includes(difficultyParam as typeof difficultyLevels[number])) {
        setDifficulty(difficultyParam);
      }

      if (bookLevelParam.trim()) {
        setBookLevel(bookLevelParam);
      }
    }
  }, [searchParams]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && timeLeft > 0 && !completed) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      // Time's up, auto-submit current question as wrong
      handleChoice(-1); // -1 indicates timeout
    }
    return () => clearInterval(interval);
  }, [timerActive, timeLeft, completed]);

  // Focus detection
  useEffect(() => {
    const handleFocus = () => setFocusLost(false);
    const handleBlur = () => setFocusLost(true);

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const questionValue = bookLevel ? getQuestionValue(difficulty, bookLevel) : 0;

  const maxScore = parentApprovedQuiz
    ? parentApprovedQuiz.pointEstimate * parentApprovedQuiz.questions.length
    : quizData && bookLevel ? questionValue * quizData.questions.length : 0;

  const handleDetectLevel = async () => {
    if (!bookTitle.trim()) {
      setError("Please enter a book title.");
      return;
    }

    if (user && !canRetakeBook(user, bookTitle)) {
      setError("You can only retake a quiz on the same book after 24 hours.");
      return;
    }

    setError("");
    setIsDetectingLevel(true);

    try {
      const response = await fetch("/api/book-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookTitle }),
      });

      if (!response.ok) {
        throw new Error("Failed to determine book level.");
      }

      const data = await response.json();
      setBookLevel(data.level);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect book level.");
    } finally {
      setIsDetectingLevel(false);
    }
  };

  const handleGenerate = async () => {
    if (!bookTitle.trim() || !bookLevel) {
      setError("Please enter a book title and detect the level.");
      return;
    }

    setError("");
    setIsLoading(true);
    setQuizData(null);
    setCurrentQuestion(0);
    setSelectedChoice(null);
    setScore(0);
    setCompleted(false);
    setSaved(false);

    const learningGoal = user?.learningGoal || "basic_comprehension";

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookTitle,
          difficulty,
          bookLevel,
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

    const learningGoal = parentApprovedQuiz?.learningGoal || user?.learningGoal || "basic_comprehension";
    const updated = addQuizResult(score, maxScore, {
      bookTitle,
      difficulty,
      bookLevel,
      learningGoal,
    });

    if (updated) {
      setUser(updated);
      setSaved(true);
    }
  };

  const handleChoice = (choiceIndex: number) => {
    if (!quizData || selectedChoice !== null || completed) return;

    const current = quizData.questions[currentQuestion];
    const correct = choiceIndex === current.answerIndex;
    const isTimeout = choiceIndex === -1;

    if (correct && !isTimeout) {
      setScore((prev) => prev + questionValue);
    }
    setSelectedChoice(choiceIndex);
    setTimerActive(false); // Stop timer
  };

  const handleNext = () => {
    if (!quizData) return;

    if (currentQuestion + 1 >= quizData.questions.length) {
      setCompleted(true);
      saveResult();
      setShowReviewPrompt(true);
      return;
    }

    setCurrentQuestion((prev) => prev + 1);
    setSelectedChoice(null);
    setTimeLeft(30); // Reset timer
    setTimerActive(true); // Start timer for next question
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
      <div className="topbar">
        <div>
          <h1>Reading Quest</h1>
          <p>
            Logged in as {user.name} — {user.points} points
          </p>
        </div>
        <div className="topbar-buttons">
          <Link href="/home">
            <button type="button" className="secondary">
              🏠 Home
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
        <>
          <p>
            Enter a book title (we'll detect the reading level automatically), choose a difficulty,
            and generate a quiz.
          </p>

          <div className="field">
            <label htmlFor="bookTitle">Book title</label>
            <input
              id="bookTitle"
              type="text"
              value={bookTitle}
              onChange={(event) => setBookTitle(event.target.value)}
              placeholder="e.g. The Lion, the Witch and the Wardrobe"
            />
          </div>

          <div className="field">
            <button
              onClick={handleDetectLevel}
              disabled={isDetectingLevel || !bookTitle.trim()}
              type="button"
            >
              {isDetectingLevel ? "Detecting level…" : "Detect reading level"}
            </button>
            {bookLevel ? (
              <p style={{ color: "#22c55e", fontWeight: 600 }}>
                ✓ Reading level detected: {bookLevel}
              </p>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="difficulty">Difficulty</label>
            <select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="easy">Easy (5 questions)</option>
              <option value="medium">Medium (12 questions)</option>
              <option value="hard">Hard (30 questions)</option>
            </select>
          </div>

          <button onClick={handleGenerate} disabled={isLoading || !bookLevel}>
            {isLoading ? "Generating quiz…" : "Generate quiz"}
          </button>

          {error ? (
            <div className="output" style={{ background: "#fee2e2", color: "#991b1b" }}>
              <strong>Error:</strong> {error}
            </div>
          ) : null}
        </>
      ) : (
        <div className="output">
          <h2>{quizData.quizTitle}</h2>
          <p>{quizData.quizDescription}</p>
          <div className="quiz-status">
            <span>
              Question {currentQuestion + 1} of {quizData.questions.length}
            </span>
            <span>
              Current score: {score} / {maxScore}
            </span>
          </div>

          <div className="question-card">
            {focusLost && (
              <div style={{ background: "#fef3c7", color: "#92400e", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
                ⚠️ Warning: App focus was lost. Please stay focused on the quiz.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span>Time left: {timeLeft}s</span>
              <div style={{ width: "100px", height: "10px", background: "#e5e7eb", borderRadius: "5px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(timeLeft / 30) * 100}%`,
                    height: "100%",
                    background: timeLeft > 10 ? "#22c55e" : timeLeft > 5 ? "#eab308" : "#ef4444",
                    transition: "width 1s linear"
                  }}
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
                    Not quite. The correct answer was "
                    {quizData.questions[currentQuestion].choices[
                      quizData.questions[currentQuestion].answerIndex
                    ]}
                    ".
                  </p>
                )}
                <button type="button" onClick={handleNext}>
                  {currentQuestion + 1 === quizData.questions.length
                    ? "Finish quiz"
                    : "Next question"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {completed ? (
        <div className="output">
          <h2>Quiz complete!</h2>
          <p>
            You earned <strong>{score}</strong> points for this quiz.
          </p>
          <p>
            Your new total is <strong>{user.points}</strong> points.
          </p>

          {!reviewStarted && !reviewSubmitted ? (
            <div className="review-prompt">
              <p>Would you like to review the book you were just tested on?</p>
              <div className="button-row">
                <button type="button" onClick={() => setReviewStarted(true)}>
                  Yes
                </button>
                <button type="button" onClick={() => router.push("/home")}>No</button>
              </div>
            </div>
          ) : null}

          {reviewStarted && !reviewSubmitted ? (
            <div className="output review-form">
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
                    ★
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
                <button type="button" onClick={() => router.push("/home")}>Skip</button>
              </div>
              {error ? <p className="error-text">{error}</p> : null}
            </div>
          ) : null}

          {reviewSubmitted ? (
            <div className="output">
              <h3>Thanks for your review!</h3>
              <p>Your review helps other readers and parents.</p>
              <button type="button" onClick={() => router.push("/home")}>Back to Home</button>
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
