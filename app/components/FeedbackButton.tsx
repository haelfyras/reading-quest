"use client";

import { FormEvent, useEffect, useState } from "react";
import { BETA_FEEDBACK_KEY, betaConfig } from "../../lib/beta";
import { getCurrentProfile } from "../../lib/user";

type FeedbackEntry = {
  id: string;
  profileId?: string;
  profileName?: string;
  category: string;
  message: string;
  page: string;
  date: string;
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readFeedback() {
  try {
    const stored = window.localStorage.getItem(BETA_FEEDBACK_KEY);
    return stored ? (JSON.parse(stored) as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("General feedback");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    setShowButton(betaConfig.feedbackEnabled && Boolean(getCurrentProfile()) && !window.location.pathname.startsWith("/admin"));
  }, []);

  const submitFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus("Please write a short note before sending feedback.");
      return;
    }

    const profile = getCurrentProfile();
    const nextEntry: FeedbackEntry = {
      id: createId(),
      profileId: profile?.id,
      profileName: profile?.realName || profile?.name,
      category,
      message: trimmed,
      page: window.location.pathname,
      date: new Date().toISOString(),
    };

    window.localStorage.setItem(BETA_FEEDBACK_KEY, JSON.stringify([nextEntry, ...readFeedback()].slice(0, 120)));
    window.fetch("/api/beta-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "feedback", payload: nextEntry }),
    }).catch(() => {
      // Keep feedback available locally even if beta sync is unavailable.
    });
    setMessage("");
    setStatus("Thank you. Feedback saved for beta review.");
  };

  if (!showButton) {
    return null;
  }

  return (
    <>
      <button type="button" className="feedback-launch-button" onClick={() => setOpen(true)}>
        Provide Feedback
      </button>

      {open ? (
        <div className="feedback-modal-shell" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <button type="button" className="feedback-modal-scrim" aria-label="Close feedback form" onClick={() => setOpen(false)} />
          <section className="feedback-modal">
            <div className="section-header-row">
              <div>
                <div className="kicker">Private Beta</div>
                <h2 id="feedback-title">Provide Feedback</h2>
                <p>Tell us what felt confusing, fun, broken, unfair, or missing.</p>
              </div>
              <button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button>
            </div>
            <form onSubmit={submitFeedback}>
              <div className="field">
                <label htmlFor="feedback-category">Feedback type</label>
                <select id="feedback-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option>General feedback</option>
                  <option>Quiz quality</option>
                  <option>Book suggestions</option>
                  <option>Prizes or points</option>
                  <option>Parent controls</option>
                  <option>Child experience</option>
                  <option>Bug or error</option>
                  <option>Accessibility</option>
                  <option>Safety or privacy</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="feedback-message">What should we know?</label>
                <textarea
                  id="feedback-message"
                  rows={6}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Example: The quiz answer seemed wrong, or I could not find where to claim a prize."
                />
              </div>
              <button type="submit">Send feedback</button>
              {status ? <div className={status.startsWith("Thank") ? "success-box" : "error-box"}>{status}</div> : null}
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
