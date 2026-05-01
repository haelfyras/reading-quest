"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getCurrentProfile,
  getLifetimePoints,
  getPointTimeline,
  getProfiles,
  getSpendablePoints,
  Profile,
  setCurrentUserId,
} from "../../lib/user";

type PrizeGoal = {
  id: string;
  name: string;
  pointsRequired: number;
};

const defaultPrizeGoals: PrizeGoal[] = [
  { id: "1", name: "Buy a New Book", pointsRequired: 100 },
  { id: "2", name: "TV/Movie Time", pointsRequired: 250 },
  { id: "3", name: "Buy a New Toy", pointsRequired: 500 },
  { id: "4", name: "Library Trip", pointsRequired: 750 },
  { id: "5", name: "Special Badge", pointsRequired: 1000 },
];

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  useEffect(() => {
    const profile = getCurrentProfile();

    if (!profile) {
      router.push("/");
      return;
    }

    if (profile.isParent) {
      router.push("/parent");
      return;
    }

    setCurrentUser(profile);
  }, [router]);

  const prizeGoals = useMemo(() => {
    if (!currentUser || typeof window === "undefined") {
      return defaultPrizeGoals;
    }

    const saved = localStorage.getItem(`readingQuestPrizes_${currentUser.id}`);
    if (!saved) {
      return defaultPrizeGoals;
    }

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultPrizeGoals;
    } catch {
      return defaultPrizeGoals;
    }
  }, [currentUser]);

  const currentPoints = currentUser ? getSpendablePoints(currentUser) : 0;
  const lifetimePoints = currentUser ? getLifetimePoints(currentUser) : 0;
  const nextPrizeGoal = prizeGoals.find((goal) => goal.pointsRequired > currentPoints);
  const pointsToNextPrize = nextPrizeGoal ? nextPrizeGoal.pointsRequired - currentPoints : 0;

  const childLeaderboard = useMemo(() => {
    return getProfiles()
      .filter((profile) => !profile.isParent)
      .slice()
      .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a));
  }, [currentUser]);

  const currentRank = currentUser ? childLeaderboard.findIndex((profile) => profile.id === currentUser.id) + 1 : 0;
  const pointsProgressData = useMemo(() => currentUser ? getPointTimeline(currentUser) : [], [currentUser]);

  const handleSignOut = () => {
    setCurrentUserId(null);
    router.push("/");
  };

  if (!currentUser) {
    return (
      <main>
        <p>Redirecting to login...</p>
      </main>
    );
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Child Quest Hub</div>
          <h1>Reading Quest</h1>
          <p>Welcome back, {currentUser.name}.</p>
        </div>
        <div className="topbar-actions">
          <Link href="/profile">
            <button type="button" className="secondary">Profile</button>
          </Link>
          <button type="button" className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <section className="home-section summary-section" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Today</h2>
        <div className="hero-stats">
          <div className="stat-tile">
            <span>Available points</span>
            <strong>{currentPoints}</strong>
          </div>
          <div className="stat-tile">
            <span>Lifetime earned</span>
            <strong>{lifetimePoints}</strong>
          </div>
          <div className="stat-tile">
            <span>Next goal</span>
            <strong>{nextPrizeGoal ? pointsToNextPrize : 0}</strong>
            <span>{nextPrizeGoal ? `to ${nextPrizeGoal.name}` : "All goals reached"}</span>
          </div>
          <div className="stat-tile">
            <span>Child rank</span>
            <strong>{currentRank ? `#${currentRank}` : "--"}</strong>
          </div>
        </div>
        <Link href="/quiz">
          <button type="button" className="primary-action">Take a Quiz</button>
        </Link>
      </section>

      <section className="home-section" aria-labelledby="progress-heading">
        <h2 id="progress-heading">Points Journey</h2>
        {pointsProgressData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={pointsProgressData} margin={{ top: 20, right: 20, bottom: 40, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="eventNumber" label={{ value: "Event", position: "bottom", offset: 20 }} tickMargin={10} />
              <YAxis label={{ value: "Points", angle: -90, position: "left", offset: 0 }} tickMargin={10} />
              <Tooltip formatter={(value) => `${value} points`} />
              <Line type="monotone" name="Earned" dataKey="earned" stroke="var(--accent)" strokeWidth={3} dot={{ fill: "var(--accent)" }} />
              <Line type="monotone" name="Spent" dataKey="spent" stroke="var(--danger)" strokeWidth={3} dot={{ fill: "var(--danger)" }} />
              <Line type="monotone" name="Available" dataKey="available" stroke="var(--success)" strokeWidth={3} dot={{ fill: "var(--success)" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p>Take your first quiz to start your points graph.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="leaderboard-heading">
        <div className="section-header-row">
          <div>
            <h2 id="leaderboard-heading">Leaderboard</h2>
            <p>Your rank on the children leaderboard.</p>
          </div>
          <Link href="/leaderboards">
            <button type="button" className="secondary">View all</button>
          </Link>
        </div>
        <div className="leaderboard-list compact-list">
          {childLeaderboard.slice(0, 3).map((profile, index) => (
            <div key={profile.id} className={`leaderboard-item ${profile.id === currentUser.id ? "current-user" : ""}`}>
              <div className="rank">#{index + 1}</div>
              <div className="user-info">
                <div className="name">{profile.name}</div>
                <div className="stats">{getLifetimePoints(profile)} lifetime points</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <nav className="home-section" aria-labelledby="menu-heading">
        <h2 id="menu-heading">Menu</h2>
        <div className="menu-grid app-menu-grid">
          <Link href="/my-books"><button type="button" className="menu-button primary">My Books</button></Link>
          <Link href="/leaderboards"><button type="button" className="menu-button secondary">Leaderboards</button></Link>
          <Link href="/prizes"><button type="button" className="menu-button accent">Prizes</button></Link>
          <Link href="/settings"><button type="button" className="menu-button neutral">Settings</button></Link>
          <Link href="/profile"><button type="button" className="menu-button neutral">Profile</button></Link>
        </div>
      </nav>
    </main>
  );
}
