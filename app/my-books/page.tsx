"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addReadingLog,
  BookAccessType,
  defaultParentControls,
  getCurrentProfile,
  getRetakeStatus,
  Profile,
  saveBookAccess,
  saveReadingNow,
  updateProfile,
} from "../../lib/user";
import { getBookRecommendations } from "../../lib/recommendations";
import type { BookLookupResult, BookMatch } from "../../lib/books";

type NearbyBookPlace = {
  id: string;
  name: string;
  type: "Library" | "Bookstore";
  distanceMiles: number;
  address: string;
  mapUrl: string;
};

type OverpassElement = {
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
};

const preferencePrompts = [
  {
    key: "storyKinds",
    label: "What kind of stories do you like?",
    placeholder: "space, fantasy, princesses, pirates",
    suggestions: ["space", "fantasy", "princesses", "pirates", "mystery", "animals"],
  },
  {
    key: "characters",
    label: "Who do you like reading about?",
    placeholder: "dragons, kids like me, robots, funny animals",
    suggestions: ["dragons", "kids like me", "robots", "funny animals", "superheroes", "detectives"],
  },
  {
    key: "places",
    label: "Where should the story happen?",
    placeholder: "school, castles, forests, other planets",
    suggestions: ["school", "castles", "forests", "other planets", "the ocean", "big cities"],
  },
  {
    key: "feelings",
    label: "How should the book feel?",
    placeholder: "funny, exciting, cozy, spooky",
    suggestions: ["funny", "exciting", "cozy", "spooky", "magical", "adventurous"],
  },
  {
    key: "topics",
    label: "What else do you want in a book?",
    placeholder: "friendship, games, science, treasure",
    suggestions: ["friendship", "games", "science", "treasure", "family", "sports"],
  },
] as const;

type PreferenceKey = typeof preferencePrompts[number]["key"];

const emptyReadingPreferences: Record<PreferenceKey, string> = {
  storyKinds: "",
  characters: "",
  places: "",
  feelings: "",
  topics: "",
};

function distanceInMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatAddress(tags: Record<string, string> = {}) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ");
  return [street, locality].filter(Boolean).join(" - ") || "Address not listed";
}

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
  const [readingPreferences, setReadingPreferences] = useState(emptyReadingPreferences);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [suggestionRotation, setSuggestionRotation] = useState(0);
  const [readingNow, setReadingNow] = useState("");
  const [logBookTitle, setLogBookTitle] = useState("");
  const [logMinutes, setLogMinutes] = useState(20);
  const [logChapters, setLogChapters] = useState(0);
  const [logAccess, setLogAccess] = useState<BookAccessType>("owned");
  const [logAssisted, setLogAssisted] = useState(false);
  const [readingMessage, setReadingMessage] = useState("");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyBookPlace[]>([]);
  const [locationMessage, setLocationMessage] = useState("");
  const [isFindingPlaces, setIsFindingPlaces] = useState(false);

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
    setReadingPreferences({
      ...emptyReadingPreferences,
      ...(profile.readingPreferences ?? {}),
    });
    setReadingNow(profile.readingNow?.join("\n") ?? "");
    setLogBookTitle(profile.readingNow?.[0] ?? "");
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

  const updateReadingPreference = (key: PreferenceKey, value: string) => {
    setReadingPreferences((current) => ({ ...current, [key]: value }));
    setPreferenceMessage("");
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
    setPreferenceMessage("");
  };

  const saveReadingPreferences = () => {
    if (!currentUser) return;
    const cleaned = {
      storyKinds: readingPreferences.storyKinds.trim(),
      characters: readingPreferences.characters.trim(),
      places: readingPreferences.places.trim(),
      feelings: readingPreferences.feelings.trim(),
      topics: readingPreferences.topics.trim(),
    };
    const answeredCount = Object.values(cleaned).filter(Boolean).length;
    if (answeredCount < 3) {
      setPreferenceMessage("Answer at least three questions so Reading Quest has enough to work with.");
      return;
    }

    const updated = updateProfile({
      ...currentUser,
      readingPreferences: {
        ...cleaned,
        updatedAt: new Date().toISOString(),
      },
    });
    setCurrentUser(updated);
    setPreferenceMessage("Saved your reading taste quiz!");
  };

  const saveReadingList = () => {
    if (!currentUser) return;
    const updated = saveReadingNow(currentUser, readingNow.split("\n"));
    setCurrentUser(updated);
    setReadingMessage("Saved your read-first list.");
  };

  const logReading = () => {
    if (!logBookTitle.trim()) {
      setReadingMessage("Choose or enter the book you read.");
      return;
    }
    const updated = addReadingLog({
      bookTitle: logBookTitle,
      minutes: logMinutes,
      chaptersFinished: logChapters,
      accessType: logAccess,
      assisted: logAssisted,
    });
    if (updated) {
      setCurrentUser(updated);
      setReadingNow(updated.readingNow?.join("\n") ?? "");
      setReadingMessage("Reading logged. Effort points were added.");
    }
  };

  const updateAccess = (title: string, accessType: BookAccessType) => {
    if (!currentUser) return;
    const updated = saveBookAccess(currentUser, title, accessType);
    setCurrentUser(updated);
  };

  const findNearbyBookPlaces = () => {
    if (!currentUser) return;

    const controls = { ...defaultParentControls, ...(currentUser.parentControls ?? {}) };
    const canUseLocation = currentUser.isParent || controls.allowLocationLookup;
    if (!canUseLocation) {
      setLocationMessage("Ask your parent to turn on nearby libraries and bookstores first.");
      return;
    }

    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }

    setIsFindingPlaces(true);
    setLocationMessage("Finding nearby libraries and bookstores...");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const query = `
          [out:json][timeout:25];
          (
            node["amenity"="library"](around:16000,${latitude},${longitude});
            way["amenity"="library"](around:16000,${latitude},${longitude});
            relation["amenity"="library"](around:16000,${latitude},${longitude});
            node["shop"="books"](around:16000,${latitude},${longitude});
            way["shop"="books"](around:16000,${latitude},${longitude});
            relation["shop"="books"](around:16000,${latitude},${longitude});
          );
          out center tags;
        `;

        try {
          const response = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: new URLSearchParams({ data: query }),
          });

          if (!response.ok) {
            throw new Error("Nearby place search is temporarily unavailable.");
          }

          const data = await response.json() as { elements?: OverpassElement[] };
          const places = (data.elements ?? [])
            .map((place) => {
              const lat = place.lat ?? place.center?.lat;
              const lon = place.lon ?? place.center?.lon;
              if (!lat || !lon) return null;
              const tags = place.tags ?? {};
              const type = tags.amenity === "library" ? "Library" : "Bookstore";
              return {
                id: `${place.id}`,
                name: tags.name || type,
                type,
                distanceMiles: distanceInMiles(latitude, longitude, lat, lon),
                address: formatAddress(tags),
                mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
              } satisfies NearbyBookPlace;
            })
            .filter((place): place is NearbyBookPlace => Boolean(place))
            .sort((a, b) => a.distanceMiles - b.distanceMiles)
            .slice(0, 5);

          setNearbyPlaces(places);
          setLocationMessage(places.length ? "Showing the 5 nearest book places we found." : "No nearby libraries or bookstores were found.");
        } catch (err) {
          setNearbyPlaces([]);
          setLocationMessage(err instanceof Error ? err.message : "Unable to find nearby book places.");
        } finally {
          setIsFindingPlaces(false);
        }
      },
      () => {
        setIsFindingPlaces(false);
        setNearbyPlaces([]);
        setLocationMessage("Location permission was not granted.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const recommendationData = useMemo(() => {
    const favorites = currentUser?.favoriteBooks?.length === 3 ? currentUser.favoriteBooks : favoriteBooks.filter(Boolean);
    const profileWithDraftPreferences = currentUser
      ? {
          ...currentUser,
          readingPreferences: {
            storyKinds: readingPreferences.storyKinds,
            characters: readingPreferences.characters,
            places: readingPreferences.places,
            feelings: readingPreferences.feelings,
            topics: readingPreferences.topics,
            updatedAt: currentUser.readingPreferences?.updatedAt,
          },
        }
      : currentUser;
    return getBookRecommendations({
      profile: profileWithDraftPreferences,
      favoriteBooks: favorites,
      rotationOffset: suggestionRotation,
      limit: 5,
    });
  }, [currentUser, favoriteBooks, suggestionRotation, readingPreferences]);

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
  const hasReadingPreferences = Boolean(currentUser.readingPreferences && Object.values(currentUser.readingPreferences).some(Boolean));
  const favoriteList = hasFavoriteBooks ? currentUser.favoriteBooks ?? [] : favoriteBooks.filter(Boolean);
  const homeHref = currentUser.isParent ? "/parent" : "/home";
  const controls = { ...defaultParentControls, ...(currentUser.parentControls ?? {}) };
  const canUseLocation = currentUser.isParent || controls.allowLocationLookup;

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
            <p>Choose three favorite books so Reading Quest can recommend more. If you are still finding favorites, answer the quick reading taste quiz below instead.</p>
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

        <div className="nested-section preference-quiz" aria-labelledby="preference-quiz-heading">
          <div className="section-header-row">
            <div>
              <h3 id="preference-quiz-heading">Reading Taste Quiz</h3>
              <p>Five quick answers can guide recommendations when favorite books are hard to name.</p>
            </div>
            {hasReadingPreferences ? <span className="badge-pill">Saved</span> : null}
          </div>
          <div className="preference-grid">
            {preferencePrompts.map((prompt) => (
              <div key={prompt.key} className="field preference-question">
                <label htmlFor={`preference-${prompt.key}`}>{prompt.label}</label>
                <input
                  id={`preference-${prompt.key}`}
                  value={readingPreferences[prompt.key]}
                  onChange={(event) => updateReadingPreference(prompt.key, event.target.value)}
                  placeholder={prompt.placeholder}
                  list={`preference-options-${prompt.key}`}
                />
                <datalist id={`preference-options-${prompt.key}`}>
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
          <button type="button" className="secondary" onClick={saveReadingPreferences}>
            Save taste quiz
          </button>
          {preferenceMessage ? (
            <div className={preferenceMessage.includes("Saved") ? "success-box" : "warning-box"}>{preferenceMessage}</div>
          ) : null}
        </div>
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
            <li key={title}>
              <strong>{title}</strong>
              <span className="block-note">{recommendationData.reasons[title]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-section" aria-labelledby="nearby-book-places-heading">
        <div className="section-header-row">
          <div>
            <h2 id="nearby-book-places-heading">Nearby Book Places</h2>
            <p>Optional location lookup for libraries and bookstores near you.</p>
          </div>
          <span className={canUseLocation ? "badge-pill" : "badge-pill muted-pill"}>
            {canUseLocation ? "Allowed" : "Parent approval needed"}
          </span>
        </div>
        {canUseLocation ? (
          <>
            <label className="setting-label">
              <input
                type="checkbox"
                checked={locationEnabled}
                onChange={(event) => {
                  setLocationEnabled(event.target.checked);
                  setNearbyPlaces([]);
                  setLocationMessage("");
                }}
              />
              <span>Choose my location</span>
            </label>
            {locationEnabled ? (
              <div className="nested-section">
                <p>Reading Quest will ask this browser for your location and use it once to find nearby libraries and bookstores.</p>
                <button type="button" className="secondary" onClick={findNearbyBookPlaces} disabled={isFindingPlaces}>
                  {isFindingPlaces ? "Finding places..." : "Find nearby book places"}
                </button>
                {locationMessage ? <div className={nearbyPlaces.length ? "success-box" : "notice"}>{locationMessage}</div> : null}
                {nearbyPlaces.length > 0 ? (
                  <div className="nearby-place-list">
                    {nearbyPlaces.map((place) => (
                      <a key={place.id} className="nearby-place-card" href={place.mapUrl} target="_blank" rel="noreferrer">
                        <strong>{place.name}</strong>
                        <span>{place.type} - {place.distanceMiles.toFixed(1)} miles away</span>
                        <small>{place.address}</small>
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="warning-box">
            Ask a verified parent to allow nearby libraries and bookstores for this child account.
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="reading-now-heading">
        <h2 id="reading-now-heading">Read First, Quiz Later</h2>
        <p>Save books you are reading now. Audiobooks, ebooks, library books, and read-aloud books all count.</p>
        <div className="field">
          <label htmlFor="readingNow">Books I am reading</label>
          <textarea
            id="readingNow"
            rows={5}
            value={readingNow}
            onChange={(event) => setReadingNow(event.target.value)}
            placeholder={"One book per line\nExample: The Wild Robot"}
          />
        </div>
        <button type="button" className="secondary" onClick={saveReadingList}>Save reading list</button>

        <div className="nested-section">
          <h3>Log Reading Effort</h3>
          <div className="field">
            <label htmlFor="logBookTitle">Book</label>
            <input id="logBookTitle" value={logBookTitle} onChange={(event) => setLogBookTitle(event.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="logMinutes">Minutes read</label>
              <input id="logMinutes" type="number" min="0" max="240" value={logMinutes} onChange={(event) => setLogMinutes(Number(event.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="logChapters">Chapters finished</label>
              <input id="logChapters" type="number" min="0" max="20" value={logChapters} onChange={(event) => setLogChapters(Number(event.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="logAccess">Book format</label>
              <select id="logAccess" value={logAccess} onChange={(event) => setLogAccess(event.target.value as BookAccessType)}>
                <option value="owned">Owned book</option>
                <option value="library">Library book</option>
                <option value="audiobook">Audiobook</option>
                <option value="ebook">Ebook</option>
                <option value="read_aloud">Read aloud</option>
                <option value="borrowed">Borrowed book</option>
              </select>
            </div>
          </div>
          <label className="setting-label">
            <input type="checkbox" checked={logAssisted} onChange={(event) => setLogAssisted(event.target.checked)} />
            <span>This was assisted reading</span>
          </label>
          <button type="button" onClick={logReading}>Log reading</button>
        </div>
        {readingMessage ? <div className={readingMessage.includes("Choose") ? "error-box" : "success-box"}>{readingMessage}</div> : null}
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
                  <th>Format</th>
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
                        <select
                          aria-label={`Book format for ${quiz.bookTitle}`}
                          value={currentUser.bookAccess?.[quiz.bookTitle] ?? "owned"}
                          onChange={(event) => updateAccess(quiz.bookTitle, event.target.value as BookAccessType)}
                        >
                          <option value="owned">Owned</option>
                          <option value="library">Library</option>
                          <option value="audiobook">Audio</option>
                          <option value="ebook">Ebook</option>
                          <option value="read_aloud">Read aloud</option>
                          <option value="borrowed">Borrowed</option>
                        </select>
                      </td>
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
