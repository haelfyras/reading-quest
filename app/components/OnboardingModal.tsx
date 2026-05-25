"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { defaultAvatarId, getAvatarOption } from "../../lib/avatarOptions";
import type { BookMatch } from "../../lib/books";
import { lookupBook as lookupBookFromApi, type BookLookupPayload } from "../../lib/bookClient";
import { emptyReadingPreferences, preferencePrompts, type PreferenceKey } from "../../lib/readingPreferences";
import { getCurrentProfile, Profile, setCurrentUserId, updateProfile } from "../../lib/user";
import AvatarPicker from "./AvatarPicker";

function onboardingKey(profileId: string) {
  return `readingQuestShowOnboarding_${profileId}`;
}

export function markProfileForOnboarding(profileId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(onboardingKey(profileId), "true");
  window.dispatchEvent(new Event("readingQuestOnboardingRequested"));
}

export default function OnboardingModal() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [show, setShow] = useState(false);
  const [favoriteBooks, setFavoriteBooks] = useState(["", "", ""]);
  const [favoriteAuthors, setFavoriteAuthors] = useState(["", "", ""]);
  const [confirmedFavorites, setConfirmedFavorites] = useState<Array<BookMatch | null>>([null, null, null]);
  const [favoriteOptions, setFavoriteOptions] = useState<BookMatch[][]>([[], [], []]);
  const [favoriteLookupMessages, setFavoriteLookupMessages] = useState(["", "", ""]);
  const [checkingFavoriteIndex, setCheckingFavoriteIndex] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [readingPreferences, setReadingPreferences] = useState(emptyReadingPreferences);
  const [selectedAvatar, setSelectedAvatar] = useState(defaultAvatarId);

  useEffect(() => {
    const loadOnboarding = () => {
      const current = getCurrentProfile();
      if (!current) {
        setProfile(null);
        setShow(false);
        return;
      }

      const shouldShow = window.localStorage.getItem(onboardingKey(current.id)) === "true";
      if (!shouldShow) return;

      setProfile(current);
      setFavoriteBooks([
        current.favoriteBooks?.[0] ?? "",
        current.favoriteBooks?.[1] ?? "",
        current.favoriteBooks?.[2] ?? "",
      ]);
      setFavoriteAuthors(["", "", ""]);
      setConfirmedFavorites(
        [current.favoriteBooks?.[0] ?? "", current.favoriteBooks?.[1] ?? "", current.favoriteBooks?.[2] ?? ""]
          .map((title) => title ? { id: title, title, author: "Saved favorite" } : null),
      );
      setFavoriteOptions([[], [], []]);
      setFavoriteLookupMessages(["", "", ""]);
      setSaveMessage("");
      setReadingPreferences({
        ...emptyReadingPreferences,
        ...(current.readingPreferences ?? {}),
      });
      setSelectedAvatar(getAvatarOption(current.avatarStyle)?.id ?? defaultAvatarId);
      setShow(true);
    };

    loadOnboarding();
    window.addEventListener("readingQuestOnboardingRequested", loadOnboarding);
    window.addEventListener("readingQuestProfileUpdated", loadOnboarding);
    return () => {
      window.removeEventListener("readingQuestOnboardingRequested", loadOnboarding);
      window.removeEventListener("readingQuestProfileUpdated", loadOnboarding);
    };
  }, [pathname]);

  if (!profile || !show) {
    return null;
  }

  const close = () => {
    window.localStorage.removeItem(onboardingKey(profile.id));
    updateProfile(profile);
    setCurrentUserId(profile.id);
    setShow(false);
  };

  const resetFavoriteLookup = (index: number) => {
    setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
    setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
    setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index ? "" : message));
    setSaveMessage("");
  };

  const handleFavoriteBookChange = (index: number, value: string) => {
    setFavoriteBooks((current) => current.map((book, idx) => idx === index ? value : book));
    resetFavoriteLookup(index);
  };

  const handleFavoriteAuthorChange = (index: number, value: string) => {
    setFavoriteAuthors((current) => current.map((author, idx) => idx === index ? value : author));
    resetFavoriteLookup(index);
  };

  const getFavoriteLookupPayload = (index: number): BookLookupPayload | null => {
    const payload = {
      bookTitle: favoriteBooks[index].trim(),
      author: favoriteAuthors[index].trim(),
    };
    return payload.bookTitle || payload.author ? payload : null;
  };

  const applyFavoriteBook = (index: number, book: BookMatch) => {
    setFavoriteBooks((current) => current.map((title, idx) => idx === index ? book.title : title));
    setFavoriteAuthors((current) => current.map((author, idx) => idx === index ? (book.author === "Unknown author" ? "" : book.author) : author));
    setConfirmedFavorites((current) => current.map((item, idx) => idx === index ? book : item));
    setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
    setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index ? "" : message));
    setSaveMessage("");
  };

  const lookupFavoriteBook = async (index: number, payload: BookLookupPayload) => {
    setCheckingFavoriteIndex(index);
    setSaveMessage("");

    try {
      const data = await lookupBookFromApi(payload);
      if ((data.status === "exact" || data.status === "options") && data.books.length > 0) {
        setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
        setFavoriteOptions((current) => current.map((options, idx) => idx === index ? data.books : options));
        setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index
          ? data.status === "exact"
            ? "Please confirm this is the book you mean."
            : "We found a few possible matches. Which book do you mean?"
          : message));
        return null;
      }

      setConfirmedFavorites((current) => current.map((book, idx) => idx === index ? null : book));
      setFavoriteOptions((current) => current.map((options, idx) => idx === index ? [] : options));
      setFavoriteLookupMessages((current) => current.map((message, idx) => idx === index
        ? "We could not find that book yet. Check the spelling, try adding the author, or pick another favorite."
        : message));
      return null;
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Failed to look up favorite book.");
      return null;
    } finally {
      setCheckingFavoriteIndex(null);
    }
  };

  const ensureFavoriteConfirmed = async (index: number) => {
    const title = favoriteBooks[index].trim();
    const author = favoriteAuthors[index].trim();
    if (!title && !author) {
      return null;
    }

    const confirmed = confirmedFavorites[index];
    if (confirmed && confirmed.title === title && (!author || confirmed.author === author || confirmed.author === "Saved favorite")) {
      return confirmed;
    }

    const payload = getFavoriteLookupPayload(index);
    return payload ? lookupFavoriteBook(index, payload) : null;
  };

  const updateReadingPreference = (key: PreferenceKey, value: string) => {
    setReadingPreferences((current) => ({ ...current, [key]: value }));
    setSaveMessage("");
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
    setSaveMessage("");
  };

  const save = async () => {
    const confirmedBooks: string[] = [];
    for (let index = 0; index < favoriteBooks.length; index += 1) {
      const hasDraftBook = favoriteBooks[index].trim() || favoriteAuthors[index].trim();
      if (!hasDraftBook) continue;
      const book = await ensureFavoriteConfirmed(index);
      if (!book) {
        setSaveMessage(`Please choose a matching book for favorite book ${index + 1}.`);
        return;
      }
      confirmedBooks.push(book.title);
    }

    window.localStorage.removeItem(onboardingKey(profile.id));
    const updated = updateProfile({
      ...profile,
      favoriteBooks: confirmedBooks,
      readingPreferences: {
        ...emptyReadingPreferences,
        ...(profile.readingPreferences ?? {}),
        storyKinds: readingPreferences.storyKinds.trim(),
        characters: readingPreferences.characters.trim(),
        places: readingPreferences.places.trim(),
        feelings: readingPreferences.feelings.trim(),
        topics: readingPreferences.topics.trim(),
        updatedAt: new Date().toISOString(),
      },
      avatarStyle: selectedAvatar,
    });
    setProfile(updated);
    setShow(false);
  };

  return (
    <div className="onboarding-modal-shell" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-modal-scrim" />
      <section className="onboarding-modal">
        <div className="section-header-row">
          <div>
            <div className="kicker">Welcome to Reading Quest</div>
            <h2 id="onboarding-title">Set Up Your Reader Profile</h2>
            <p>A few quick choices help Reading Quest suggest better books and make the app feel like yours.</p>
          </div>
          <button type="button" className="secondary" onClick={close}>Later</button>
        </div>

        <div className="onboarding-grid">
          <div className="nested-section">
            <h3>Favorite Books</h3>
            <p className="setting-description">Add any favorites you already know. You can change these in My Books later.</p>
            {favoriteBooks.map((book, index) => (
              <div className="field" key={`onboarding-book-${index}`}>
                <label htmlFor={`onboarding-book-${index}`}>Favorite book {index + 1} title</label>
                <input
                  id={`onboarding-book-${index}`}
                  value={book}
                  onChange={(event) => handleFavoriteBookChange(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const payload = getFavoriteLookupPayload(index);
                      if (payload) void lookupFavoriteBook(index, payload);
                    }
                  }}
                  placeholder={index === 0 ? "Example: The Hobbit" : "Optional"}
                />
                <label htmlFor={`onboarding-author-${index}`}>Author</label>
                <input
                  id={`onboarding-author-${index}`}
                  value={favoriteAuthors[index]}
                  onChange={(event) => handleFavoriteAuthorChange(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const payload = getFavoriteLookupPayload(index);
                      if (payload) void lookupFavoriteBook(index, payload);
                    }
                  }}
                  placeholder="Optional author"
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const payload = getFavoriteLookupPayload(index);
                    if (payload) void lookupFavoriteBook(index, payload);
                  }}
                  disabled={checkingFavoriteIndex !== null || !getFavoriteLookupPayload(index)}
                >
                  {checkingFavoriteIndex === index ? "Checking..." : "Check book"}
                </button>

                {confirmedFavorites[index] ? (
                  <div className="confirmed-book">
                    <strong>Using: {confirmedFavorites[index]?.title}</strong>
                    <span>{confirmedFavorites[index]?.author}</span>
                  </div>
                ) : null}

                {favoriteLookupMessages[index] ? <div className="notice">{favoriteLookupMessages[index]}</div> : null}

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
              </div>
            ))}
          </div>

          <div className="nested-section">
            <h3>Favorite Style</h3>
            <div className="preference-grid">
              {preferencePrompts.map((prompt) => (
                <div key={prompt.key} className="field preference-question">
                  <label htmlFor={`onboarding-preference-${prompt.key}`}>{prompt.label}</label>
                  <input
                    id={`onboarding-preference-${prompt.key}`}
                    value={readingPreferences[prompt.key]}
                    onChange={(event) => updateReadingPreference(prompt.key, event.target.value)}
                    placeholder={prompt.placeholder}
                    list={`onboarding-preference-options-${prompt.key}`}
                  />
                  <datalist id={`onboarding-preference-options-${prompt.key}`}>
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
          </div>
        </div>

        <div className="nested-section">
          <h3>Choose an Avatar</h3>
          <AvatarPicker selectedAvatar={selectedAvatar} onSelect={setSelectedAvatar} />
        </div>

        <div className="button-row">
          <button type="button" onClick={() => void save()} disabled={checkingFavoriteIndex !== null}>Save Profile Setup</button>
          <button type="button" className="secondary" onClick={close}>Skip for now</button>
        </div>
        {saveMessage ? <div className={saveMessage.includes("Please choose") ? "warning-box" : "error-box"}>{saveMessage}</div> : null}
      </section>
    </div>
  );
}
