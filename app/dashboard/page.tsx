"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const difficultyPoints = {
  easy: 10,
  medium: 20,
  hard: 30,
};

const levelBonus = {
  beginner: 0,
  intermediate: 5,
  advanced: 10,
};

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
  const [difficulty, setDifficulty] = useState<keyof typeof difficultyPoints>("easy");
  const [bookLevel, setBookLevel] = useState<keyof typeof levelBonus>("beginner");
  const [learningGoal, setLearningGoal] = useState("basic_comprehension");
  const [rewardPlan, setRewardPlan] = useState("");
  const [quiz, setQuiz] = useState<QuizData | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewMode, setReviewMode] = useState(false);
  const [editableQuiz, setEditableQuiz] = useState<QuizData | null>(null);

  const pointEstimate = difficultyPoints[difficulty] + levelBonus[bookLevel];

  const handleGenerate = async () => {
    if (!bookTitle.trim()) {
      setError("Please enter a book title.");
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
        body: JSON.stringify({ bookTitle, difficulty, bookLevel, learningGoal }),
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
      bookTitle,
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
      <h1>Reading Quest</h1>
      <p>
        Create AI-generated book quizzes for kids and manage learning goals, difficulty, and reward plans.
      </p>

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
              onChange={(event) => setBookLevel(event.target.value as keyof typeof levelBonus)}
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
          onChange={(event) => setBookTitle(event.target.value)}
          placeholder="e.g. Charlotte's Web"
        />
      </div>

      <div className="field">
        <label htmlFor="difficulty">Difficulty</label>
        <select id="difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value as keyof typeof difficultyPoints)}>
          <option value="easy">Easy — {difficultyPoints.easy} points</option>
          <option value="medium">Medium — {difficultyPoints.medium} points</option>
          <option value="hard">Hard — {difficultyPoints.hard} points</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="bookLevel">Book reading level</label>
        <select id="bookLevel" value={bookLevel} onChange={(event) => setBookLevel(event.target.value as keyof typeof levelBonus)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
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
        {isLoading ? "Generating quiz…" : "Generate quiz"}
      </button>

      {error ? (
        <div className="output" style={{ background: "#fee2e2", color: "#991b1b" }}>
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