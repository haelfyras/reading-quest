"use client";

import { FormEvent, useState } from "react";
import { COMPANY_NAME, PRODUCT_NAME } from "../../lib/product";

export default function AdminLogin({ configured }: { configured: boolean }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Admin sign-in failed." }));
      setError(data.error ?? "Admin sign-in failed.");
      setLoading(false);
      return;
    }

    window.location.reload();
  };

  return (
    <main className="admin-shell">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <div className="kicker">Secure Admin</div>
        <h1 id="admin-login-title">{PRODUCT_NAME} Admin</h1>
        <p>Sign in to review accounts, quiz quality, safety reports, prize activity, and beta health.</p>

        {!configured ? (
          <div className="warning-box" role="alert">
            Admin access is not configured yet. Add <strong>ADMIN_ACCESS_CODE</strong> to your environment before using this site.
          </div>
        ) : null}

        <form className="auth-form" onSubmit={signIn}>
          <div className="field">
            <label htmlFor="admin-code">Admin access code</label>
            <input
              id="admin-code"
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter admin code"
            />
          </div>

          {error ? <div className="error-box" role="alert">{error}</div> : null}

          <button type="submit" disabled={!configured || loading || !code.trim()}>
            {loading ? "Checking..." : "Open admin"}
          </button>
        </form>

        <p className="auth-footer-note">Built by {COMPANY_NAME}. Admin sessions expire after 12 hours.</p>
      </section>
    </main>
  );
}
