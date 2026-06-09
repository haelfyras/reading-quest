"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeroProfileActions from "../components/HeroProfileActions";
import {
  getBadges,
  getCurrentProfile,
  getForgivingStreak,
  getLifetimePoints,
  getReviewsForBook,
  getSpendablePoints,
  Profile,
  saveReadingNow,
  updateProfile,
} from "../../lib/user";
import { getBookRecommendations } from "../../lib/recommendations";
import type { BookMatch } from "../../lib/books";
import { lookupBook as lookupBookFromApi, type BookLookupPayload } from "../../lib/bookClient";
import {
  buildBookMeta,
  getProfileBookMetadata,
  normalizeBookKey,
  withBookMetadata,
  type BookMetadataMap,
  type StoredBookMeta,
} from "../../lib/bookMetadata";
import { emptyReadingPreferences, preferencePrompts, type PreferenceKey } from "../../lib/readingPreferences";
import { getHotStreakImageSrc, getShelfImageSrc, getStoredThemeStyle, type ThemeStyle } from "../../lib/themeAssets";

type BookShelfTarget = "readLibrary" | "currentlyReading" | "wantToRead" | "favorites";
type ShelfView = "reading" | "ready" | "want" | "finished" | "favorites";

const MAX_FAVORITES = 5;
const shelfViews: Array<{ id: ShelfView; label: string }> = [
  { id: "reading", label: "Reading Now" },
  { id: "ready", label: "Ready for Quiz" },
  { id: "want", label: "Want To Read" },
  { id: "finished", label: "Finished" },
  { id: "favorites", label: "Favorites" },
];

function getBookMetaStorageKey(profileId: string) {
  return `readingQuestBookMeta_${profileId}`;
}

function getWantToReadStorageKey(profileId: string) {
  return `readingQuestWantToRead_${profileId}`;
}

