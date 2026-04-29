"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentProfile, verifyProfile, createProfile, setCurrentUserId, Profile } from "../lib/user";

export default function Page() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [userType, setUserType] = useState<"child" | "parent">("child");
  const [verificationCode, setVerificationCode] = useState("");
  const [showVerification, setShowVerification] = useState(false);

  useEffect(() => {
    const profile = getCurrentProfile();
    if (profile) {
      const destination = profile.isParent ? "/parent" : "/home";
      router.push(destination);
    }

    setIsLoading(false);
  }, [router]);

  const handleLogin = () => {
    if (!name.trim() || !password.trim()) {
      setError("Please enter both name and password.");
      return;
    }

    const profile = verifyProfile(name, password);
    if (profile) {
      setCurrentUserId(profile.id);
      setCurrentUser(profile);
      router.push(profile.isParent ? "/parent" : "/home");
    } else {
      setError("Invalid name or password.");
    }
  };

  const handleCreate = () => {
    if (!name.trim() || !password.trim()) {
      setError("Please enter both name and password.");
      return;
    }

    if (userType === "parent") {
      // For demo, just show verification step
      setShowVerification(true);
      setError("");
      // In real app, send email with code
      alert("Verification code sent to your email: 123456");
    } else {
      try {
        const profile = createProfile(name, password, false);
        setCurrentUser(profile);
        router.push("/home");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account.");
      }
    }
  };

  const handleVerify = () => {
    if (verificationCode === "123456") {
      try {
        const profile = createProfile(name, password, true, name); // name is email for parents
        setCurrentUser(profile);
        router.push("/parent");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account.");
      }
    } else {
      setError("Invalid verification code.");
    }
  };

  if (isLoading) {
    return <main><p>Loading...</p></main>;
  }

  if (showVerification) {
    return (
      <main>
        <h1>Verify Your Email</h1>
        <p>Enter the verification code sent to {name}.</p>

        <div className="field">
          <label htmlFor="code">Verification Code</label>
          <input
            id="code"
            type="text"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="123456"
          />
        </div>

        {error ? (
          <div className="output" style={{ background: "#fee2e2", color: "#991b1b" }}>
            <strong>Error:</strong> {error}
          </div>
        ) : null}

        <div className="button-row">
          <button onClick={handleVerify}>Verify</button>
          <button type="button" className="secondary" onClick={() => setShowVerification(false)}>
            Back
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Reading Quest</h1>
      <p>Sign in to your account or create a new one.</p>

      <div className="field">
        <label>Account type</label>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            onClick={() => setUserType("child")}
            style={{ background: userType === "child" ? "#2563eb" : "#d1d5db" }}
          >
            Child
          </button>
          <button
            type="button"
            onClick={() => setUserType("parent")}
            style={{ background: userType === "parent" ? "#2563eb" : "#d1d5db" }}
          >
            Parent
          </button>
        </div>
      </div>

      <div className="field">
        <label htmlFor="name">{userType === "parent" ? "Email" : "Screen name"}</label>
        <input
          id="name"
          type={userType === "parent" ? "email" : "text"}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={userType === "parent" ? "your@email.com" : "Your screen name"}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Your password"
        />
      </div>

      {error ? (
        <div className="output" style={{ background: "#fee2e2", color: "#991b1b" }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="button-row">
        <button onClick={isLogin ? handleLogin : handleCreate}>
          {isLogin ? "Sign in" : "Create account"}
        </button>
        <button type="button" className="secondary" onClick={() => setIsLogin(!isLogin)}>
          {isLogin ? "Need to create an account?" : "Already have an account?"}
        </button>
      </div>
    </main>
  );
}
