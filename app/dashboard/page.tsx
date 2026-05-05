"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookLookupResult, BookMatch } from "../../lib/books";
import {
  getAllowedDifficulties,
  getBasePoints,
  isDifficultyAllowedForBookLevel,
  type BookLevel,
} from "../../lib/scoring";

const learningGoals = [
  { value: "habit_formation", label: "Habit Formation" },
  { value: "basic_comprehension", label: "Basic Comprehension" },
  { value: "deeper_understanding", label: "Deeper Understanding" },
  { value: "literary_analysis", label: "Literary Analysis" },
];

type QuizData = {
  quizTitle: string;
  quizDescription: string;
  questions: Array<{
    question: string;
    choices: string[];
    answerIndex: number;
  }>;
};

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"child" | "parent">("child");
  const [bookTitle, setBookTitle] = useState("");
  const [confirmedBook, setConfirmedBook] = useState<BookMatch | null>(null);
  const [bookOptions, setBookOptions] = useState<BookMatch[]>([]);
  const [isbn, setIsbn] = useState("");
  const [isCheckingBook, setIsCheckingBook] = useState(false);
  const [bookLookupMessage, setBookLookupMessage] = useState("");
  const [showIsbnFallback, setShowIsbnFallback] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [bookLevel, setBookLevel] = useState<BookLevel>("beginner");
  const [learningGoal, setLearningGoal] = useState("basic_comprehension");
  const [rewardPlan, setRewardPlan] = useState("");
  const [quiz, setQuiz] = useState<QuizData | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetectingLevel, setIsDetectingLevel] = useState(false);
  const [error, setError] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [editableQuiz, setEditableQuiz] = useState<QuizData | null>(null);

  const pointEstimate = getBasePoints(difficulty);
  const allowedDifficulties = getAllowedDifficulties(bookLevel);

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
      const level = ["beginner", "intermediate", "advanced"].includes(data.level)
        ? data.level
        : "intermediate";
      setBookLevel(level as BookLevel);
      if (!isDifficultyAllowedForBookLevel(difficulty, level)) {
        setDifficulty(getAllowedDifficulties(level)[0]);
      }
      return level as BookLevel;
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

    const needsLevelDetection = isDetectingLevel || !confirmedBook || confirmedBook.title !== book.title;
    const resolvedBookLevel = needsLevelDetection ? await detectReadingLevel(book) : bookLevel;
    if (!resolvedBookLevel) {
      return;
    }

    setError("");
    setIsLoading(true);
    setQuiz(null);
    setReviewMode(false);
    setEditableQuiz(null);

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookTitle: book.title, difficulty, bookLevel: resolvedBookLevel, learningGoal }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to generate quiz.");
      }

      const data = await response.json();
      const quizData = data.quiz;

      if (mode === "parent" && typeof quizData === "object" && quizData.questions) {
        setEditableQuiz(quizData);
        setReviewMode(true);
      } else {
        setQuiz(quizData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveQuestion = (index: number) => {
    if (!editableQuiz) return;
    const updatedQuestions = editableQuiz.questions.filter((_, i) => i !== index);
    setEditableQuiz({ ...editableQuiz, questions: updatedQuestions });
  };

  const handleApproveQuiz = () => {
    if (!editableQuiz) return;
    // Store the approved quiz in localStorage for the child to access
    localStorage.setItem("approvedQuiz", JSON.stringify({
      ...editableQuiz,
      bookTitle: confirmedBook?.title || bookTitle,
      difficulty,
      bookLevel,
      learningGoal,
      rewardPlan,
      pointEstimate,
    }));
    // Redirect to quiz page
    router.push("/quiz?fromParent=true");
  };

  const renderQuiz = (quizData: QuizData | string) => {
    if (typeof quizData === "string") {
      return <pre>{quizData}</pre>;
    }

    return (
      <div>
        <h3>{quizData.quizTitle}</h3>
        <p>{quizData.quizDescription}</p>
        <p>Questions: {quizData.questions.length}</p>
        <button onClick={() => router.push("/quiz")}>Take Quiz</button>
      </div>
    );
  };

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Quiz Workshop</div>
          <h1>Reading Quest</h1>
          <p>
            Create AI-generated book quizzes for kids and manage learning goals, difficulty, and reward plans.
          </p>
        </div>
      </div>

      <div className="field">
        <label>Mode</label>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setMode("child")}
            style={{ background: mode === "child" ? "#2563eb" : "#d1d5db" }}
          >
            Child
          </button>
          <button
            type="button"
            onClick={() => setMode("parent")}
            style={{ background: mode === "parent" ? "#2563eb" : "#d1d5db" }}
          >
            Parent
          </button>
        </div>
      </div>

      {mode === "parent" && !reviewMode ? (
        <div className="output">
          <h2>Parent Dashboard</h2>
          <p>Set the learning goal and book level to influence quiz style and point rewards.</p>

          <div className="field">
            <label htmlFor="learningGoal">Learning goal</label>
            <select
              id="learningGoal"
              value={learningGoal}
              onChange={(event) => setLearningGoal(event.target.value)}
            >
              {learningGoals.map((goal) => (
                <option key={goal.value} value={goal.value}>
                  {goal.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="bookLevel">Book reading level</label>
            <select
              id="bookLevel"
              value={bookLevel}
              onChange={(event) => {
                const nextLevel = event.target.value as BookLevel;
                setBookLevel(nextLevel);
                if (!isDifficultyAllowedForBookLevel(difficulty, nextLevel)) {
                  setDifficulty(getAllowedDifficulties(nextLevel)[0]);
                }
              }}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="rewardPlan">Reward plan</label>
            <textarea
              id="rewardPlan"
              value={rewardPlan}
              onChange={(event) => setRewardPlan(event.target.value)}
              placeholder="e.g. 50 points = extra screen time"
              rows={4}
            />
          </div>

          <p style={{ marginTop: 0 }}>
            Use this mode to review and approve quizzes before your child takes them.
          </p>
        </div>
      ) : null}

      {reviewMode && editableQuiz ? (
        <div className="output">
          <h2>Review Quiz Questions</h2>
          <p>Remove any questions you don't want your child to see.</p>
          <h3>{editableQuiz.quizTitle}</h3>
          <p>{editableQuiz.quizDescription}</p>
          <div>
            {editableQuiz.questions.map((q, index) => (
              <div key={index} style={{ marginBottom: "20px", border: "1px solid #ccc", padding: "10px" }}>
                <p><strong>Question {index + 1}:</strong> {q.question}</p>
                <ul>
                  {q.choices.map((choice, i) => (
                    <li key={i} style={{ color: i === q.answerIndex ? "green" : "black" }}>
                      {choice} {i === q.answerIndex ? "(Correct)" : ""}
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleRemoveQuestion(index)} style={{ background: "#dc2626", color: "white" }}>
                  Remove Question
                </button>
              </div>
            ))}
          </div>
          <p>Questions remaining: {editableQuiz.questions.length}</p>
          <button onClick={handleApproveQuiz} disabled={editableQuiz.questions.length === 0}>
            Approve Quiz for Child
          </button>
          <button onClick={() => setReviewMode(false)} style={{ marginLeft: "10px" }}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="bookTitle">Book title</label>
        <input
          id="bookTitle"
          type="text"
          value={bookTitle}
          onChange={(event) => {
            setBookTitle(event.target.value);
            setConfirmedBook(null);
            setBookOptions([]);
            setBookLookupMessage("");
            setShowIsbnFallback(false);
          }}
          placeholder="e.g. Charlotte's Web"
        />
      </div>

      <div className="book-check-panel">
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            onClick={() => lookupBook({ bookTitle })}
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
              <button type="button" onClick={() => lookupBook({ isbn })} disabled={isCheckingBook || !isbn.trim()}>
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

      <div className="field">
        <label htmlFor="difficulty">Difficulty</label>
        <select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as "easy" | "medium" | "hard")}>
          {allowedDifficulties.map((level) => (
            <option key={level} value={level}>
              {level === "easy" ? "Easy - 5 questions, 10 base points" : level === "medium" ? "Medium - 10 questions, 40 base points" : "Hard - 20 questions, 100 base points"}
            </option>
          ))}
        </select>
        <p className="setting-description">
          {bookLevel === "beginner"
            ? "Beginner books can only be tested on Easy."
            : bookLevel === "intermediate"
              ? "Intermediate books can be tested on Easy or Medium."
              : "Advanced books can be tested on Easy, Medium, or Hard."}
        </p>
      </div>

      <div className="field">
        <label htmlFor="bookLevel">Book reading level</label>
        <select
          id="bookLevel"
          value={bookLevel}
          onChange={(event) => {
            const nextLevel = event.target.value as BookLevel;
            setBookLevel(nextLevel);
            if (!isDifficultyAllowedForBookLevel(difficulty, nextLevel)) {
              setDifficulty(getAllowedDifficulties(nextLevel)[0]);
            }
          }}
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        {isDetectingLevel ? (
          <p className="notice">Detecting reading level...</p>
        ) : confirmedBook ? (
          <p className="success-box">Reading level detected: {bookLevel}</p>
        ) : null}
      </div>

      <div className="field">
        <label htmlFor="learningGoal">Learning goal</label>
        <select id="learningGoal" value={learningGoal} onChange={(event) => setLearningGoal(event.target.value)}>
          {learningGoals.map((goal) => (
            <option key={goal.value} value={goal.value}>
              {goal.label}
            </option>
          ))}
        </select>
      </div>

      <button onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? "Generating quiz..." : "Generate quiz"}
      </button>

      {error ? (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {quiz && !reviewMode ? (
        <div className="output">
          <h2>Your quiz</h2>
          <p>
            Estimated points: <strong>{pointEstimate}</strong>
          </p>
          {renderQuiz(quiz)}
        </div>
      ) : null}
    </main>
  );
}