function getReadLibraryStorageKey(profileId: string) {
  return `readingQuestReadLibrary_${profileId}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function findLatestQuiz(profile: Profile, title: string) {
  const key = normalizeBookKey(title);
  return profile.quizzes
    .filter((quiz) => normalizeBookKey(quiz.bookTitle) === key)
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

function formatDate(value?: string) {
  if (!value) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function getRatingForBook(title: string) {
  const reviews = getReviewsForBook(title);
  if (!reviews.length) return 0;
  return Math.round(reviews.reduce((total, review) => total + review.rating, 0) / reviews.length);
}

function BookCover({ meta, title }: { meta?: StoredBookMeta; title: string }) {
  const [coverFailed, setCoverFailed] = useState(false);
  if (meta?.coverUrl && !coverFailed) {
    return <img className="shelf-book-cover" src={meta.coverUrl} alt="" onError={() => setCoverFailed(true)} />;
  }

  return (
    <div className="shelf-book-cover generated-cover" aria-label={`Generated cover for ${title}`}>
      <span>{title}</span>
      {meta?.author ? <small>{meta.author}</small> : null}
    </div>
  );
}

function BookOptionCover({ book }: { book: BookMatch }) {
  const [coverFailed, setCoverFailed] = useState(false);
  if (book.coverUrl && !coverFailed) {
    return <img className="book-cover" src={book.coverUrl} alt="" onError={() => setCoverFailed(true)} />;
  }

  return (
    <span className="book-cover-placeholder generated-option-cover">
      <span>{book.title}</span>
    </span>
  );
}

export default function MyBooksPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [bookMeta, setBookMeta] = useState<BookMetadataMap>({});
  const [readLibrary, setReadLibrary] = useState<string[]>([]);
  const [wantToRead, setWantToRead] = useState<string[]>([]);
  const [favoriteSaveMessage, setFavoriteSaveMessage] = useState("");
  const [shelfMessage, setShelfMessage] = useState("");
  const [suggestionRotation, setSuggestionRotation] = useState(0);
  const [modalTarget, setModalTarget] = useState<BookShelfTarget | null>(null);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [searchIsbn, setSearchIsbn] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [searchOptions, setSearchOptions] = useState<BookMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBookTitle, setSelectedBookTitle] = useState<string | null>(null);
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>("library");
  const [activeShelf, setActiveShelf] = useState<ShelfView>("reading");
  const [readingPreferences, setReadingPreferences] = useState(emptyReadingPreferences);
  const [preferenceSaveMessage, setPreferenceSaveMessage] = useState("");

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile) {
      router.push("/");
      return;
    }

    setCurrentUser(profile);
    setThemeStyle(getStoredThemeStyle());
    const storedMeta = readJson<BookMetadataMap>(getBookMetaStorageKey(profile.id), {});
    const profileMeta = getProfileBookMetadata(profile);
    const mergedMeta = { ...profileMeta, ...storedMeta };
    setBookMeta(mergedMeta);
    if (Object.keys(storedMeta).length > 0) {
      const updated = updateProfile({
        ...profile,
        bookAccess: withBookMetadata(profile.bookAccess, mergedMeta),
      });
      setCurrentUser(updated);
    }
    setReadLibrary(readJson<string[]>(getReadLibraryStorageKey(profile.id), []));
    setWantToRead(readJson<string[]>(getWantToReadStorageKey(profile.id), []));
    setReadingPreferences({
      ...emptyReadingPreferences,
      ...(profile.readingPreferences ?? {}),
    });
  }, [router]);

  useEffect(() => {
    const refreshTheme = () => setThemeStyle(getStoredThemeStyle());
    window.addEventListener("storage", refreshTheme);
    window.addEventListener("readingQuestProfileUpdated", refreshTheme);
    return () => {
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("readingQuestProfileUpdated", refreshTheme);
    };
  }, []);

  const homeHref = currentUser?.isParent ? "/parent" : "/home";
  const favoriteBooks = currentUser?.favoriteBooks ?? [];
  const currentlyReading = currentUser?.readingNow ?? [];
  const finishedBooks = useMemo(() => {
    if (!currentUser) return [];
    const latestByBook = new Map<string, typeof currentUser.quizzes[0]>();
    currentUser.quizzes
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach((quiz) => {
        const key = normalizeBookKey(quiz.bookTitle);
        if (!latestByBook.has(key)) latestByBook.set(key, quiz);
      });
    return Array.from(latestByBook.values());
  }, [currentUser]);

  const recommendationData = useMemo(() => {
    return getBookRecommendations({
      profile: currentUser,
      favoriteBooks,
      rotationOffset: suggestionRotation,
      limit: 8,
    });
  }, [currentUser, favoriteBooks, suggestionRotation]);

  const streak = currentUser ? getForgivingStreak(currentUser) : { activeDaysThisWeek: 0, goalDays: 4, metThisWeek: false };
  const badges = currentUser ? getBadges(currentUser) : [];
  const totalPassed = currentUser?.quizzes.filter((quiz) => quiz.score / Math.max(quiz.maxScore, 1) >= 0.6).length ?? 0;
  const totalEarned = currentUser ? getLifetimePoints(currentUser) : 0;
  const selectedBookQuiz = selectedBookTitle && currentUser ? findLatestQuiz(currentUser, selectedBookTitle) : null;
  const selectedBookReviews = selectedBookTitle ? getReviewsForBook(selectedBookTitle) : [];
  const conqueredBookKeys = useMemo(() => new Set(finishedBooks.map((quiz) => normalizeBookKey(quiz.bookTitle))), [finishedBooks]);
  const libraryBooks = useMemo(() => {
    return readLibrary.filter((title) => !conqueredBookKeys.has(normalizeBookKey(title)));
  }, [conqueredBookKeys, readLibrary]);

  const persistBookMeta = (nextMeta: BookMetadataMap, profileOverride = currentUser) => {
    if (!profileOverride) return null;
    setBookMeta(nextMeta);
    writeJson(getBookMetaStorageKey(profileOverride.id), nextMeta);
    const updated = updateProfile({
      ...profileOverride,
      bookAccess: withBookMetadata(profileOverride.bookAccess, nextMeta),
    });
    setCurrentUser(updated);
    return updated;
  };

  const persistWantToRead = (nextBooks: string[]) => {
    if (!currentUser) return;
    const deduped = Array.from(new Set(nextBooks.map((title) => title.trim()).filter(Boolean)));
    setWantToRead(deduped);
    writeJson(getWantToReadStorageKey(currentUser.id), deduped);
  };

  const persistReadLibrary = (nextBooks: string[]) => {
    if (!currentUser) return;
    const deduped = Array.from(new Set(nextBooks.map((title) => title.trim()).filter(Boolean)));
    setReadLibrary(deduped);
    writeJson(getReadLibraryStorageKey(currentUser.id), deduped);
  };

  const saveMetaForBook = (book: BookMatch, profileOverride = currentUser) => {
    return persistBookMeta({
      ...bookMeta,
      [normalizeBookKey(book.title)]: buildBookMeta(book),
    }, profileOverride);
  };

  const openSearchModal = (target: BookShelfTarget) => {
    setModalTarget(target);
    setSearchTitle("");
    setSearchAuthor("");
    setSearchIsbn("");
    setSearchMessage("");
    setSearchOptions([]);
  };

  const closeSearchModal = () => {
    setModalTarget(null);
    setSearchOptions([]);
    setSearchMessage("");
  };

  const getLookupPayload = (): BookLookupPayload | null => {
    const payload = {
      bookTitle: searchTitle.trim(),
      author: searchAuthor.trim(),
      isbn: searchIsbn.trim(),
    };
    return payload.bookTitle || payload.author || payload.isbn ? payload : null;
  };

  const searchLibrary = async () => {
    const payload = getLookupPayload();
    if (!payload) {
      setSearchMessage("Enter a title, author, ISBN, or any combination.");
      return;
    }

    setIsSearching(true);
    setSearchMessage("");
    setSearchOptions([]);

    try {
      const data = await lookupBookFromApi(payload);
      if ((data.status === "exact" || data.status === "options") && data.books.length > 0) {
        setSearchOptions(data.books);
        setSearchMessage(data.status === "exact" ? "Adventure found. Confirm the book below." : "Choose the book you meant.");
      } else {
        setSearchMessage("We could not find that book. Try a different title or author.");
      }
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : "Book search failed.");
    } finally {
      setIsSearching(false);
    }
  };

  const addBookToShelf = (book: BookMatch, target: BookShelfTarget = modalTarget ?? "currentlyReading") => {
    if (!currentUser) return;
    const profileWithMeta = saveMetaForBook(book, currentUser) ?? currentUser;

    if (target === "readLibrary") {
      persistReadLibrary([book.title, ...readLibrary]);
      setShelfMessage(`${book.title} added to My Library.`);
    }

    if (target === "currentlyReading") {
      const updated = saveReadingNow(profileWithMeta, [book.title, ...currentlyReading]);
      if (updated) {
        setCurrentUser(updated);
        setShelfMessage(`${book.title} added to Currently Reading.`);
      }
    }

    if (target === "wantToRead") {
      persistWantToRead([book.title, ...wantToRead]);
      setShelfMessage(`${book.title} saved for later.`);
    }

    if (target === "favorites") {
      const latestProfile = getCurrentProfile() ?? profileWithMeta;
      const latestFavorites = latestProfile.favoriteBooks ?? [];
      const alreadyFavorite = latestFavorites.some((title) => normalizeBookKey(title) === normalizeBookKey(book.title));

      if (alreadyFavorite) {
        setFavoriteSaveMessage(`${book.title} is already on your Favorite Shelf.`);
      } else if (latestFavorites.length >= MAX_FAVORITES) {
        setFavoriteSaveMessage(`Favorite Shelf is full. Remove one book before adding ${book.title}.`);
      } else {
        const updated = updateProfile({ ...latestProfile, favoriteBooks: [...latestFavorites, book.title] });
        setCurrentUser(updated);
        setFavoriteSaveMessage(`${book.title} added to Favorite Shelf.`);
      }
    }

    closeSearchModal();
  };

  const removeCurrentlyReading = (title: string) => {
    if (!currentUser) return;
    const updated = saveReadingNow(currentUser, currentlyReading.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)));
    if (updated) {
      setCurrentUser(updated);
      setShelfMessage(`${title} removed from Currently Reading.`);
    }
  };

  const moveToLibrary = (title: string) => {
    if (!currentUser) return;
    const updated = saveReadingNow(currentUser, currentlyReading.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)));
    if (updated) {
      setCurrentUser(updated);
      persistReadLibrary([title, ...readLibrary]);
      setShelfMessage(`${title} moved to Ready for Quiz. Take a book quiz when you finish reading.`);
    }
  };

  const removeFavorite = (title: string) => {
    if (!currentUser) return;
    const updated = updateProfile({
      ...currentUser,
      favoriteBooks: favoriteBooks.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)),
    });
    setCurrentUser(updated);
    setFavoriteSaveMessage(`${title} removed from Favorite Shelf.`);
  };

  const updateReadingPreference = (key: PreferenceKey, value: string) => {
    setReadingPreferences((current) => ({ ...current, [key]: value }));
    setPreferenceSaveMessage("");
  };

  const addPreferenceSuggestion = (key: PreferenceKey, suggestion: string) => {
    setReadingPreferences((current) => {
      const existing = current[key].split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (existing.includes(suggestion.toLowerCase())) {
        return current;
      }
      return {
        ...current,
        [key]: current[key].trim() ? `${current[key].trim()}, ${suggestion}` : suggestion,
      };
    });
    setPreferenceSaveMessage("");
  };

  const saveReadingPreferences = () => {
    if (!currentUser) return;
    const updated = updateProfile({
      ...currentUser,
      readingPreferences: {
        ...emptyReadingPreferences,
        storyKinds: readingPreferences.storyKinds.trim(),
        characters: readingPreferences.characters.trim(),
        places: readingPreferences.places.trim(),
        feelings: readingPreferences.feelings.trim(),
        topics: readingPreferences.topics.trim(),
        updatedAt: new Date().toISOString(),
      },
    });
    setCurrentUser(updated);
    setPreferenceSaveMessage("Advanced book preferences saved.");
  };

  const startReading = (title: string) => {
    if (!currentUser) return;
    const updated = saveReadingNow(currentUser, [title, ...currentlyReading]);
    if (updated) {
      setCurrentUser(updated);
      persistWantToRead(wantToRead.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)));
      setShelfMessage(`${title} moved to Currently Reading.`);
    }
  };

  const saveRecommendationForLater = (title: string) => {
    persistWantToRead([title, ...wantToRead]);
    setShelfMessage(`${title} saved to Want To Read.`);
  };

  const addRecommendationToLibrary = (title: string) => {
    persistReadLibrary([title, ...readLibrary]);
    setShelfMessage(`${title} added to My Library.`);
  };

  const removeFromLibrary = (title: string) => {
    persistReadLibrary(readLibrary.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)));
    setShelfMessage(`${title} removed from My Library.`);
  };

  if (!currentUser) {
    return <main><p>Loading...</p></main>;
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Personal Library</div>
          <h1>My Books</h1>
          <p>Keep track of what you are reading, what is ready for a quiz, and what you have finished.</p>
        </div>
        <HeroProfileActions profile={currentUser} homeHref={homeHref} />
      </div>

      <nav className="shelf-tabs" aria-label="My Books shelves">
        {shelfViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className={activeShelf === view.id ? "selected" : "secondary"}
            aria-pressed={activeShelf === view.id}
            onClick={() => setActiveShelf(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {activeShelf === "ready" ? (
      <section className="home-section library-section" aria-labelledby="my-library-heading">
        <div className="section-header-row">
          <div>
            <h2 id="my-library-heading">Ready for Quiz</h2>
            <p>Books you have read and are ready to answer questions about.</p>
          </div>
          <button type="button" onClick={() => openSearchModal("readLibrary")}>Add Book</button>
        </div>
        {shelfMessage ? <div className="success-box">{shelfMessage}</div> : null}

        <div className="library-stats-grid">
          <article className="library-streak-card">
            <img src={getHotStreakImageSrc()} alt="" />
            <div>
              <strong>Reading Streak</strong>
              <span>{streak.activeDaysThisWeek} / {streak.goalDays} days this week</span>
              <small>{streak.metThisWeek ? "Weekly goal complete." : "Keep your reading fire going."}</small>
            </div>
          </article>
          <article className="library-stat-card">
            <strong>Finished Books</strong>
            <span>{finishedBooks.length}</span>
          </article>
          <article className="library-stat-card">
            <strong>Quizzes Passed</strong>
            <span>{totalPassed}</span>
          </article>
          <article className="library-stat-card">
            <strong>Points Earned</strong>
            <span>{totalEarned}</span>
          </article>
        </div>
        {libraryBooks.length > 0 ? (
          <div className="book-shelf-grid">
            {libraryBooks.map((title) => {
              const meta = bookMeta[normalizeBookKey(title)];
              return (
                <article key={title} className="shelf-book-card">
                  <BookCover title={title} meta={meta} />
                  <div>
                    <h3>{title}</h3>
                    <p>{meta?.author || "Read and ready for a quiz"}</p>
                    <span className="badge-pill">Ready for quiz</span>
                  </div>
                  <div className="button-row">
                    <Link href={`/quiz?bookTitle=${encodeURIComponent(title)}`}>
                      <button type="button">Take Book Quiz</button>
                    </Link>
                    <button type="button" className="secondary danger-button" onClick={() => removeFromLibrary(title)}>Remove</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-library-shelf">
            <p>Add books you have already read. When you are ready, take a quiz to move them into Finished Books.</p>
            <button type="button" onClick={() => openSearchModal("readLibrary")}>Add Book</button>
          </div>
        )}
      </section>
      ) : null}

      {activeShelf === "reading" ? (
      <section className="home-section library-section" aria-labelledby="currently-reading-heading">
        <div className="section-header-row">
          <div>
            <h2 id="currently-reading-heading">Currently Reading</h2>
            <p>Books you are exploring right now.</p>
          </div>
          <button type="button" className="secondary" onClick={() => openSearchModal("currentlyReading")}>Add Book</button>
        </div>
        {currentlyReading.length > 0 ? (
          <div className="book-shelf-grid">
            {currentlyReading.map((title) => {
              const meta = bookMeta[normalizeBookKey(title)];
              return (
                <article key={title} className="shelf-book-card">
                  <BookCover title={title} meta={meta} />
                  <div>
                    <h3>{title}</h3>
                    <p>{meta?.author || "Author can be added by searching again."}</p>
                    <span className="badge-pill">In progress</span>
                  </div>
                  <div className="button-row">
                    <Link href={`/quiz?bookTitle=${encodeURIComponent(title)}`}>
                      <button type="button">Take Book Quiz</button>
                    </Link>
                    <button type="button" className="secondary" onClick={() => moveToLibrary(title)}>Move to Library</button>
                    <button type="button" className="secondary danger-button" onClick={() => removeCurrentlyReading(title)}>Remove</button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-library-shelf">
            <p>Your active shelf is waiting for its first book.</p>
            <button type="button" onClick={() => openSearchModal("currentlyReading")}>Add Book</button>
          </div>
        )}
      </section>
      ) : null}

      {activeShelf === "favorites" ? (
      <section
        className="home-section library-section favorite-shelf-section"
        aria-labelledby="favorite-shelf-heading"
        style={{ "--favorite-shelf-image": `url(${getShelfImageSrc(themeStyle)})` } as CSSProperties}
      >
        <div className="section-header-row">
          <div>
            <h2 id="favorite-shelf-heading">Favorite Shelf</h2>
            <p>Choose up to {MAX_FAVORITES} stories that really matter to you.</p>
          </div>
        </div>
        {favoriteSaveMessage ? <div className={favoriteSaveMessage.includes("full") ? "warning-box" : "success-box"}>{favoriteSaveMessage}</div> : null}
        {favoriteBooks.length > 0 ? (
          <div className="favorite-shelf-row">
            {favoriteBooks.map((title) => {
              const meta = bookMeta[normalizeBookKey(title)];
              return (
                <article key={title} className="favorite-book-card">
                  <BookCover title={title} meta={meta} />
                  <h3>{title}</h3>
                  <p>{meta?.author || "Favorite story"}</p>
                  <button type="button" className="secondary" onClick={() => removeFavorite(title)}>Remove</button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="favorite-shelf-empty">No favorites yet. Add one when a book earns a special place on your shelf.</p>
        )}
        <div className="favorite-shelf-controls">
          <button type="button" className="secondary favorite-shelf-action" disabled={favoriteBooks.length >= MAX_FAVORITES} onClick={() => openSearchModal("favorites")}>
            Add Favorite
          </button>
          <details className="favorite-advanced-options">
            <summary>Advanced Options</summary>
            <div className="favorite-advanced-content">
              <h3>Favorite Style</h3>
              <p>Optional details for better book suggestions. Favorite books are enough to get started.</p>
              <div className="preference-grid">
                {preferencePrompts.map((prompt) => (
                  <div key={prompt.key} className="field preference-question">
                    <label htmlFor={`my-books-preference-${prompt.key}`}>{prompt.label}</label>
                    <input
                      id={`my-books-preference-${prompt.key}`}
                      value={readingPreferences[prompt.key]}
                      onChange={(event) => updateReadingPreference(prompt.key, event.target.value)}
                      placeholder={prompt.placeholder}
                      list={`my-books-preference-options-${prompt.key}`}
                    />
                    <datalist id={`my-books-preference-options-${prompt.key}`}>
                      {prompt.suggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                    <div className="preference-suggestions" aria-label={`Suggestions for ${prompt.label}`}>
                      {prompt.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="preference-chip"
                          onClick={() => addPreferenceSuggestion(prompt.key, suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary" onClick={saveReadingPreferences}>Save Advanced Options</button>
              {preferenceSaveMessage ? <div className="success-box">{preferenceSaveMessage}</div> : null}
            </div>
          </details>
        </div>
      </section>
      ) : null}

      {activeShelf === "want" ? (
      <>
      <section className="home-section library-section" aria-labelledby="recommendations-heading">
        <div className="section-header-row">
          <div>
            <h2 id="recommendations-heading">Book Suggestions</h2>
            <p>{recommendationData.summary}</p>
          </div>
          <button type="button" className="secondary" onClick={() => setSuggestionRotation((current) => current + 1)}>
            New Picks
          </button>
        </div>
        <div className="recommendation-scroll-row">
          {recommendationData.suggestions.map((title) => (
            <article key={title} className="recommendation-book-card">
              <BookCover title={title} meta={bookMeta[normalizeBookKey(title)]} />
              <h3>{title}</h3>
              <p>{recommendationData.reasons[title] || "Because of your reading adventures."}</p>
              <div className="button-row">
                <button type="button" onClick={() => addRecommendationToLibrary(title)}>Add to Library</button>
                <button type="button" className="secondary" onClick={() => saveRecommendationForLater(title)}>Save for Later</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section library-section" aria-labelledby="want-to-read-heading">
        <div className="section-header-row">
          <div>
            <h2 id="want-to-read-heading">Want To Read</h2>
            <p>Stories saved for future adventures.</p>
          </div>
          <button type="button" className="secondary" onClick={() => openSearchModal("wantToRead")}>Add Book</button>
        </div>
        {wantToRead.length > 0 ? (
          <div className="book-shelf-grid compact-bookshelf">
            {wantToRead.map((title) => (
              <article key={title} className="shelf-book-card compact">
                <BookCover title={title} meta={bookMeta[normalizeBookKey(title)]} />
                <div>
                  <h3>{title}</h3>
                  <p>{bookMeta[normalizeBookKey(title)]?.author || "Saved for later"}</p>
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => startReading(title)}>Start Reading</button>
                  <button type="button" className="secondary danger-button" onClick={() => persistWantToRead(wantToRead.filter((book) => normalizeBookKey(book) !== normalizeBookKey(title)))}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>Your future adventure shelf is empty.</p>
        )}
      </section>
      </>
      ) : null}

      {activeShelf === "finished" ? (
      <section className="home-section library-section" aria-labelledby="books-conquered-heading">
        <h2 id="books-conquered-heading">Finished Books</h2>
        <p>Books move here after you complete a book quiz.</p>
        {finishedBooks.length > 0 ? (
          <div className="book-shelf-grid">
            {finishedBooks.map((quiz) => {
              const meta = bookMeta[normalizeBookKey(quiz.bookTitle)];
              const rating = getRatingForBook(quiz.bookTitle);
              return (
                <button key={quiz.bookTitle} type="button" className="finished-book-card" onClick={() => setSelectedBookTitle(quiz.bookTitle)}>
                  <BookCover title={quiz.bookTitle} meta={meta} />
                  <span>
                    <strong>{quiz.bookTitle}</strong>
                    <small>Finished {formatDate(quiz.date)}</small>
                    <small>Score {quiz.score} / {quiz.maxScore}</small>
                    <small>{rating ? `${rating} star rating` : "No rating yet"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p>Take a quiz from Ready for Quiz to start your finished bookshelf.</p>
        )}
        <div className="achievement-grid">
          <article className="achievement-card earned">
            <div className="achievement-medal" aria-hidden="true">Book</div>
            <h3>{finishedBooks.length} Finished Books</h3>
            <p>Total books completed in your reading journal.</p>
          </article>
          <article className="achievement-card earned">
            <div className="achievement-medal" aria-hidden="true">Quest</div>
            <h3>{currentUser.quizzes.length} Book Quizzes</h3>
            <p>{totalPassed} passed so far.</p>
          </article>
          <article className="achievement-card earned">
            <div className="achievement-medal" aria-hidden="true">Star</div>
            <h3>{getSpendablePoints(currentUser)} Points Ready</h3>
            <p>{totalEarned} lifetime points earned.</p>
          </article>
        </div>
        {badges.length > 0 ? (
          <div className="badge-row">
            {badges.slice(0, 8).map((badge) => <span key={badge} className="badge-pill">{badge}</span>)}
          </div>
        ) : (
          <p>Achievements will appear as you complete more reading quests.</p>
        )}
      </section>
      ) : null}

      {modalTarget ? (
        <div className="book-search-modal-shell" role="dialog" aria-modal="true" aria-labelledby="book-search-title">
          <button type="button" className="book-search-modal-scrim" aria-label="Close book search" onClick={closeSearchModal} />
          <section className="book-search-modal">
            <div className="section-header-row">
              <div>
                <div className="kicker">Search the Library</div>
                <h2 id="book-search-title">Add a Book</h2>
                <p>Use a title, author, ISBN, or any combination.</p>
              </div>
              <button type="button" className="secondary" onClick={closeSearchModal}>Close</button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="bookSearchTitle">Book Title</label>
                <input id="bookSearchTitle" value={searchTitle} onChange={(event) => setSearchTitle(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchLibrary();
                  }
                }} />
              </div>
              <div className="field">
                <label htmlFor="bookSearchAuthor">Author</label>
                <input id="bookSearchAuthor" value={searchAuthor} onChange={(event) => setSearchAuthor(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchLibrary();
                  }
                }} />
              </div>
              <div className="field">
                <label htmlFor="bookSearchIsbn">ISBN</label>
                <input id="bookSearchIsbn" value={searchIsbn} onChange={(event) => setSearchIsbn(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchLibrary();
                  }
                }} />
              </div>
            </div>
            <button type="button" onClick={() => void searchLibrary()} disabled={isSearching || !getLookupPayload()}>
              {isSearching ? "Searching..." : "Search the Library"}
            </button>
            {searchMessage ? <div className={searchOptions.length ? "success-box" : "notice"}>{searchMessage}</div> : null}
            {searchOptions.length > 0 ? (
              <div className="book-option-grid">
                {searchOptions.map((book) => (
                  <button key={book.id} type="button" className="book-option" onClick={() => addBookToShelf(book)}>
                    <BookOptionCover book={book} />
                    <span>
                      <strong>{book.title}</strong>
                      <span>{book.author}{book.year ? ` - ${book.year}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {selectedBookTitle ? (
        <div className="book-search-modal-shell" role="dialog" aria-modal="true" aria-labelledby="book-detail-title">
          <button type="button" className="book-search-modal-scrim" aria-label="Close book details" onClick={() => setSelectedBookTitle(null)} />
          <section className="book-search-modal">
            <div className="section-header-row">
              <div>
                <div className="kicker">Adventure Journal</div>
                <h2 id="book-detail-title">{selectedBookTitle}</h2>
              </div>
              <button type="button" className="secondary" onClick={() => setSelectedBookTitle(null)}>Close</button>
            </div>
            {selectedBookQuiz ? (
              <div className="library-detail-grid">
                <BookCover title={selectedBookTitle} meta={bookMeta[normalizeBookKey(selectedBookTitle)]} />
                <div>
                  <p><strong>Latest score:</strong> {selectedBookQuiz.score} / {selectedBookQuiz.maxScore}</p>
                  <p><strong>Challenge path:</strong> {selectedBookQuiz.difficulty}</p>
                  <p><strong>Completed:</strong> {formatDate(selectedBookQuiz.date)}</p>
                  <p><strong>Rating:</strong> {getRatingForBook(selectedBookTitle) || "Not rated yet"}</p>
                  <p><strong>Favorite:</strong> {favoriteBooks.some((title) => normalizeBookKey(title) === normalizeBookKey(selectedBookTitle)) ? "On your shelf" : "Not yet"}</p>
                </div>
              </div>
            ) : null}
            <h3>Quiz History</h3>
            <div className="compact-list">
              {currentUser.quizzes
                .filter((quiz) => normalizeBookKey(quiz.bookTitle) === normalizeBookKey(selectedBookTitle))
                .map((quiz) => (
                  <div key={`${quiz.date}-${quiz.difficulty}`} className="review-queue-item">
                    <strong>{formatDate(quiz.date)}</strong>
                    <span>{quiz.score} / {quiz.maxScore} on {quiz.difficulty}</span>
                  </div>
                ))}
            </div>
            <h3>Reviews</h3>
            {selectedBookReviews.length > 0 ? (
              <div className="compact-list">
                {selectedBookReviews.map((review) => (
                  <div key={review.id} className="review-queue-item">
                    <strong>{review.rating} stars</strong>
                    <span>{review.reviewText || "No written review."}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No reviews yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  );
}
