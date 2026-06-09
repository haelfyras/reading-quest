"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_NAME, PRODUCT_NAME, PRODUCT_VERSION } from "../lib/product";
import { createProfile, getCurrentProfile, Profile, setCurrentUserId, verifyProfile } from "../lib/user";
import {
  completeParentOAuthSignIn,
  createChildWithSupabase,
  createParentWithSupabase,
  EmailConfirmationRequiredError,
  getSupabaseErrorMessage,
  requestParentPasswordReset,
  signInChildWithSupabase,
  signInParentWithSupabase,
  signInParentWithGoogle,
} from "../lib/supabase/auth";
import { markProfileForOnboarding } from "./components/OnboardingModal";

type UserType = "child" | "parent";
type AuthMode = "signIn" | "create";

function pendingParentOnboardingKey(email: string) {
  return `readingQuestPendingParentOnboarding_${email.trim().toLowerCase()}`;
}

const pendingParentGoogleOnboardingKey = "readingQuestPendingParentGoogleOnboarding";

export default function Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [userType, setUserType] = useState<UserType>("child");
  const [roleChosen, setRoleChosen] = useState(false);
  const [screenName, setScreenName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const profile = getCurrentProfile();
    if (profile) {
      router.push(profile.isParent ? "/parent" : "/home");
      return;
    }

    let active = true;
    completeParentOAuthSignIn()
      .then((supabaseProfile) => {
        if (!active) return;
        if (supabaseProfile) {
          if (window.localStorage.getItem(pendingParentGoogleOnboardingKey) === "true") {
            markProfileForOnboarding(supabaseProfile.id);
            window.localStorage.removeItem(pendingParentGoogleOnboardingKey);
          }
          goToProfile(supabaseProfile);
          return;
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(getSupabaseErrorMessage(err));
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  const accountLabel = userType === "parent" ? "Grown-up email" : "Screen name";
  const identifier = userType === "parent" ? parentEmail.trim() : screenName.trim();
  const canSubmit = identifier.length > 0 && password.trim().length > 0;

  const modeCopy = useMemo(() => {
    if (authMode === "signIn") {
      return userType === "parent"
        ? "Use your email to manage family reading, prizes, reports, and safety settings."
        : "Use your screen name to continue your reading path.";
    }

    return userType === "parent"
      ? "Create a grown-up account first. You can verify children from Profile after sign-in."
      : "Create a child reader profile with a screen name. A parent can connect later.";
  }, [authMode, userType]);

  const resetMessages = () => {
    setError("");
    setNotice("");
  };

  const chooseRole = (nextUserType: UserType) => {
    setUserType(nextUserType);
    setRoleChosen(true);
    resetMessages();
  };

  const goToProfile = (profile: Profile) => {
    setCurrentUserId(profile.id);
    setCurrentUser(profile);
    router.push(profile.isParent ? "/parent" : "/home");
  };

  const handleLogin = async () => {
    if (!canSubmit) {
      setError("Please enter your account information.");
      return;
    }

    if (userType === "parent") {
      try {
        setIsSubmitting(true);
        const supabaseProfile = await signInParentWithSupabase(parentEmail, password);
        if (supabaseProfile) {
          const pendingKey = pendingParentOnboardingKey(parentEmail);
          if (window.localStorage.getItem(pendingKey) === "true") {
            markProfileForOnboarding(supabaseProfile.id);
            window.localStorage.removeItem(pendingKey);
          }
          goToProfile(supabaseProfile);
          return;
        }
        setError("Parent accounts require secure database sign-in. Check Supabase configuration and try again.");
        setIsSubmitting(false);
        return;
      } catch (err) {
        const message = getSupabaseErrorMessage(err);
        if (/email not confirmed|confirm/i.test(message)) {
          setNotice("Almost done. Please confirm your email address, then come back to sign in.");
          setError("");
        } else {
          setError(message);
          setNotice("");
        }
        setIsSubmitting(false);
        return;
      }
    }

    if (userType === "child") {
      try {
        setIsSubmitting(true);
        const supabaseProfile = await signInChildWithSupabase(screenName, password);
        if (supabaseProfile) {
          goToProfile(supabaseProfile);
          return;
        }
        setError("Parent accounts require secure database sign-in. Check Supabase configuration and try again.");
        setIsSubmitting(false);
        return;
      } catch (err) {
        setError(getSupabaseErrorMessage(err));
        setNotice("");
        setIsSubmitting(false);
        return;
      }
    }

    const profile = verifyProfile(identifier, password);
    if (!profile) {
      setError("That account information did not match. Check the spelling and try again.");
      setIsSubmitting(false);
      return;
    }

    goToProfile(profile);
  };

  const handleCreate = async () => {
    if (!canSubmit) {
      setError("Please enter your account information.");
      return;
    }

    if (password.trim().length < 6) {
      setError("Use at least 6 characters for the password.");
      return;
    }

    if (userType === "parent") {
      if (!parentName.trim()) {
        setError("Please enter the grown-up's real name.");
        return;
      }
      try {
        setIsSubmitting(true);
        const supabaseProfile = await createParentWithSupabase({
          email: parentEmail,
          password,
          realName: parentName,
        });
        if (supabaseProfile) {
          markProfileForOnboarding(supabaseProfile.id);
          goToProfile(supabaseProfile);
          return;
        }
      } catch (err) {
        if (err instanceof EmailConfirmationRequiredError) {
          window.localStorage.setItem(pendingParentOnboardingKey(parentEmail), "true");
          setNotice(err.message);
          setError("");
        } else {
          setError(getSupabaseErrorMessage(err));
          setNotice("");
        }
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const supabaseProfile = await createChildWithSupabase(screenName, password);
      if (supabaseProfile) {
        markProfileForOnboarding(supabaseProfile.id);
        goToProfile(supabaseProfile);
        return;
      }
      const profile = createProfile(screenName, password, false);
      markProfileForOnboarding(profile.id);
      goToProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    if (authMode === "signIn") {
      void handleLogin();
    } else {
      void handleCreate();
    }
  };

  const handleForgotPassword = async () => {
    resetMessages();

    if (userType === "child") {
      setNotice("Child accounts do not use email. Ask your verified parent to help reset your password. If no parent is connected yet, ask a parent to contact Reading Quest support from their account.");
      return;
    }

    if (!parentEmail.trim()) {
      setError("Enter the parent account email first, then choose Forgot password.");
      return;
    }

    try {
      setIsSubmitting(true);
      await requestParentPasswordReset(parentEmail);
      setNotice("Password reset sent. Check the parent email account for a secure reset link.");
    } catch (err) {
      setError(getSupabaseErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    resetMessages();
    if (userType !== "parent") {
      setError("Google sign-in is only available for parent accounts.");
      return;
    }

    try {
      setIsSubmitting(true);
      window.localStorage.setItem(pendingParentGoogleOnboardingKey, "true");
      await signInParentWithGoogle();
    } catch (err) {
      window.localStorage.removeItem(pendingParentGoogleOnboardingKey);
      setError(getSupabaseErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <main className="auth-shell"><p>Loading...</p></main>;
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <div>
            <div className="kicker">Family Reading Adventure</div>
            <h1 id="auth-title">{PRODUCT_NAME}</h1>
            <p>{roleChosen ? modeCopy : "Adventure begins with a book. Choose your path to start reading, quizzing, and earning parent-approved rewards."}</p>
          </div>
          <span className="version-pill">{PRODUCT_VERSION}</span>
        </div>

        <div className="auth-choice-heading">
          <strong>Choose Your Reading Adventure</strong>
          <span>{roleChosen ? `You are continuing as a ${userType === "parent" ? "parent" : "reader"}.` : "Pick the path that matches who is using Reading Quest."}</span>
        </div>

        <div className={roleChosen ? "role-picker compact" : "role-picker"} aria-label="Account type">
          <button
            type="button"
            className={userType === "child" ? "role-card child-role selected" : "role-card child-role"}
            onClick={() => chooseRole("child")}
          >
            <span className="role-icon" aria-hidden="true">RQ</span>
            <strong>Reader</strong>
            <span>Quizzes, books, points, badges, and prizes.</span>
          </button>
          <button
            type="button"
            className={userType === "parent" ? "role-card parent-role selected" : "role-card parent-role"}
            onClick={() => chooseRole("parent")}
          >
            <span className="role-icon" aria-hidden="true">OK</span>
            <strong>Parent</strong>
            <span>Family controls, reports, safety settings, and prize approval.</span>
          </button>
        </div>

        {roleChosen ? (
          <>
            <div className="auth-quick-steps" aria-label="How Reading Quest starts">
              <div><strong>1</strong><span>Create or sign in</span></div>
              <div><strong>2</strong><span>Add readers and books</span></div>
              <div><strong>3</strong><span>Start reading adventures</span></div>
            </div>

            <details className="auth-onboarding-panel">
              <summary>{userType === "parent" ? "Parent setup details" : "Reader setup details"}</summary>
              {userType === "parent" ? (
                <ol>
                  <li>Create with email and password.</li>
                  <li>Confirm your email, then sign in.</li>
                  <li>Add your child and follow the verification prompts.</li>
                  <li>Review quizzes, set prizes, and choose child settings.</li>
                </ol>
              ) : (
                <ol>
                  <li>Ask a parent for permission or help.</li>
                  <li>Create a unique screen name and password.</li>
                  <li>Add favorite books and choose an avatar.</li>
                  <li>Take a quiz on something you have read.</li>
                </ol>
              )}
            </details>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-toggle" role="tablist" aria-label="Account action">
                <button
                  type="button"
                  className={authMode === "signIn" ? "selected" : "secondary"}
                  onClick={() => {
                    setAuthMode("signIn");
                    resetMessages();
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === "create" ? "selected" : "secondary"}
                  onClick={() => {
                    setAuthMode("create");
                    resetMessages();
                  }}
                >
                  Create
                </button>
              </div>

              {userType === "parent" ? (
                <div className="parent-oauth-panel" aria-label="Parent Google sign-in">
                  <button type="button" className="google-auth-button" disabled={isSubmitting} onClick={() => void handleGoogleSignIn()}>
                    <span aria-hidden="true">G</span>
                    {isSubmitting ? "Opening Google..." : "Continue with Google"}
                  </button>
                  <p>Parents can use Google to sign in or create a parent account. Child readers still use screen names.</p>
                </div>
              ) : null}

              {authMode === "create" && userType === "parent" ? (
                <div className="field">
                  <label htmlFor="parentName">Grown-up real name</label>
                  <input
                    id="parentName"
                    autoComplete="name"
                    value={parentName}
                    onChange={(event) => setParentName(event.target.value)}
                    placeholder="Your name"
                  />
                </div>
              ) : null}

              <div className="field">
                <label htmlFor="identifier">{accountLabel}</label>
                <input
                  id="identifier"
                  type={userType === "parent" ? "email" : "text"}
                  inputMode={userType === "parent" ? "email" : "text"}
                  autoCapitalize={userType === "parent" ? "none" : "words"}
                  autoComplete={userType === "parent" ? "email" : "username"}
                  value={userType === "parent" ? parentEmail : screenName}
                  onChange={(event) => userType === "parent" ? setParentEmail(event.target.value) : setScreenName(event.target.value)}
                  placeholder={userType === "parent" ? "you@example.com" : "Reader name"}
                />
              </div>

              <div className="field">
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={authMode === "create" ? "At least 6 characters" : "Your password"}
                  />
                  <button type="button" className="secondary" onClick={() => setShowPassword((current) => !current)}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error ? (
                <div className="error-box" role="alert">
                  <strong>Error:</strong> {error}
                </div>
              ) : null}

              {notice ? (
                <div className="success-box" role="status">
                  <strong>{notice}</strong>
                </div>
              ) : null}

              <div className="auth-actions">
                <button type="submit" disabled={isSubmitting || !canSubmit}>
                  {isSubmitting ? "Working..." : authMode === "signIn" ? "Continue" : "Create Account"}
                </button>
                {authMode === "signIn" ? (
                  <button type="button" className="secondary" disabled={isSubmitting} onClick={() => void handleForgotPassword()}>
                    Forgot password?
                  </button>
                ) : null}
              </div>
            </form>
          </>
        ) : (
          <div className="auth-start-note">
            <strong>Safe for kids. Clear for parents.</strong>
            <span>Choose a path above to continue.</span>
          </div>
        )}

        <div className="auth-trust-strip" aria-label="Safety features">
          <span>Parent reviewed</span>
          <span>Privacy focused</span>
          <span>Books from home, school, or library</span>
        </div>

        <p className="auth-footer-note">{COMPANY_NAME} keeps the focus on reading: save books, build habits, earn fairly, and let parents review what matters.</p>
      </section>
    </main>
  );
}
