"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeroProfileActions from "../components/HeroProfileActions";
import {
  getCurrentProfile,
  getLifetimePoints,
  getSpendablePoints,
  getSpentPoints,
  childLibraryMessage,
  normalizeSubscriptionTier,
  parentLibraryMessage,
  Profile,
  setCurrentUserId,
  subscriptionPlans,
  SubscriptionTier,
  updateProfile,
} from "../../lib/user";

export default function SettingsPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [panelOpacity, setPanelOpacity] = useState(80);
  const [leaderboardPrivate, setLeaderboardPrivate] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");

  useEffect(() => {
    setUser(getCurrentProfile());
    const profile = getCurrentProfile();
    if (profile) {
      setLeaderboardPrivate(Boolean(profile.leaderboardPrivate));
      setSubscriptionTier(normalizeSubscriptionTier(profile.subscriptionTier));
    }

    const savedDarkMode = localStorage.getItem("readingQuestDarkMode") === "true";
    const savedFontSize = parseInt(localStorage.getItem("readingQuestFontSize") || "16", 10);
    const savedPanelOpacity = parseInt(
      localStorage.getItem("readingQuestPanelOpacity") || localStorage.getItem("readingQuestFantasyPanelOpacity") || "80",
      10
    );
    const safePanelOpacity = Number.isFinite(savedPanelOpacity)
      ? Math.min(100, Math.max(20, savedPanelOpacity))
      : 80;

    setDarkMode(savedDarkMode);
    setFontSize(savedFontSize);
    setPanelOpacity(safePanelOpacity);

    applyDarkMode(savedDarkMode);
    applyFontSize(savedFontSize);
    applyPanelOpacity(safePanelOpacity);
  }, []);

  const applyDarkMode = (isDark: boolean) => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("readingQuestDarkMode", isDark.toString());
  };

  const applyFontSize = (size: number) => {
    document.documentElement.style.setProperty("--font-size-base", `${size}px`);
    localStorage.setItem("readingQuestFontSize", size.toString());
  };

  const applyPanelOpacity = (opacity: number) => {
    const safeOpacity = Number.isFinite(opacity) ? Math.min(100, Math.max(20, opacity)) : 80;
    document.documentElement.style.setProperty("--theme-panel-opacity", `${safeOpacity / 100}`);
    localStorage.setItem("readingQuestPanelOpacity", safeOpacity.toString());
  };

  const handleDarkModeToggle = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    applyDarkMode(newDarkMode);
  };

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value, 10);
    setFontSize(newSize);
    applyFontSize(newSize);
  };

  const handlePanelOpacityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const opacity = parseInt(event.target.value, 10);
    setPanelOpacity(opacity);
    applyPanelOpacity(opacity);
  };

  const savePrivacyAndPlan = () => {
    if (!user) return;
    const updated = updateProfile({
      ...user,
      leaderboardPrivate,
      subscriptionTier,
    });
    setUser(updated);
    setSettingsMessage("Privacy and plan settings saved.");
  };

  const handleDeleteAccount = () => {
    if (!user || deletePassword !== user.password) {
      setDeleteMessage("Incorrect password. Account deletion cancelled.");
      return;
    }

    const profiles = JSON.parse(localStorage.getItem("readingQuestProfiles") || "[]");
    const updatedProfiles = profiles.filter((p: Profile) => p.id !== user.id);
    localStorage.setItem("readingQuestProfiles", JSON.stringify(updatedProfiles));

    setCurrentUserId(null);
    localStorage.removeItem("readingQuestCurrentUserId");

    window.location.href = "/";
  };

  if (!user) {
    return (
      <main>
        <h1>Settings</h1>
        <p>Please sign in first.</p>
        <Link href="/">
          <button type="button">Back to login</button>
        </Link>
      </main>
    );
  }

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Player Settings</div>
          <h1>Settings</h1>
          <p>Customize your Reading Quest experience.</p>
        </div>
        <HeroProfileActions profile={user} homeHref={user.isParent ? "/parent" : "/home"} />
      </div>

      <div className="settings-grid">
        <div className="settings-section">
          <h2>Appearance</h2>

          <div className="setting-item">
            <label className="setting-label">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={handleDarkModeToggle}
              />
              <span>Dark Mode</span>
            </label>
            <p className="setting-description">Switch between light and dark presentation.</p>
          </div>

          <div className="setting-item">
            <label className="setting-label">
              Font Size: {fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              value={fontSize}
              onChange={handleFontSizeChange}
              className="font-size-slider"
            />
            <p className="setting-description">Adjust text size for better readability.</p>
          </div>

          <div className="setting-item">
            <label htmlFor="panelOpacity" className="setting-label">
              Window opacity: {panelOpacity}%
            </label>
            <input
              id="panelOpacity"
              type="range"
              min="20"
              max="100"
              value={panelOpacity}
              onChange={handlePanelOpacityChange}
              className="font-size-slider"
            />
            <p className="setting-description">
              Lower values reveal more of the theme artwork. Increase opacity when you want a calmer, easier-to-read page.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <h2>Account</h2>

          <div className="setting-item">
            <h3>Profile Information</h3>
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Available Points:</strong> {getSpendablePoints(user)}</p>
            <p><strong>Lifetime Points Earned:</strong> {getLifetimePoints(user)}</p>
            <p><strong>Points Spent on Prizes:</strong> {getSpentPoints(user)}</p>
            <p><strong>Quizzes Completed:</strong> {user.quizzes.length}</p>
          </div>

          {!showDeleteConfirm ? (
            <div className="setting-item">
              <button
                type="button"
                className="danger-button"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </button>
              <p className="setting-description">Permanently delete your account and all data.</p>
            </div>
          ) : (
            <div className="setting-item delete-confirm">
              <h3>Confirm Account Deletion</h3>
              <p>This action cannot be undone. All your progress will be lost.</p>
              <div className="field">
                <label htmlFor="deletePassword">Enter your password to confirm:</label>
                <input
                  id="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    setDeleteMessage("");
                  }}
                  placeholder="Your password"
                />
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="danger-button"
                  onClick={handleDeleteAccount}
                  disabled={!deletePassword}
                >
                  Yes, Delete My Account
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword("");
                  }}
                >
                  Cancel
                </button>
              </div>
              {deleteMessage ? <div className="error-box">{deleteMessage}</div> : null}
            </div>
          )}
        </div>

        <div className="settings-section">
          <h2>Privacy and Safety</h2>
          <p className="setting-description">
            Reading Quest stores profile progress, quiz history, reading logs, prize claims, friends, and family verification status for the private beta experience.
            Friends can see the name you add for them. Verified parents can see linked child quiz history, reading logs, prize requests, and quiz reports.
          </p>
          <label className="setting-label">
            <input
              type="checkbox"
              checked={leaderboardPrivate}
              onChange={(event) => setLeaderboardPrivate(event.target.checked)}
            />
            <span>Keep me off public leaderboards</span>
          </label>
          <p className="setting-description">Private readers still keep points, badges, prizes, and personal progress.</p>
        </div>

        <div className="settings-section">
          <h2>Plan</h2>
          {user.isParent ? (
            <>
              <p className="setting-description">Free keeps Reading Quest accessible. Ad-Free removes friction. Plus gives families the full reading coach.</p>
              <div className="field">
                <label htmlFor="subscriptionTier">Current plan</label>
                <select id="subscriptionTier" value={subscriptionTier} onChange={(event) => setSubscriptionTier(event.target.value as SubscriptionTier)}>
                  {Object.entries(subscriptionPlans).map(([key, plan]) => (
                    <option key={key} value={key}>{plan.name}</option>
                  ))}
                </select>
              </div>
              <div className="plan-grid">
                {Object.entries(subscriptionPlans).map(([key, plan]) => (
                  <div key={key} className={`plan-card ${key === subscriptionTier ? "selected-plan" : ""}`}>
                    <strong>{plan.name}</strong>
                    <p className="kicker">{plan.tagline}</p>
                    <div className="plan-price-row">
                      <span>{plan.monthlyPrice}</span>
                      {plan.annualPrice ? <span>{plan.annualPrice}</span> : null}
                    </div>
                    <p>{plan.description}</p>
                    <p className="setting-description">
                      Includes {plan.includedChildren} child profiles.
                      {plan.extraChildPrice ? ` ${plan.extraChildPrice}.` : " Extra child seats are available on paid plans."}
                    </p>
                    <p className="setting-description">{plan.quizRule}</p>
                    <h3>Features</h3>
                    <ul className="small-list">
                      {plan.parentFeatures.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                    <h3>Parent reports</h3>
                    <ul className="small-list">
                      {plan.reportFeatures.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="notice">
                <strong>Library access matters.</strong> {parentLibraryMessage}
              </div>
              <button type="button" onClick={savePrivacyAndPlan}>Save privacy and plan</button>
              {settingsMessage ? <div className="success-box">{settingsMessage}</div> : null}
            </>
          ) : (
            <>
              <p className="setting-description">{subscriptionPlans[subscriptionTier].childUnlockMessage}</p>
              <div className="plan-grid">
                {Object.entries(subscriptionPlans).map(([key, plan]) => (
                  <div key={key} className={`plan-card ${key === subscriptionTier ? "selected-plan" : ""}`}>
                    <strong>{plan.name}</strong>
                    <p className="kicker">{plan.tagline}</p>
                    <p>{plan.childUnlockMessage}</p>
                    <ul className="small-list">
                      {plan.limits.filter((limit) => !limit.includes("$")).map((limit) => <li key={limit}>{limit}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="notice">
                <strong>{childLibraryMessage}</strong> Library books, audiobooks, ebooks, read-aloud books, and borrowed books all count.
              </div>
              <button type="button" onClick={savePrivacyAndPlan}>Save settings</button>
              {settingsMessage ? <div className="success-box">{settingsMessage}</div> : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
