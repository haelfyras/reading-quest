"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { defaultAvatarId, getAvatarOption } from "../../lib/avatarOptions";
import { emptyReadingPreferences } from "../../lib/readingPreferences";
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
  const [storyStyle, setStoryStyle] = useState("");
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
      setStoryStyle(current.readingPreferences?.storyKinds ?? "");
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

  const save = () => {
    window.localStorage.removeItem(onboardingKey(profile.id));
    const updated = updateProfile({
      ...profile,
      favoriteBooks: favoriteBooks.map((book) => book.trim()).filter(Boolean),
      readingPreferences: {
        ...emptyReadingPreferences,
        ...(profile.readingPreferences ?? {}),
        storyKinds: storyStyle.trim(),
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
                <label htmlFor={`onboarding-book-${index}`}>Favorite book {index + 1}</label>
                <input
                  id={`onboarding-book-${index}`}
                  value={book}
                  onChange={(event) => setFavoriteBooks((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={index === 0 ? "Example: The Hobbit" : "Optional"}
                />
              </div>
            ))}
          </div>

          <div className="nested-section">
            <h3>Favorite Style</h3>
            <div className="field">
              <label htmlFor="onboarding-style">What kind of books sound fun?</label>
              <input
                id="onboarding-style"
                value={storyStyle}
                onChange={(event) => setStoryStyle(event.target.value)}
                placeholder="fantasy, mystery, funny, science, adventure"
              />
            </div>
          </div>
        </div>

        <div className="nested-section">
          <h3>Choose an Avatar</h3>
          <AvatarPicker selectedAvatar={selectedAvatar} onSelect={setSelectedAvatar} />
        </div>

        <div className="button-row">
          <button type="button" onClick={save}>Save Profile Setup</button>
          <button type="button" className="secondary" onClick={close}>Skip for now</button>
        </div>
      </section>
    </div>
  );
}
