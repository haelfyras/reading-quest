"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  getLifetimePoints,
  getProfiles,
  Profile,
} from "../../lib/user";
import { loadSiteLeaderboardProfiles } from "../../lib/leaderboards";

type LeaderboardKind = "children" | "adults" | "all";

export default function LeaderboardsPage() {
  const [leaderboards, setLeaderboards] = useState<Record<LeaderboardKind, Profile[]>>({
    children: [],
    adults: [],
    all: [],
  });
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [dataSource, setDataSource] = useState<"database" | "browser">("browser");
  const [isLoading, setIsLoading] = useState(true);

  const buildLeaderboards = (profiles: Profile[], currentProfile: Profile | null) => {
    const publicProfiles = profiles.filter((profile) => !profile.leaderboardPrivate || profile.id === currentProfile?.id);
    const byLifetimePoints = (a: Profile, b: Profile) => getLifetimePoints(b) - getLifetimePoints(a);

    setLeaderboards({
      children: publicProfiles.filter((profile) => !profile.isParent).slice().sort(byLifetimePoints),
      adults: publicProfiles.filter((profile) => profile.isParent).slice().sort(byLifetimePoints),
      all: publicProfiles.slice().sort(byLifetimePoints),
    });
  };

  useEffect(() => {
    const loadLeaderboards = async () => {
      const profile = getCurrentProfile();
      setCurrentUser(profile);

      try {
        const profiles = await loadSiteLeaderboardProfiles(profile?.id);
        buildLeaderboards(profiles, profile);
        setDataSource("database");
      } catch {
        buildLeaderboards(getProfiles(), profile);
        setDataSource("browser");
      } finally {
        setIsLoading(false);
      }
    };

    void loadLeaderboards();
  }, []);

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
            <p>Your score on this board is {getLifetimePoints(currentUser)} lifetime points.</p>
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
                    {getLifetimePoints(user)} lifetime points - {user.quizzes.length} quizzes
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

      <p className="auth-footer-note">
        Leaderboard source: {dataSource === "database" ? "all public beta accounts" : "this browser only"}.
      </p>

      {isLoading ? <div className="leaderboard-section"><p>Loading leaderboards...</p></div> : null}

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
