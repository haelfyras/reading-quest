"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import HeroProfileActions from "../components/HeroProfileActions";
import { getBadges, getCurrentProfile, type Profile } from "../../lib/user";

const achievementCatalog = [
  "First Quest",
  "First Book Completed",
  "Perfect Score",
  "Tried a Harder Book",
  "Genre Explorer",
  "Read Outside Comfort Zone",
  "Night Reader",
  "Detective Reader",
  "Mastered a Book",
];

const futureTroveSections = [
  {
    title: "Collectibles",
    description: "Bookmarks, artifacts, profile flair, and reading companions will live here as unlockable reading rewards.",
  },
  {
    title: "Genre Guilds",
    description: "Fantasy, Mystery, Sci-Fi, and Adventure guilds will help readers explore new kinds of books without making points feel unfair.",
  },
  {
    title: "Seasonal Quests",
    description: "Summer reading, spooky reading month, and library challenge week can become limited-time reading events.",
  },
];

export default function BadgesPage() {
  const [user, setUser] = useState<Profile | null>(null);

  useEffect(() => {
    setUser(getCurrentProfile());
  }, []);

  const earnedBadges = useMemo(() => user ? new Set(getBadges(user)) : new Set<string>(), [user]);

  if (!user) {
    return (
      <main>
        <h1>Treasure Trove</h1>
        <p>Please sign in first.</p>
        <Link href="/">
          <button type="button">Back to login</button>
        </Link>
      </main>
    );
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Achievement Vault</div>
          <h1>Treasure Trove</h1>
          <p>Collect badges as you read, explore, improve, and master books.</p>
        </div>
        <HeroProfileActions profile={user} homeHref={user.isParent ? "/parent" : "/home"} />
      </div>

      <section className="home-section" aria-labelledby="badges-heading">
        <div className="section-header-row">
          <div>
            <h2 id="badges-heading">Your Achievements</h2>
            <p>{earnedBadges.size} of {achievementCatalog.length} unlocked.</p>
          </div>
        </div>
        <div className="achievement-grid">
          {achievementCatalog.map((badge) => {
            const earned = earnedBadges.has(badge);
            return (
              <article key={badge} className={`achievement-card ${earned ? "earned" : ""}`}>
                <div className="achievement-medal" aria-hidden="true">{earned ? "Star" : "Lock"}</div>
                <h3>{badge}</h3>
                <p>{earned ? "Unlocked" : "Keep adventuring to unlock this badge."}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="home-section" aria-labelledby="future-trove-heading">
        <h2 id="future-trove-heading">Coming to the Trove</h2>
        <div className="achievement-grid">
          {futureTroveSections.map((section) => (
            <article key={section.title} className="achievement-card">
              <div className="achievement-medal" aria-hidden="true">Soon</div>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
