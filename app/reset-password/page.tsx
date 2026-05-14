"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { PRODUCT_NAME } from "../../lib/product";
import { getSupabaseErrorMessage, updateParentPassword } from "../../lib/supabase/auth";
import { createBrowserSupabaseClient, isSupabaseConfigured } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError("Password reset is not configured yet.");
      return;
    }

    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        setIsReady(Boolean(data.session));
        if (!data.session) {
          setError("This reset link is missing or expired. Please request a new password reset link.");
        }
      })
      .catch((sessionError) => {
        setError(getSupabaseErrorMessage(sessionError));
      });
  }, []);

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      await updateParentPassword(password);
      setMessage("Password updated. You can sign in with your new password.");
      setPassword("");
      setConfirmPassword("");
    } catch (updateError) {
      setError(getSupabaseErrorMessage(updateError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="reset-title">
        <div className="auth-brand">
          <div>
            <div className="kicker">Parent Account</div>
            <h1 id="reset-title">Reset Password</h1>
            <p>Choose a new password for your {PRODUCT_NAME} parent account.</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={submitNewPassword}>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <div className="password-field">
              <input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
              <button type="button" className="secondary" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Retype new password"
            />
          </div>

          {error ? <div className="error-box" role="alert">{error}</div> : null}
          {message ? <div className="success-box" role="status">{message}</div> : null}

          <div className="auth-actions">
            <button type="submit" disabled={!isReady || isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </button>
            <Link href="/">
              <button type="button" className="secondary">Back to sign in</button>
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
