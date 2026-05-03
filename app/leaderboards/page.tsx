"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  getLeaderboardScore,
  getLifetimePoints,
  getProfiles,
  Profile,
} from "../../lib/user";

type LeaderboardKind = "children" | "adults" | "all";
type LeaderboardMetric = "lifetime" | "weeklyEffort" | "improvement" | "genreExplorer" | "streak";

export default function LeaderboardsPage() {
  const [leaderboards, setLeaderboards] = useState<Record<LeaderboardKind, Profile[]>>({
    children: [],
    adults: [],
    all: [],
  });
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [metric, setMetric] = useState<LeaderboardMetric>("lifetime");

  useEffect(() => {
    const profiles = getProfiles();
    const publicProfiles = profiles.filter((profile) => !profile.leaderboardPrivate || profile.id === getCurrentProfile()?.id);
    const byMetric = (a: Profile, b: Profile) => getLeaderboardScore(b, metric) - getLeaderboardScore(a, metric);

    setLeaderboards({
      children: publicProfiles.filter((profile) => !profile.isParent).slice().sort(byMetric),
      adults: publicProfiles.filter((profile) => profile.isParent).slice().sort(byMetric),
      all: publicProfiles.slice().sort(byMetric),
    });
    setCurrentUser(getCurrentProfile());
  }, [metric]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return "1st";
      case 2:
        return "2nd";
      case 3:
        return "3rd";
      default:
        return `#${rank}`;
    }
  };

  const getUserRank = (profiles: Profile[], userId: string) => {
    const index = profiles.findIndex((user) => user.id === userId);
    return index >= 0 ? index + 1 : 0;
  };

  const renderLeaderboard = (
    kind: LeaderboardKind,
    title: string,
    description: string,
  ) => {
    const profiles = leaderboards[kind];
    const currentRank = currentUser ? getUserRank(profiles, currentUser.id) : 0;

    return (
      <div className="leaderboard-section">
        <h2>{title}</h2>
        <p>{description}</p>

        {currentUser && currentRank > 0 ? (
          <div className="current-user-rank">
            <h3>Your Rank: {getRankIcon(currentRank)}</h3>
            <p>Your score on this board is {getLeaderboardScore(currentUser, metric)}.</p>
          </div>
        ) : null}

        <div className="leaderboard-list">
          {profiles.slice(0, 10).map((user, index) => {
            const rank = index + 1;
            const isCurrentUser = currentUser?.id === user.id;

            return (
              <div
                key={`${kind}-${user.id}`}
                className={`leaderboard-item ${isCurrentUser ? "current-user" : ""}`}
              >
                <div className="rank">{getRankIcon(rank)}</div>
                <div className="user-info">
                  <div className="name">{user.name}</div>
                  <div className="stats">
                    {getLeaderboardScore(user, metric)} {metricLabel(metric).toLowerCase()} - {user.quizzes.length} quizzes
                  </div>
                </div>
                <div className="you-badge">{user.isParent ? "ADULT" : "CHILD"}</div>
                {isCurrentUser && <div className="you-badge">YOU</div>}
              </div>
            );
          })}
        </div>

        {profiles.length === 0 ? (
          <div className="empty-state">
            <p>No readers on this board yet.</p>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Reading Ranks</div>
          <h1>Leaderboards</h1>
          <p>See how readers stack up across children, adults, and everyone.</p>
        </div>
        <Link href={currentUser?.isParent ? "/parent" : "/home"}>
          <button type="button" className="secondary">
            Back
          </button>
        </Link>
      </div>

      <section className="home-section" aria-labelledby="fair-ranks-heading">
        <h2 id="fair-ranks-heading">Fair Ranking Mode</h2>
        <p>Choose the kind of progress you want to celebrate. Total points are only one way to read well.</p>
        <div className="segmented-control">
          {([
            ["lifetime", "Total Points"],
            ["weeklyEffort", "Weekly Effort"],
            ["improvement", "Most Improved"],
            ["genreExplorer", "Genre Explorer"],
            ["streak", "Reading Days"],
          ] as Array<[LeaderboardMetric, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={metric === value ? "selected" : "secondary"}
              onClick={() => setMetric(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {renderLeaderboard(
        "children",
        "Children Leaderboard",
        "Only child profiles are ranked here.",
      )}

      {renderLeaderboard(
        "adults",
        "Adults Leaderboard",
        "Only parent profiles are ranked here.",
      )}

      {renderLeaderboard(
        "all",
        "All Readers Leaderboard",
        "Children and adults are ranked together here.",
      )}
    </main>
  );
}

function metricLabel(metric: LeaderboardMetric) {
  switch (metric) {
    case "weeklyEffort":
      return "Weekly Effort";
    case "improvement":
      return "Improvement";
    case "genreExplorer":
      return "Genre Explorer";
    case "streak":
      return "Reading Days";
    default:
      return "Lifetime Points";
  }
}
