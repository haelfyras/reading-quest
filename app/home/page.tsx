"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getCurrentProfile,
  getRetakeStatus,
  Profile,
  updateProfile,
  setCurrentUserId,
} from "../../lib/user";

export default function HomePage() {
  const router = useRouter();
  type PrizeGoal = {
    id: string;
    name: string;
    pointsRequired: number;
  };

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [favoriteBooks, setFavoriteBooks] = useState(["", "", ""]);
  const [favoriteSaveMessage, setFavoriteSaveMessage] = useState("");
  const [editingFavorites, setEditingFavorites] = useState(false);

  const defaultPrizeGoals: PrizeGoal[] = [
    { id: "1", name: "Buy a new book", pointsRequired: 100 },
    { id: "2", name: "TV/Movie Time", pointsRequired: 250 },
    { id: "3", name: "Buy a new toy", pointsRequired: 500 },
    { id: "4", name: "Library trip", pointsRequired: 750 },
    { id: "5", name: "Special badge", pointsRequired: 1000 },
  ];

  const prizeGoals = useMemo(() => {
    if (!currentUser) {
      return defaultPrizeGoals;
    }

    if (typeof window === "undefined") {
      return defaultPrizeGoals;
    }

    const saved = localStorage.getItem(`readingQuestPrizes_${currentUser.id}`);
    if (!saved) {
      return defaultPrizeGoals;
    }

    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
      return defaultPrizeGoals;
    } catch {
      return defaultPrizeGoals;
    }
  }, [currentUser]);

  const currentPoints = currentUser?.points ?? 0;
  const progressMax = Math.max(currentPoints, ...prizeGoals.map((goal) => goal.pointsRequired));
  const fillPercent = progressMax ? Math.min(100, (currentPoints / progressMax) * 100) : 0;
  const nextPrizeGoal = prizeGoals.find((goal) => goal.pointsRequired > currentPoints);
  const pointsToNextPrize = nextPrizeGoal ? nextPrizeGoal.pointsRequired - currentPoints : 0;

  useEffect(() => {
    const profile = getCurrentProfile();
    
    if (!profile) {
      router.push("/");
      return;
    }

    if (profile.isParent) {
      router.push("/parent");
      return;
    }

    setCurrentUser(profile);

    if (profile?.favoriteBooks?.length === 3) {
      setFavoriteBooks(profile.favoriteBooks);
    }
  }, [router]);

  const handleSignOut = () => {
    setCurrentUserId(null);
    router.push("/");
  };

  const handleFavoriteBookChange = (index: number, value: string) => {
    setFavoriteBooks((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setFavoriteSaveMessage("");
  };

  const saveFavoriteBooks = () => {
    if (!currentUser) return;

    const books = favoriteBooks.map((book) => book.trim()).filter(Boolean);
    if (books.length < 3) {
      setFavoriteSaveMessage("Please enter three favorite books.");
      return;
    }

    const updated = updateProfile({ ...currentUser, favoriteBooks: books });
    setCurrentUser(updated);
    setFavoriteBooks(books);
    setFavoriteSaveMessage("Saved your reading interests!");
    setEditingFavorites(false);
  };

  const hasFavoriteBooks = currentUser?.favoriteBooks?.length === 3;
  const favoriteList = currentUser?.favoriteBooks?.length === 3 ? currentUser.favoriteBooks : favoriteBooks.filter(Boolean);

  const recommendationData = useMemo(() => {
    const favorites = currentUser?.favoriteBooks?.length === 3 ? currentUser.favoriteBooks : favoriteBooks.filter(Boolean);
    const quizTitles = currentUser?.quizzes.map((quiz) => quiz.bookTitle) ?? [];
    const combinedText = [...favorites, ...quizTitles].join(" ").toLowerCase();

    const categories = new Set<string>();
    const addCategory = (pattern: RegExp, category: string) => {
      if (pattern.test(combinedText)) categories.add(category);
    };

    addCategory(/\b(fantasy|dragon|wizard|magic|kingdom|princess|castle)\b/, "fantasy");
    addCategory(/\b(children|child|kids|kids'|picture book|beginner|early reader)\b/, "children's books");
    addCategory(/\b(mystery|detective|secret|clue|spy|investigation)\b/, "mystery");
    addCategory(/\b(science fiction|sci[- ]?fi|space|robot|alien|future)\b/, "science fiction");
    addCategory(/\b(adventure|quest|journey|explorer|treasure|pirate)\b/, "adventure");

    if (categories.size === 0 && combinedText.trim()) {
      categories.add("great stories");
    }

    const suggestionPools: Record<string, string[]> = {
      fantasy: ["The Neverending Story", "The Dragon of the Lost Sea", "Ella Enchanted", "The Lion, the Witch and the Wardrobe", "How to Train Your Dragon"],
      "children's books": ["Charlotte's Web", "The Tale of Despereaux", "The Magic Tree House", "The Lion & the Mouse", "Where the Wild Things Are"],
      mystery: ["The Boxcar Children", "Encyclopedia Brown", "The Westing Game", "Nancy Drew and the Clue Crew", "The Secret Garden"],
      "science fiction": ["A Wrinkle in Time", "The Wild Robot", "The City of Ember", "Space Case", "The Last Kids on Earth"],
      adventure: ["Percy Jackson and the Lightning Thief", "The Adventures of Tintin", "The Hobbit", "Island of the Blue Dolphins", "Treasure Island"],
      "great stories": ["Matilda", "The Chronicles of Narnia", "Stuart Little", "Holes", "James and the Giant Peach"],
    };

    const suggestions: string[] = [];
    for (const category of Array.from(categories).slice(0, 3)) {
      suggestions.push(...(suggestionPools[category] ?? []));
    }

    const uniqueSuggestions = Array.from(new Set(suggestions));
    while (uniqueSuggestions.length < 5) {
      uniqueSuggestions.push(...["Matilda", "Charlotte's Web", "The Magic Tree House", "The Lion, the Witch and the Wardrobe", "Harry Potter and the Sorcerer's Stone"].filter((book) => !uniqueSuggestions.includes(book)));
    }

    const finalSuggestions = uniqueSuggestions.slice(0, 5);
    const summaryCategories = Array.from(categories).slice(0, 2);
    const interestText = summaryCategories.length > 0 ? summaryCategories.join(" and ") : "great stories";
    const summary = currentUser?.quizzes.length
      ? `You seem to like ${interestText}! Based on your interests and the books you've tested so far, you might enjoy: ${finalSuggestions.join(", ")}.`
      : `You seem to like ${interestText}! Based on your interests, you might enjoy: ${finalSuggestions.join(", ")}.`;

    return {
      summary,
      suggestions: uniqueSuggestions,
      categories: summaryCategories,
    };
  }, [currentUser, favoriteBooks]);

  const recentBooks = useMemo(() => {
    if (!currentUser) return [];

    const latestByBook = new Map<string, typeof currentUser.quizzes[0]>();
    currentUser.quizzes
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((quiz) => {
        const key = quiz.bookTitle.trim().toLowerCase();
        if (!latestByBook.has(key)) {
          latestByBook.set(key, quiz);
        }
      });

    return Array.from(latestByBook.values());
  }, [currentUser]);

  const pointsProgressData = useMemo(() => {
    if (!currentUser) return [];

    const sorted = [...currentUser.quizzes].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let cumulativePoints = 0;
    return sorted.map((quiz, index) => {
      cumulativePoints += quiz.score;
      return {
        quizNumber: index + 1,
        points: cumulativePoints,
        date: new Date(quiz.date).toLocaleDateString(),
      };
    });
  }, [currentUser]);

  if (!currentUser) {
    return (
      <main>
        <p>Redirecting to login...</p>
      </main>
    );
  }

  return (
    <main>
      <div className="topbar home-topbar">
        <div>
          <h1>Reading Quest</h1>
          <p>Welcome back, {currentUser.name}! You have {currentUser.points} points.</p>
        </div>
        <div className="topbar-actions">
          <Link href="/settings">
            <button type="button">Settings</button>
          </Link>
          <button type="button" className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="points-panel">
        <div className="points-panel-header">
          <div>
            <h2>Points to next prize</h2>
            <p>
              {currentPoints} points earned {nextPrizeGoal ? `• ${pointsToNextPrize} points to ${nextPrizeGoal.name}` : "• All prize goals reached!"}
            </p>
          </div>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${fillPercent}%` }} />
          {prizeGoals.map((goal) => (
            <div
              key={goal.id}
              className="progress-marker"
              title={`${goal.name} — ${goal.pointsRequired} points`}
              style={{ left: `${Math.min(100, (goal.pointsRequired / progressMax) * 100)}%` }}
            >
              <span>{goal.pointsRequired}</span>
              <small>{goal.name}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="home-section">
        <h2>Menu</h2>
        <div className="menu-grid">
          <Link href="/quiz">
            <button type="button" className="menu-button primary">
              📚 Start a Quiz
            </button>
          </Link>
          <Link href="/leaderboards">
            <button type="button" className="menu-button secondary">
              🏆 Leaderboards
            </button>
          </Link>
          <Link href="/prizes">
            <button type="button" className="menu-button accent">
              🎁 My Prizes
            </button>
          </Link>
          <Link href="/review">
            <button type="button" className="menu-button neutral">
              📝 Reviews
            </button>
          </Link>
        </div>
      </div>

      <div className="home-section recommendation-panel">
        <div className="favorite-panel">
          <h2>Your Favorite Books</h2>
          {hasFavoriteBooks && !editingFavorites ? (
            <>
              <ul className="favorite-books-list">
                {favoriteList.map((title, index) => (
                  <li key={index}>{title}</li>
                ))}
              </ul>
              <button type="button" className="secondary" onClick={() => setEditingFavorites(true)}>
                Update favorites
              </button>
            </>
          ) : (
            <>
              <p>Tell us three books you love so we can recommend more for you.</p>
              {favoriteBooks.map((book, index) => (
                <div key={index} className="field">
                  <label htmlFor={`favoriteBook-${index}`}>Favorite book {index + 1}</label>
                  <input
                    id={`favoriteBook-${index}`}
                    value={book}
                    onChange={(event) => handleFavoriteBookChange(index, event.target.value)}
                    placeholder={`e.g. Favorite book ${index + 1}`}
                  />
                </div>
              ))}
              <div className="button-row">
                <button type="button" onClick={saveFavoriteBooks}>
                  Save interests
                </button>
                {hasFavoriteBooks && (
                  <button type="button" className="secondary" onClick={() => setEditingFavorites(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
          {favoriteSaveMessage ? (
            <div
              className="output"
              style={{
                marginTop: 16,
                padding: 12,
                background: favoriteSaveMessage.includes("Please") ? "#fee2e2" : "#d1fae4",
                color: favoriteSaveMessage.includes("Please") ? "#991b1b" : "#065f46",
              }}
            >
              {favoriteSaveMessage}
            </div>
          ) : null}
        </div>

        <div className="recommendation-panel-right">
          <h2>Recommended Reads</h2>
          <p>{recommendationData.summary}</p>
          <ul>
            {recommendationData.suggestions.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="home-grid">

        {pointsProgressData.length > 0 && (
          <div className="home-section">
            <h2>Your Points Progress</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={pointsProgressData} margin={{ top: 20, right: 20, bottom: 40, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="quizNumber"
                  label={{ value: "Quiz Number", position: "bottom", offset: 20 }}
                  tickMargin={10}
                />
                <YAxis
                  label={{ value: "Total Points", angle: -90, position: "left", offset: 0 }}
                  tickMargin={10}
                />
                <Tooltip formatter={(value) => `${value} points`} />
                <Line type="monotone" dataKey="points" stroke="#2563eb" strokeWidth={2} dot={{ fill: "#2563eb" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {recentBooks.length > 0 && (
          <div className="home-section">
            <h2>Books Tested</h2>
            <table>
              <thead>
                <tr>
                  <th>Book Title</th>
                  <th>Score</th>
                  <th>Difficulty</th>
                  <th>Level</th>
                  <th>Last Tested</th>
                  <th>Retake</th>
                </tr>
              </thead>
              <tbody>
                {recentBooks.map((quiz) => {
                  const lastDate = new Date(quiz.date);
                  const retakeStatus = getRetakeStatus(currentUser, quiz.bookTitle);
                  return (
                    <tr key={quiz.bookTitle}>
                      <td>{quiz.bookTitle}</td>
                      <td>
                        {quiz.score} / {quiz.maxScore}
                      </td>
                      <td>{quiz.difficulty}</td>
                      <td>{quiz.bookLevel}</td>
                      <td>{lastDate.toLocaleDateString()}</td>
                              <td>
                        {retakeStatus.available && retakeStatus.nextDifficulty ? (
                          <Link
                            href={`/quiz?bookTitle=${encodeURIComponent(quiz.bookTitle)}&difficulty=${encodeURIComponent(
                              retakeStatus.nextDifficulty,
                            )}&bookLevel=${encodeURIComponent(quiz.bookLevel)}`}
                          >
                            <button type="button" className="action-button secondary" style={{ padding: "8px 12px", fontSize: "0.9rem" }}>
                              {retakeStatus.waitText}
                            </button>
                          </Link>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>
                            {retakeStatus.waitText}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
