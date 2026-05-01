"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  getRetakeStatus,
  Profile,
  updateProfile,
} from "../../lib/user";
import { getBookRecommendations } from "../../lib/recommendations";
import type { BookLookupResult, BookMatch } from "../../lib/books";

export default function MyBooksPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [favoriteBooks, setFavoriteBooks] = useState(["", "", ""]);
  const [confirmedFavorites, setConfirmedFavorites] = useState<Array<BookMatch | null>>([null, null, null]);
  const [favoriteOptions, setFavoriteOptions] = useState<BookMatch[][]>([[], [], []]);
  const [favoriteIsbns, setFavoriteIsbns] = useState(["", "", ""]);
  const [favoriteLookupMessages, setFavoriteLookupMessages] = useState(["", "", ""]);
  const [showFavoriteIsbnFallback, setShowFavoriteIsbnFallback] = useState([false, false, false]);
  const [checkingFavoriteIndex, setCheckingFavoriteIndex] = useState<number | null>(null);
  const [favoriteSaveMessage, setFavoriteSaveMessage] = useState("");
  const [editingFavorites, setEditingFavorites] = useState(false);
  const [suggestionRotation, setSuggestionRotation] = useState(0);

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile) {
      router.push("/");
      return;
    }

    setCurrentUser(profile);
    if (profile.favoriteBooks?.length === 3) {
      setFavoriteBooks(profile.favoriteBooks);
      setConfirmedFavorites(profile.favoriteBooks.map((title) => ({
        id: title,
        title,
        author: "Saved favorite",
      })));
    }
  }, [router]);

  const handleFavoriteBookChange = (index: number, value: string) => {
    setFavoriteBooks((current) => current.map((title, idx) => idx === index ? value : title));
    setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
    setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
    setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index ? "" : message));
    setShowFavoriteIsbnFallback((current) => current.map((show, idx) => idx === index ? false : show));
    setFavoriteSaveMessage("");
  };

  const applyFavoriteBook = (index: number, book: BookMatch) => {
    setFavoriteBooks((current) => current.map((title, idx) => idx === index ? book.title : title));
    setConfirmedFavorites((current) => current.map((item, idx) => idx === index ? book : item));
    setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
    setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index ? "" : message));
    setShowFavoriteIsbnFallback((current) => current.map((show, idx) => idx === index ? false : show));
    setFavoriteIsbns((current) => current.map((value, idx) => idx === index ? "" : value));
  };

  const lookupFavoriteBook = async (index: number, payload: { bookTitle?: string; isbn?: string }) => {
    setCheckingFavoriteIndex(index);
    setFavoriteSaveMessage("");

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
        applyFavoriteBook(index, data.books[0]);
        return data.books[0];
      }

      if (data.status === "options") {
        setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
        setFavoriteOptions((current) => current.map((options, idx) => idx === index ? data.books : options));
        setShowFavoriteIsbnFallback((current) => current.map((show, idx) => idx === index ? false : show));
        setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index ? "We found a few possible matches. Which book did you mean?" : message));
        return null;
      }

      setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
      setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
      setShowFavoriteIsbnFallback((current) => current.map((show, idx) => idx === index ? !payload.isbn : show));
      setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index
        ? payload.isbn
          ? "Sorry, we still could not find that book. Please try another book title."
          : "We could not find that book by title. Try the ISBN, or enter a different book."
        : message));
      return null;
    } catch (err) {
      setFavoriteSaveMessage(err instanceof Error ? err.message : "Failed to look up favorite book.");
      return null;
    } finally {
      setCheckingFavoriteIndex(null);
    }
  };

  const ensureFavoriteConfirmed = async (index: number) => {
    const title = favoriteBooks[index].trim();
    const confirmed = confirmedFavorites[index];
    if (confirmed && confirmed.title === title) {
      return confirmed;
    }
    return title ? lookupFavoriteBook(index, { bookTitle: title }) : null;
  };

  const saveFavoriteBooks = async () => {
    if (!currentUser) return;

    const books = favoriteBooks.map((book) => book.trim()).filter(Boolean);
    if (books.length < 3) {
      setFavoriteSaveMessage("Please enter three favorite books.");
      return;
    }

    const confirmedBooks: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const book = await ensureFavoriteConfirmed(index);
      if (!book) {
        setFavoriteSaveMessage(`Please choose a matching book for favorite book ${index + 1}.`);
        return;
      }
      confirmedBooks.push(book.title);
    }

    const updated = updateProfile({ ...currentUser, favoriteBooks: confirmedBooks });
    setCurrentUser(updated);
    setFavoriteBooks(confirmedBooks);
    setFavoriteSaveMessage("Saved your reading interests!");
    setEditingFavorites(false);
  };

  const recommendationData = useMemo(() => {
    const favorites = currentUser?.favoriteBooks?.length === 3 ? currentUser.favoriteBooks : favoriteBooks.filter(Boolean);
    return getBookRecommendations({
      profile: currentUser,
      favoriteBooks: favorites,
      rotationOffset: suggestionRotation,
      limit: 5,
    });
  }, [currentUser, favoriteBooks, suggestionRotation]);

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

  if (!currentUser) {
    return <main><p>Loading...</p></main>;
  }

  const hasFavoriteBooks = currentUser.favoriteBooks?.length === 3;
  const favoriteList = hasFavoriteBooks ? currentUser.favoriteBooks ?? [] : favoriteBooks.filter(Boolean);
  const homeHref = currentUser.isParent ? "/parent" : "/home";

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Library</div>
          <h1>My Books</h1>
          <p>Favorites, recommendations, and books you have tested.</p>
        </div>
        <Link href={homeHref}>
          <button type="button" className="secondary">Home</button>
        </Link>
      </div>

      <section className="home-section" aria-labelledby="favorite-books-heading">
        <h2 id="favorite-books-heading">Favorite Books</h2>
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
            <p>Choose three favorite books so Reading Quest can recommend more.</p>
            {favoriteBooks.map((book, index) => (
              <div key={index} className="field">
                <label htmlFor={`favoriteBook-${index}`}>Favorite book {index + 1}</label>
                <input
                  id={`favoriteBook-${index}`}
                  value={book}
                  onChange={(event) => handleFavoriteBookChange(index, event.target.value)}
                  placeholder={`Favorite book ${index + 1}`}
                />
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => lookupFavoriteBook(index, { bookTitle: favoriteBooks[index] })}
                    disabled={checkingFavoriteIndex !== null || !favoriteBooks[index].trim()}
                  >
                    {checkingFavoriteIndex === index ? "Checking..." : "Check book"}
                  </button>
                </div>

                {confirmedFavorites[index] ? (
                  <div className="confirmed-book">
                    <strong>Using: {confirmedFavorites[index]?.title}</strong>
                    <span>{confirmedFavorites[index]?.author}</span>
                  </div>
                ) : null}

                {favoriteLookupMessages[index] ? (
                  <div className={showFavoriteIsbnFallback[index] ? "warning-box" : "notice"}>
                    {favoriteLookupMessages[index]}
                  </div>
                ) : null}

                {favoriteOptions[index].length > 0 ? (
                  <div className="book-option-grid">
                    {favoriteOptions[index].map((option) => (
                      <button key={option.id} type="button" className="book-option" onClick={() => applyFavoriteBook(index, option)}>
                        {option.coverUrl ? <img className="book-cover" src={option.coverUrl} alt="" /> : <span className="book-cover-placeholder">No cover</span>}
                        <span>
                          <strong>{option.title}</strong>
                          <span>{option.author}{option.year ? ` - ${option.year}` : ""}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {showFavoriteIsbnFallback[index] ? (
                  <div className="field">
                    <label htmlFor={`favoriteIsbn-${index}`}>ISBN</label>
                    <input
                      id={`favoriteIsbn-${index}`}
                      value={favoriteIsbns[index]}
                      onChange={(event) => setFavoriteIsbns((current) => current.map((value, idx) => idx === index ? event.target.value : value))}
                      placeholder="9780064404990"
                    />
                    <p className="setting-description">Tip: Look near the barcode or on the copyright page.</p>
                    <button type="button" onClick={() => lookupFavoriteBook(index, { isbn: favoriteIsbns[index] })}>
                      Check ISBN
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <div className="button-row">
              <button type="button" onClick={saveFavoriteBooks} disabled={checkingFavoriteIndex !== null}>
                Save interests
              </button>
              {hasFavoriteBooks ? (
                <button type="button" className="secondary" onClick={() => setEditingFavorites(false)}>
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}
        {favoriteSaveMessage ? <div className={favoriteSaveMessage.includes("Saved") ? "success-box" : "error-box"}>{favoriteSaveMessage}</div> : null}
      </section>

      <section className="home-section" aria-labelledby="recommended-heading">
        <div className="section-header-row">
          <div>
            <h2 id="recommended-heading">Recommended Reads</h2>
            <p className="setting-description">{recommendationData.updatedLabel}</p>
          </div>
          <button type="button" className="secondary" onClick={() => setSuggestionRotation((current) => current + 1)}>
            New picks
          </button>
        </div>
        <p>{recommendationData.summary}</p>
        <ul className="small-list">
          {recommendationData.suggestions.map((title) => (
            <li key={title}>{title}</li>
          ))}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="tested-heading">
        <h2 id="tested-heading">Books Tested</h2>
        {recentBooks.length > 0 ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Score</th>
                  <th>Difficulty</th>
                  <th>Retake</th>
                </tr>
              </thead>
              <tbody>
                {recentBooks.map((quiz) => {
                  const retakeStatus = getRetakeStatus(currentUser, quiz.bookTitle);
                  return (
                    <tr key={quiz.bookTitle}>
                      <td>{quiz.bookTitle}</td>
                      <td>{quiz.score} / {quiz.maxScore}</td>
                      <td>{quiz.difficulty}</td>
                      <td>
                        {retakeStatus.available && retakeStatus.nextDifficulty ? (
                          <Link href={`/quiz?bookTitle=${encodeURIComponent(quiz.bookTitle)}&difficulty=${encodeURIComponent(retakeStatus.nextDifficulty)}&bookLevel=${encodeURIComponent(quiz.bookLevel)}`}>
                            <button type="button" className="action-button small secondary">{retakeStatus.waitText}</button>
                          </Link>
                        ) : (
                          <span>{retakeStatus.waitText}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No books tested yet.</p>
        )}
      </section>
    </main>
  );
}
