"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getCurrentProfile, Profile, setCurrentUserId } from "../../lib/user";

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

  useEffect(() => {
    if (pathname.startsWith("/admin")) {
      setProfile(null);
      return;
    }
    setProfile(getCurrentProfile());
  }, [pathname]);

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

  const signOut = () => {
    setCurrentUserId(null);
    setProfile(null);
    setOpen(false);
    router.push("/");
  };

  if (!profile || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="app-drawer-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="app-navigation-drawer"
        onClick={() => setOpen((current) => !current)}
      >
        <span />
        <span />
        <span />
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
