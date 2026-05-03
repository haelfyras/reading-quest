"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_NAME, PRODUCT_NAME, PRODUCT_VERSION } from "../lib/product";
import { createProfile, getCurrentProfile, Profile, setCurrentUserId, verifyProfile } from "../lib/user";

type UserType = "child" | "parent";
type AuthMode = "signIn" | "create";

const demoVerificationCode = "123456";

export default function Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [userType, setUserType] = useState<UserType>("child");
  const [screenName, setScreenName] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const profile = getCurrentProfile();
    if (profile) {
      router.push(profile.isParent ? "/parent" : "/home");
      return;
    }

    setIsLoading(false);
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
    setShowVerification(false);
    setVerificationCode("");
  };

  const goToProfile = (profile: Profile) => {
    setCurrentUserId(profile.id);
    setCurrentUser(profile);
    router.push(profile.isParent ? "/parent" : "/home");
  };

  const handleLogin = () => {
    if (!canSubmit) {
      setError("Please enter your account information.");
      return;
    }

    const profile = verifyProfile(identifier, password);
    if (!profile) {
      setError("That account information did not match. Check the spelling and try again.");
      return;
    }

    goToProfile(profile);
  };

  const handleCreate = () => {
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
      setShowVerification(true);
      setError("");
      return;
    }

    try {
      const profile = createProfile(screenName, password, false);
      goToProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    }
  };

  const handleVerify = () => {
    if (verificationCode.trim() !== demoVerificationCode) {
      setError("That verification code does not match.");
      return;
    }

    try {
      const profile = createProfile(parentName, password, true, parentEmail);
      goToProfile(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account.");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (showVerification) {
      handleVerify();
      return;
    }
    if (authMode === "signIn") {
      handleLogin();
    } else {
      handleCreate();
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
            <p>{modeCopy}</p>
          </div>
          <span className="version-pill">{PRODUCT_VERSION}</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!showVerification ? (
            <>
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

              <div className="role-picker" aria-label="Account type">
                <button
                  type="button"
                  className={userType === "child" ? "role-card selected" : "role-card"}
                  onClick={() => {
                    setUserType("child");
                    resetMessages();
                  }}
                >
                  <strong>Child reader</strong>
                  <span>Quizzes, books, points, badges, and prizes.</span>
                </button>
                <button
                  type="button"
                  className={userType === "parent" ? "role-card selected" : "role-card"}
                  onClick={() => {
                    setUserType("parent");
                    resetMessages();
                  }}
                >
                  <strong>Grown-up</strong>
                  <span>Family controls, review queue, reports, and prize approval.</span>
                </button>
              </div>

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
            </>
          ) : (
            <div className="verification-panel">
              <div>
                <div className="kicker">Parent Verification</div>
                <h2>Check your email</h2>
                <p>Enter the code sent to {parentEmail}. Demo code: <strong>{demoVerificationCode}</strong></p>
              </div>
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="123456"
                />
              </div>
            </div>
          )}

          {error ? (
            <div className="error-box" role="alert">
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          <div className="auth-actions">
            <button type="submit" disabled={!showVerification && !canSubmit}>
              {showVerification ? "Verify and continue" : authMode === "signIn" ? "Continue" : "Create account"}
            </button>
            {showVerification ? (
              <button type="button" className="secondary" onClick={() => setShowVerification(false)}>
                Back
              </button>
            ) : null}
          </div>
        </form>

        <div className="auth-trust-strip" aria-label="Safety features">
          <span>Ad-free child experience</span>
          <span>Parent verification</span>
          <span>Privacy controls</span>
        </div>

        <p className="auth-footer-note">{COMPANY_NAME} keeps the focus on reading: save books, build habits, earn fairly, and let parents review what matters.</p>
      </section>
    </main>
  );
}
