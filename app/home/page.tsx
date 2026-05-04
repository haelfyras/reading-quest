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
  getBadges,
  getEffortPoints,
  getForgivingStreak,
  getLifetimePoints,
  getPointTimeline,
  getProfiles,
  getSpendablePoints,
  Profile,
} from "../../lib/user";
import { getBookRecommendations as buildRecommendations } from "../../lib/recommendations";
import BetaDisclaimer from "../components/BetaDisclaimer";

function recentTitle(profile: Profile | null) {
  if (!profile || profile.quizzes.length === 0) return "";
  return profile.quizzes.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].bookTitle;
}

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
  const effortPoints = currentUser ? getEffortPoints(currentUser) : 0;
  const streak = currentUser ? getForgivingStreak(currentUser) : { activeDaysThisWeek: 0, goalDays: 4, metThisWeek: false };
  const badges = currentUser ? getBadges(currentUser) : [];
  const sortedPrizeGoals = useMemo(
    () => prizeGoals.slice().sort((a, b) => a.pointsRequired - b.pointsRequired),
    [prizeGoals],
  );
  const nextPrizeGoal = sortedPrizeGoals.find((goal) => goal.pointsRequired > currentPoints);
  const pointsToNextPrize = nextPrizeGoal ? nextPrizeGoal.pointsRequired - currentPoints : 0;
  const progressMax = Math.max(currentPoints, ...sortedPrizeGoals.map((goal) => goal.pointsRequired), 1);
  const prizeProgressPercent = Math.min(100, (currentPoints / progressMax) * 100);
  const reachedPrizeCount = sortedPrizeGoals.filter((goal) => currentPoints >= goal.pointsRequired).length;
  const recommendationData = useMemo(() => buildRecommendations({ profile: currentUser, limit: 1 }), [currentUser]);
  const currentlyReading = currentUser?.readingNow?.[0] ?? recentTitle(currentUser);

  const childLeaderboard = useMemo(() => {
    return getProfiles()
      .filter((profile) => !profile.isParent)
      .slice()
      .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a));
  }, [currentUser]);

  const currentRank = currentUser ? childLeaderboard.findIndex((profile) => profile.id === currentUser.id) + 1 : 0;
  const pointsProgressData = useMemo(() => currentUser ? getPointTimeline(currentUser) : [], [currentUser]);

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
      </div>

      <BetaDisclaimer />

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
          <div className="stat-tile">
            <span>Effort points</span>
            <strong>{effortPoints}</strong>
          </div>
          <div className="stat-tile">
            <span>Reading days</span>
            <strong>{streak.activeDaysThisWeek} / {streak.goalDays}</strong>
            <span>this week</span>
          </div>
        </div>
        <Link href="/quiz">
          <button type="button" className="primary-action">Take a Quiz</button>
        </Link>
      </section>

      <section className="home-section reading-path" aria-labelledby="path-heading">
        <div className="section-header-row">
          <div>
            <h2 id="path-heading">Reading Path</h2>
            <p>{currentUser.avatarStyle || "Explorer"} mode is active.</p>
          </div>
          <Link href="/my-books">
            <button type="button" className="secondary">My Books</button>
          </Link>
        </div>
        <div className="path-steps">
          <div className={`path-step ${currentlyReading ? "done" : ""}`}>
            <strong>Read</strong>
            <span>{currentlyReading ? currentlyReading : "Pick a book to read first"}</span>
          </div>
          <div className={`path-step ${currentUser.quizzes.length ? "done" : ""}`}>
            <strong>Quiz</strong>
            <span>{currentUser.quizzes.length ? `${currentUser.quizzes.length} completed` : "Take your first quiz"}</span>
          </div>
          <div className={`path-step ${currentPoints > 0 ? "done" : ""}`}>
            <strong>Earn</strong>
            <span>{currentPoints} points ready</span>
          </div>
          <div className={`path-step ${nextPrizeGoal ? "" : "done"}`}>
            <strong>Goal</strong>
            <span>{nextPrizeGoal ? `${pointsToNextPrize} to ${nextPrizeGoal.name}` : "All prize goals reached"}</span>
          </div>
        </div>
        <div className="suggestion-card">
          <strong>Suggested next read</strong>
          <span>{recommendationData.suggestions[0] ?? "Add favorite books to unlock better picks."}</span>
          {recommendationData.suggestions[0] ? <small>{recommendationData.reasons[recommendationData.suggestions[0]]}</small> : null}
        </div>
        {badges.length > 0 ? (
          <div className="badge-row">
            {badges.slice(0, 6).map((badge) => <span key={badge} className="badge-pill">{badge}</span>)}
          </div>
        ) : (
          <p>Badges will appear as you read, quiz, improve, and recommend books.</p>
        )}
      </section>

      <section className="home-section points-panel home-prize-journey" aria-labelledby="prize-journey-heading">
        <div className="points-panel-header">
          <div>
            <h2 id="prize-journey-heading">Prize Journey</h2>
            <p>
              {currentPoints} points available
              {nextPrizeGoal ? ` - ${pointsToNextPrize} points to ${nextPrizeGoal.name}` : " - all prize goals reached"}
            </p>
          </div>
          <Link href="/prizes">
            <button type="button" className="secondary">Prizes</button>
          </Link>
        </div>
        <div
          className="progress-track compact-progress"
          role="progressbar"
          aria-label="Prize progress"
          aria-valuemin={0}
          aria-valuemax={progressMax}
          aria-valuenow={Math.min(currentPoints, progressMax)}
        >
          <div className="progress-fill" style={{ width: `${prizeProgressPercent}%` }} />
        </div>
        <div className="prize-milestone-list">
          {sortedPrizeGoals.map((goal) => (
            <span key={goal.id} className={currentPoints >= goal.pointsRequired ? "milestone-reached" : ""}>
              {goal.name}: {goal.pointsRequired}
            </span>
          ))}
        </div>
        <p className="setting-description">
          {reachedPrizeCount} of {sortedPrizeGoals.length} prize goals reached.
        </p>
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

    </main>
  );
}
