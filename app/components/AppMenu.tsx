"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getCurrentProfile,
  getPlanQuizAvailability,
  getProfiles,
  getQuizIssueReports,
  ParentVerificationRequest,
  Profile,
  setCurrentUserId,
} from "../../lib/user";
import { readPrizeAddRequests, readPrizes } from "../../lib/prizeData";
import { signOutSupabase } from "../../lib/supabase/auth";
import { isUuid } from "../../lib/ids";

const sharedLinks = [
  { href: "/my-books", label: "My Books" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/prizes", label: "Prizes" },
  { href: "/friends", label: "Friends" },
  { href: "/settings", label: "Settings" },
  { href: "/profile", label: "Profile" },
];

export default function AppMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationText, setNotificationText] = useState("");
  const [notificationHref, setNotificationHref] = useState("/profile");

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setProfile(null);
      return;
    }
    setProfile(getCurrentProfile());
    const refreshProfile = () => setProfile(getCurrentProfile());
    window.addEventListener("readingQuestProfileUpdated", refreshProfile);
    return () => window.removeEventListener("readingQuestProfileUpdated", refreshProfile);
  }, [pathname]);

  useEffect(() => {
    if (!profile || pathname.startsWith("/admin")) {
      setNotificationCount(0);
      setNotificationText("");
      setNotificationHref("/profile");
      return;
    }

    let active = true;
    const loadNotifications = async () => {
      const notifications: Array<{ text: string; href: string }> = [];
      try {
        const response = await fetch(`/api/family-verification?profileId=${encodeURIComponent(profile.id)}`);
        if (response.ok) {
          const data = await response.json() as { requests?: ParentVerificationRequest[] };
          const requests = data.requests ?? [];
          const needsChildApproval = !profile.isParent && requests.some((request) => request.status === "child_pending");
          const needsParentCode = profile.isParent && requests.some((request) => request.status === "code_pending" && !request.parentCodeEntered);
          const needsChildCode = !profile.isParent && requests.some((request) => request.status === "code_pending" && !request.childCodeEntered);
          if (needsChildApproval) notifications.push({ text: "Parent verification waiting", href: "/profile" });
          if (needsParentCode || needsChildCode) notifications.push({ text: "Verification code needed", href: "/profile" });
        }
      } catch {
        // Notifications are helpful, but should never block navigation.
      }

      if (profile.isParent) {
        let reportCount = getQuizIssueReports().filter((report) => report.status !== "dismissed" && !report.correctionPointsAwarded).length;
        try {
          if (!isUuid(profile.id)) {
            throw new Error("Local beta profile.");
          }
          const response = await fetch(`/api/quiz-report?parentId=${encodeURIComponent(profile.id)}&summary=true`);
          if (response.ok) {
            const data = await response.json() as { openCount?: number };
            reportCount = data.openCount ?? reportCount;
          }
        } catch {
          // Local notification fallback is enough if shared report data is unavailable.
        }
        if (reportCount > 0) {
          notifications.push({ text: `${reportCount} quiz review ${reportCount === 1 ? "item" : "items"}`, href: "/parent" });
        }

        const linkedChildIds = new Set(profile.linkedChildren ?? []);
        let pendingPrizeIdeas = readPrizeAddRequests().filter((request) =>
          linkedChildIds.has(request.childId) && request.status === "pending",
        ).length;
        let pendingPrizeClaims = getProfiles()
          .filter((child) => linkedChildIds.has(child.id))
          .reduce((total, child) => total + readPrizes(child.id).filter((prize) => prize.claimed).length, 0);

        try {
          if (!isUuid(profile.id)) {
            throw new Error("Local beta profile.");
          }
          const response = await fetch(`/api/prizes?parentId=${encodeURIComponent(profile.id)}&summary=true`);
          if (response.ok) {
            const data = await response.json() as { pendingPrizeIdeas?: number; pendingPrizeClaims?: number };
            pendingPrizeIdeas = data.pendingPrizeIdeas ?? pendingPrizeIdeas;
            pendingPrizeClaims = data.pendingPrizeClaims ?? pendingPrizeClaims;
          }
        } catch {
          // Local notification fallback is enough if shared prize data is unavailable.
        }

        if (pendingPrizeIdeas > 0) {
          notifications.push({ text: `${pendingPrizeIdeas} prize ${pendingPrizeIdeas === 1 ? "idea" : "ideas"} waiting`, href: "/prizes" });
        }
        if (pendingPrizeClaims > 0) {
          notifications.push({ text: `${pendingPrizeClaims} prize ${pendingPrizeClaims === 1 ? "claim" : "claims"} to complete`, href: "/prizes" });
        }
      }

      const quizAvailability = getPlanQuizAvailability(profile);
      const remainingQuizzes = Math.max(0, quizAvailability.limit - quizAvailability.used);
      if (remainingQuizzes > 0 && remainingQuizzes <= 2) {
        notifications.push({ text: `${remainingQuizzes} quiz ${remainingQuizzes === 1 ? "left" : "left"} today`, href: "/quiz" });
      }

      if (active) {
        setNotificationCount(notifications.length);
        setNotificationText(notifications.map((item) => item.text).join(" - "));
        setNotificationHref(notifications[0]?.href ?? (profile.isParent ? "/parent" : "/profile"));
      }
    };

    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pathname, profile]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const links = useMemo(() => {
    if (!profile) return [];

    return [
      { href: profile.isParent ? "/parent" : "/home", label: "Home" },
      { href: "/quiz", label: "Take a Quiz" },
      ...sharedLinks,
    ];
  }, [profile]);

  const signOut = async () => {
    setCurrentUserId(null);
    setProfile(null);
    setOpen(false);
    try {
      await signOutSupabase();
    } finally {
      router.replace("/");
    }
  };

  if (!profile || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`app-drawer-toggle ${notificationCount > 0 ? "has-notifications" : ""}`}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="app-navigation-drawer"
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
        {notificationCount > 0 ? <strong className="notification-dot">{notificationCount}</strong> : null}
      </button>

      <Link href="/quiz" className="fixed-quiz-action" onClick={() => setOpen(false)}>
        Take a Quiz
      </Link>

      {open ? <button type="button" className="app-drawer-scrim" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}

      <aside id="app-navigation-drawer" className={`app-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
        <div className="app-drawer-header">
          <div>
            <strong>Reading Quest</strong>
            <span>{profile.name}</span>
          </div>
          <button type="button" className="secondary drawer-close-button" onClick={() => setOpen(false)} aria-label="Close menu">
            Close
          </button>
        </div>

        {notificationCount > 0 ? (
          <Link href={notificationHref} className="drawer-notification" onClick={() => setOpen(false)}>
            <strong>Needs attention</strong>
            <span>{notificationText}</span>
          </Link>
        ) : null}

        <nav className="app-drawer-nav" aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button type="button" className="secondary drawer-signout-button" onClick={signOut}>
          Sign out
        </button>
      </aside>
    </>
  );
}
