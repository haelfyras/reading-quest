"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentProfile, Profile, setCurrentUserId, updateProfile } from "../../lib/user";

export default function SettingsPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [theme, setTheme] = useState("fantasy");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => {
    setUser(getCurrentProfile());

    // Load settings from localStorage
    const savedDarkMode = localStorage.getItem("readingQuestDarkMode") === "true";
    const savedFontSize = parseInt(localStorage.getItem("readingQuestFontSize") || "16");
    const savedTheme = localStorage.getItem("readingQuestTheme") || "fantasy";

    setDarkMode(savedDarkMode);
    setFontSize(savedFontSize);
    setTheme(savedTheme);

    // Apply settings
    applyDarkMode(savedDarkMode);
    applyFontSize(savedFontSize);
    applyTheme(savedTheme);
  }, []);

  const applyDarkMode = (isDark: boolean) => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    localStorage.setItem("readingQuestDarkMode", isDark.toString());
  };

  const applyFontSize = (size: number) => {
    document.documentElement.style.setProperty("--font-size-base", `${size}px`);
    localStorage.setItem("readingQuestFontSize", size.toString());
  };

  const applyTheme = (selectedTheme: string) => {
    document.documentElement.setAttribute("data-theme-style", selectedTheme);
    localStorage.setItem("readingQuestTheme", selectedTheme);
  };

  const handleDarkModeToggle = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    applyDarkMode(newDarkMode);
  };

  const handleFontSizeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(event.target.value);
    setFontSize(newSize);
    applyFontSize(newSize);
  };

  const handleThemeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newTheme = event.target.value;
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const handleDeleteAccount = () => {
    if (!user || deletePassword !== user.password) {
      alert("Incorrect password. Account deletion cancelled.");
      return;
    }

    // Remove user from profiles
    const profiles = JSON.parse(localStorage.getItem("readingQuestProfiles") || "[]");
    const updatedProfiles = profiles.filter((p: Profile) => p.id !== user.id);
    localStorage.setItem("readingQuestProfiles", JSON.stringify(updatedProfiles));

    // Clear current user
    setCurrentUserId(null);
    localStorage.removeItem("readingQuestCurrentUserId");

    alert("Account deleted successfully.");
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
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Customize your Reading Quest experience</p>
        </div>
        <Link href="/home">
          <button type="button" className="secondary">
            ← Home
          </button>
        </Link>
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
            <p className="setting-description">Switch between light and dark themes</p>
          </div>

          <div className="setting-item">
            <label htmlFor="theme" className="setting-label">Theme</label>
            <select id="theme" value={theme} onChange={handleThemeChange}>
              <option value="fantasy">Fantasy (Dragons & Castles)</option>
              <option value="sci-fi">Sci-Fi (Space & Aliens)</option>
              <option value="horror">Horror (Spooky)</option>
              <option value="library">Library (Books & Shelves)</option>
            </select>
            <p className="setting-description">Choose your adventure theme</p>
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
            <p className="setting-description">Adjust text size for better readability</p>
          </div>
        </div>

        <div className="settings-section">
          <h2>Account</h2>

          <div className="setting-item">
            <h3>Profile Information</h3>
            <p><strong>Name:</strong> {user.name}</p>
            <p><strong>Points:</strong> {user.points}</p>
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
              <p className="setting-description">Permanently delete your account and all data</p>
            </div>
          ) : (
            <div className="setting-item delete-confirm">
              <h3>⚠️ Confirm Account Deletion</h3>
              <p>This action cannot be undone. All your progress will be lost.</p>
              <div className="field">
                <label htmlFor="deletePassword">Enter your password to confirm:</label>
                <input
                  id="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
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
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
