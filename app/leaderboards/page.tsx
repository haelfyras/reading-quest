"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  getProfiles,
  Profile,
} from "../../lib/user";

export default function LeaderboardsPage() {
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);

  useEffect(() => {
    const profiles = getProfiles();
    const sorted = profiles.slice().sort((a, b) => b.points - a.points);
    setLeaderboard(sorted);

    const user = getCurrentProfile();
    setCurrentUser(user);
  }, []);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return `#${rank}`;
    }
  };

  const getUserRank = (userId: string) => {
    return leaderboard.findIndex((user) => user.id === userId) + 1;
  };

  const childLeaderboardSection = () => {
    if (!currentUser?.isParent || !currentUser.linkedChildren?.length) {
      return null;
    }

    return (
      <div className="leaderboard-section">
        <h2>Your Linked Children</h2>
        <p>See the ranking of the children linked to your parent account.</p>
        {currentUser.linkedChildren.map((childId) => {
          const childProfile = leaderboard.find((user) => user.id === childId);
          if (!childProfile) return null;
          return (
            <div key={childId} className="leaderboard-item child-rank">
              <div className="rank">{getRankIcon(getUserRank(childId))}</div>
              <div className="user-info">
                <div className="name">{childProfile.name}</div>
                <div className="stats">{childProfile.points} points • {childProfile.quizzes.length} quizzes</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main>
      <div className="topbar">
        <div>
          <h1>🏆 Leaderboards</h1>
          <p>See how you stack up against other readers!</p>
        </div>
        <Link href={currentUser?.isParent ? "/parent" : "/home"}>
          <button type="button" className="secondary">
            ← Back
          </button>
        </Link>
      </div>

      {currentUser?.isParent ? childLeaderboardSection() : null}

      <div className="leaderboard-section">
        <h2>Top Readers</h2>

        {currentUser && (
          <div className="current-user-rank">
            <h3>Your Rank: {getRankIcon(getUserRank(currentUser.id) || 0)}</h3>
            <p>You have {currentUser.points} points</p>
          </div>
        )}

        <div className="leaderboard-list">
          {leaderboard.slice(0, 10).map((user, index) => {
            const rank = index + 1;
            const isCurrentUser = currentUser?.id === user.id;

            return (
              <div
                key={user.id}
                className={`leaderboard-item ${isCurrentUser ? "current-user" : ""}`}
              >
                <div className="rank">
                  {getRankIcon(rank)}
                </div>
                <div className="user-info">
                  <div className="name">{user.name}</div>
                  <div className="stats">
                    {user.points} points • {user.quizzes.length} quizzes
                  </div>
                </div>
                {isCurrentUser && <div className="you-badge">YOU</div>}
              </div>
            );
          })}
        </div>

        {leaderboard.length === 0 && (
          <div className="empty-state">
            <p>No readers yet! Be the first to take a quiz and claim the top spot.</p>
          </div>
        )}
      </div>
    </main>
  );
}
