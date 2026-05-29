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
  getPlanQuizAvailability,
  getProfiles,
  getSpendablePoints,
  childLibraryMessage,
  isTestAccount,
  Profile,
} from "../../lib/user";
import { loadSiteLeaderboardProfiles } from "../../lib/leaderboards";
import { getBookRecommendations as buildRecommendations } from "../../lib/recommendations";
import { isUuid } from "../../lib/ids";
import BetaDisclaimer from "../components/BetaDisclaimer";
import HeroProfileActions from "../components/HeroProfileActions";
import SetupGuide, { type SetupStep } from "../components/SetupGuide";
import { getChestImageSrc, getHotStreakImageSrc, getStoredThemeStyle, type ThemeStyle } from "../../lib/themeAssets";

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
  { id: "1", name: "Buy a New Book", pointsRequired: 50 },
  { id: "2", name: "Extra Screen Time", pointsRequired: 200 },
  { id: "3", name: "New Toy", pointsRequired: 500 },
  { id: "4", name: "New Game", pointsRequired: 1000 },
];

const readingPathLabels = {
  explorer: "Explorer",
  genre_adventurer: "Genre Adventurer",
  skill_builder: "Skill Builder",
};

function getQuestActionLabel(profile: Profile) {
  return profile.quizzes.length > 0 ? "Continue Your Reading Quest" : "Start Reading Quest";
}

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [childLeaderboard, setChildLeaderboard] = useState<Profile[]>([]);
  const [prizeGoals, setPrizeGoals] = useState<PrizeGoal[]>(defaultPrizeGoals);
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>("library");

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
    setThemeStyle(getStoredThemeStyle());
    const loadLocalPrizeGoals = () => {
      if (typeof window === "undefined") return;
      const saved = localStorage.getItem(`readingQuestPrizes_${profile.id}`);
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) as PrizeGoal[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPrizeGoals(parsed);
        }
      } catch {
        setPrizeGoals(defaultPrizeGoals);
      }
    };

    if (isUuid(profile.id)) {
      fetch(`/api/prizes?childId=${encodeURIComponent(profile.id)}`)
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Prize data unavailable")))
        .then((data: { prizes?: PrizeGoal[] }) => {
          if (data.prizes?.length) {
            setPrizeGoals(data.prizes.map((prize) => ({
              id: prize.id,
              name: prize.name,
              pointsRequired: prize.pointsRequired,
            })));
          }
        })
        .catch(loadLocalPrizeGoals);
    } else {
      loadLocalPrizeGoals();
    }
    loadSiteLeaderboardProfiles(profile.id)
      .then((profiles) => {
        setChildLeaderboard(
          profiles
            .filter((item) => !item.isParent && !isTestAccount(item))
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      })
      .catch(() => {
        setChildLeaderboard(
          getProfiles()
            .filter((item) => !item.isParent && !isTestAccount(item))
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      });
  }, [router]);

  useEffect(() => {
    const refreshCurrentProfile = () => {
      const profile = getCurrentProfile();
      if (profile && !profile.isParent) {
        setCurrentUser(profile);
      }
    };

    window.addEventListener("readingQuestProfileUpdated", refreshCurrentProfile);
    const refreshTheme = () => setThemeStyle(getStoredThemeStyle());
    window.addEventListener("storage", refreshTheme);
    window.addEventListener("readingQuestProfileUpdated", refreshTheme);
    return () => {
      window.removeEventListener("readingQuestProfileUpdated", refreshCurrentProfile);
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("readingQuestProfileUpdated", refreshTheme);
    };
  }, []);

  const currentPoints = currentUser ? getSpendablePoints(currentUser) : 0;
  const lifetimePoints = currentUser ? getLifetimePoints(currentUser) : 0;
  const effortPoints = currentUser ? getEffortPoints(currentUser) : 0;
  const quizAvailability = currentUser ? getPlanQuizAvailability(currentUser) : null;
  const remainingQuizzes = quizAvailability ? Math.max(0, quizAvailability.limit - quizAvailability.used) : 0;
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
  const readingPath = currentUser?.readingPath ?? "explorer";
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
      actionLabel: "Set up Book Bag",
      complete: hasReadingInterests,
    },
    {
      id: "quiz",
      title: "Read, then take a quiz",
      description: "Try a quiz on a book you have read, or use your suggestions to pick what to read next.",
      href: currentUser?.quizzes.length ? "/my-books" : "/quiz",
      actionLabel: "Begin Quest",
      complete: (currentUser?.quizzes.length ?? 0) > 0,
    },
    {
      id: "prizes",
      title: "Check the prize path",
      description: "See what your points can earn. Ask a parent to sign up so they can update your prizes.",
      href: "/prizes",
      actionLabel: "Open Treasure Chest",
      complete: (currentUser?.quizzes.length ?? 0) > 0 && currentPoints > 0,
    },
  ];

  const currentRank = currentUser ? childLeaderboard.findIndex((profile) => profile.id === currentUser.id) + 1 : 0;
  const pointsProgressData = useMemo(() => currentUser ? getPointTimeline(currentUser) : [], [currentUser]);
  const questActionLabel = currentUser ? getQuestActionLabel(currentUser) : "Start Reading Quest";

  if (!currentUser) {
    return (
      <main>
        <p>Redirecting to login...</p>
      </main>
    );
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero quest-hub-hero">
        <div className="quest-hub-copy">
          <div className="kicker">Child Quest Hub</div>
          <h1>Reading Quest</h1>
          <p>
            Welcome back, {currentUser.name}!<br />
            You have {remainingQuizzes} {remainingQuizzes === 1 ? "quest" : "quests"} remaining today!
          </p>
          <div className="quest-hero-metrics">
            <span className="streak-chip">
              <img src={getHotStreakImageSrc()} alt="" />
              {streak.activeDaysThisWeek} / {streak.goalDays} reading days
            </span>
            <span>{currentPoints} points ready</span>
            <span>{currentRank ? `Rank #${currentRank}` : "Rank begins after your first quest"}</span>
          </div>
          <Link href="/quiz">
            <button type="button" className="primary-action quest-cta">{questActionLabel}</button>
          </Link>
        </div>
        <HeroProfileActions profile={currentUser} />
      </div>

      <section className="home-section quest-now-section" aria-labelledby="quest-now-heading">
        <div className="mascot-callout">
          <img src="/avatars/tassel.png" alt="" />
          <div>
            <h2 id="quest-now-heading">Your Next Adventure</h2>
            <p>{currentlyReading ? `Keep going with ${currentlyReading}.` : "Pick a book you have read, then begin your first challenge."}</p>
          </div>
        </div>
        <div className="next-reward-card">
          <img
            className="treasure-chest-image"
            src={getChestImageSrc(themeStyle, !nextPrizeGoal)}
            alt=""
          />
          <div>
            <strong>Next Reward</strong>
            <span>{nextPrizeGoal ? nextPrizeGoal.name : "All reward goals reached"}</span>
            <small>{nextPrizeGoal ? `${pointsToNextPrize} points away` : "Amazing work."}</small>
          </div>
        </div>
        <div className="suggestion-card adventure-found-card">
          <strong>Suggested Next Read</strong>
          <span>{recommendationData.suggestions[0] ?? "Add favorite books to unlock better picks."}</span>
          {recommendationData.suggestions[0] ? <small>{recommendationData.reasons[recommendationData.suggestions[0]]}</small> : null}
        </div>
      </section>

      <section className="home-section points-panel home-prize-journey" aria-labelledby="prize-journey-heading">
        <div className="points-panel-header">
          <div>
            <h2 id="prize-journey-heading">Treasure Path</h2>
            <p>
              {currentPoints} points available
              {nextPrizeGoal ? ` - ${pointsToNextPrize} points to ${nextPrizeGoal.name}` : " - all prize goals reached"}
            </p>
          </div>
          <Link href="/prizes">
            <button type="button" className="secondary">Treasure Chest</button>
          </Link>
        </div>
        <div
          className="progress-track compact-progress treasure-track"
          role="progressbar"
          aria-label="Prize progress"
          aria-valuemin={0}
          aria-valuemax={progressMax}
          aria-valuenow={Math.min(currentPoints, progressMax)}
        >
          <div className="progress-fill" style={{ width: `${prizeProgressPercent}%` }} />
        </div>
        <div className="prize-milestone-list treasure-milestones">
          {sortedPrizeGoals.map((goal) => (
            <span
              key={goal.id}
              className={`${currentPoints >= goal.pointsRequired ? "milestone-reached" : ""} ${nextPrizeGoal?.id === goal.id ? "next-milestone" : ""}`}
            >
              <img
                className="treasure-chest-image small"
                src={getChestImageSrc(themeStyle, currentPoints >= goal.pointsRequired)}
                alt=""
              />
              {goal.name}: {goal.pointsRequired}
            </span>
          ))}
        </div>
        <p className="setting-description">
          {reachedPrizeCount} of {sortedPrizeGoals.length} treasure goals reached.
        </p>
      </section>

      <div className="home-accordion-stack">
        {!childSetupSteps.every((step) => step.complete) ? (
          <details className="home-section quest-accordion" open>
            <summary>Suggested Setup Path</summary>
            <SetupGuide
              title="Set Up Your Reading Quest"
              description="Follow these steps in order for the smoothest start, or jump around whenever you already know what you want to do."
              steps={childSetupSteps}
            />
          </details>
        ) : null}

        <details className="home-section quest-accordion">
          <summary>Reading Journey</summary>
          <div className="section-header-row">
            <div>
              <h2 id="path-heading">Reading Path</h2>
              <p>{readingPathLabels[readingPath]} path is active.</p>
            </div>
            <Link href="/my-books">
              <button type="button" className="secondary">Book Bag</button>
            </Link>
          </div>
          <div className="path-steps adventure-path-steps">
          <div className={`path-step ${currentlyReading ? "done" : ""}`}>
            <strong>Read</strong>
            <span>{currentlyReading ? currentlyReading : "Pick a book to read first"}</span>
          </div>
          <div className={`path-step ${currentUser.quizzes.length ? "done" : ""}`}>
            <strong>Challenge</strong>
            <span>{currentUser.quizzes.length ? `${currentUser.quizzes.length} completed` : "Begin your first quest"}</span>
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
        {badges.length > 0 ? (
          <div className="badge-row">
            {badges.slice(0, 6).map((badge) => <span key={badge} className="badge-pill">{badge}</span>)}
          </div>
        ) : (
          <p>Badges will appear as you read, complete quests, improve, and recommend books.</p>
        )}
        </details>

        <details className="home-section quest-accordion">
          <summary>Stats</summary>
          <div className="hero-stats">
            <div className="stat-tile"><span>Available points</span><strong>{currentPoints}</strong></div>
            <div className="stat-tile"><span>Lifetime earned</span><strong>{lifetimePoints}</strong></div>
            <div className="stat-tile"><span>Effort points</span><strong>{effortPoints}</strong></div>
            <div className="stat-tile"><span>Reading days</span><strong>{streak.activeDaysThisWeek} / {streak.goalDays}</strong><span>this week</span></div>
          </div>
          <h3 id="progress-heading">Points Journey</h3>
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
            <p>Begin your first quest to start your points graph.</p>
          )}
        </details>

        <details className="home-section quest-accordion">
          <summary>Hall of Legends</summary>
          <div className="section-header-row">
            <div>
              <h2 id="leaderboard-heading">Hall of Legends</h2>
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
        </details>

        <details className="home-section quest-accordion">
          <summary>Library Quest</summary>
          <h2 id="library-note-heading">Library Quest</h2>
          <p><strong>{childLibraryMessage}</strong></p>
          <p>Local libraries are a great way to learn more and earn more. Library books, audiobooks, ebooks, read-aloud books, and borrowed books all count in Reading Quest.</p>
        </details>

        <details className="home-section quest-accordion">
          <summary>Beta Info</summary>
          <BetaDisclaimer />
        </details>
      </div>

    </main>
  );
}
