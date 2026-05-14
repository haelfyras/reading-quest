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
import { loadSiteLeaderboardProfiles } from "../../lib/leaderboards";
import { getBookRecommendations as buildRecommendations } from "../../lib/recommendations";
import BetaDisclaimer from "../components/BetaDisclaimer";
import SetupGuide, { type SetupStep } from "../components/SetupGuide";

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
  const [childLeaderboard, setChildLeaderboard] = useState<Profile[]>([]);

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
    loadSiteLeaderboardProfiles(profile.id)
      .then((profiles) => {
        setChildLeaderboard(
          profiles
            .filter((item) => !item.isParent)
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      })
      .catch(() => {
        setChildLeaderboard(
          getProfiles()
            .filter((item) => !item.isParent)
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      });
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
  const hasReadingInterests = Boolean(
    currentUser?.favoriteBooks?.filter(Boolean).length ||
    Object.values(currentUser?.readingPreferences ?? {}).some((value) => value.trim().length > 0),
  );
  const childSetupSteps: SetupStep[] = [
    {
      id: "account",
      title: "Create your reader account",
      description: "Use a unique screen name and password. Ask a parent for permission or help if you need it.",
      href: "/profile",
      actionLabel: "View profile",
      complete: true,
    },
    {
      id: "books",
      title: "Tell us what you like",
      description: "Add favorite books, or take the short interest quiz if you are still finding what you enjoy.",
      href: "/my-books",
      actionLabel: "Set up My Books",
      complete: hasReadingInterests,
    },
    {
      id: "quiz",
      title: "Read, then take a quiz",
      description: "Try a quiz on a book you have read, or use your suggestions to pick what to read next.",
      href: currentUser?.quizzes.length ? "/my-books" : "/quiz",
      actionLabel: "Take a Quiz",
      complete: (currentUser?.quizzes.length ?? 0) > 0,
    },
    {
      id: "prizes",
      title: "Check the prize path",
      description: "See what your points can earn. Ask a parent to sign up so they can update your prizes.",
      href: "/prizes",
      actionLabel: "See Prizes",
      complete: (currentUser?.quizzes.length ?? 0) > 0 && currentPoints > 0,
    },
  ];

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

      <SetupGuide
        title="Set Up Your Reading Quest"
        description="Follow these steps in order for the smoothest start, or jump around whenever you already know what you want to do."
        steps={childSetupSteps}
      />

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
          <div className="leaderboard-item current-user">
            <div className="rank">{currentRank > 0 ? `#${currentRank}` : "--"}</div>
            <div className="user-info">
              <div className="name">{currentUser.name}</div>
              <div className="stats">
                {getLifetimePoints(currentUser)} lifetime points
                {childLeaderboard.length > 0 ? ` - ${childLeaderboard.length} child readers ranked` : ""}
              </div>
            </div>
            <div className="you-badge">YOU</div>
          </div>
        </div>
      </section>

    </main>
  );
}
