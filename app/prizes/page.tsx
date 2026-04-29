"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentProfile, Profile } from "../../lib/user";

type Prize = {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  icon: string;
  claimed: boolean;
};

export default function PrizesPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [hasParentSetup, setHasParentSetup] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentProfile();
    setUser(currentUser);

    if (!currentUser) {
      return;
    }

    const parentPrizes = localStorage.getItem(`readingQuestPrizes_${currentUser.id}`);
    if (parentPrizes) {
      setHasParentSetup(true);
      setPrizes(JSON.parse(parentPrizes));
    } else {
      setPrizes([
        {
          id: "1",
          name: "Book Buddy",
          description: "A special bookmark and reading light",
          pointsRequired: 100,
          icon: "📖",
          claimed: false,
        },
        {
          id: "2",
          name: "Story Time",
          description: "Extra 30 minutes of screen time",
          pointsRequired: 250,
          icon: "⏰",
          claimed: false,
        },
        {
          id: "3",
          name: "Library Trip",
          description: "Family trip to the library",
          pointsRequired: 500,
          icon: "🏛️",
          claimed: false,
        },
        {
          id: "4",
          name: "Reading Champion",
          description: "Special badge and certificate",
          pointsRequired: 1000,
          icon: "🏆",
          claimed: false,
        },
      ]);
    }
  }, []);

  const claimPrize = (prizeId: string) => {
    if (!user) return;

    setPrizes(prev => prev.map(prize =>
      prize.id === prizeId && user.points >= prize.pointsRequired
        ? { ...prize, claimed: true }
        : prize
    ));

    // Save claimed status
    const updatedPrizes = prizes.map(prize =>
      prize.id === prizeId ? { ...prize, claimed: true } : prize
    );
    localStorage.setItem(`readingQuestPrizes_${user.id}`, JSON.stringify(updatedPrizes));
  };

  if (!user) {
    return (
      <main>
        <h1>Prizes</h1>
        <p>Please sign in first.</p>
        <Link href="/">
          <button type="button">Back to login</button>
        </Link>
      </main>
    );
  }

  return (
    <main>
      <div className="topbar">
        <div>
          <h1>🎁 My Prizes</h1>
          <p>You have {user.points} points to spend!</p>
        </div>
        <button type="button" className="secondary" onClick={() => router.push("/home") }>
          ← Home
        </button>
      </div>

      {!hasParentSetup && (
        <div className="output" style={{ background: "#fef3c7", color: "#92400e", marginBottom: "24px" }}>
          <strong>Note:</strong> These are default prizes. Ask a parent to set up custom prizes for you!
        </div>
      )}

      <div className="prizes-grid">
        {prizes.map((prize) => {
          const canClaim = user.points >= prize.pointsRequired && !prize.claimed;
          const isClaimed = prize.claimed;
          const isEligible = user.points >= prize.pointsRequired;

          return (
            <div
              key={prize.id}
              className={`prize-card ${isClaimed ? "claimed" : ""} ${isEligible ? "eligible" : ""}`}
            >
              <div className="prize-icon">{prize.icon}</div>
              <h3>{prize.name}</h3>
              <p className="prize-description">{prize.description}</p>
              <div className="prize-points">
                {prize.pointsRequired} points required
              </div>

              {isClaimed ? (
                <div className="claimed-badge">✅ Claimed!</div>
              ) : canClaim ? (
                <button
                  type="button"
                  className="claim-button"
                  onClick={() => claimPrize(prize.id)}
                >
                  Claim Prize
                </button>
              ) : (
                <div className="points-needed">
                  Need {prize.pointsRequired - user.points} more points
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasParentSetup && (
        <div className="output" style={{ marginTop: "24px" }}>
          <p>
            <strong>Parent Setup:</strong> These prizes were customized by a parent.
            Contact them if you'd like to change the available prizes.
          </p>
        </div>
      )}
    </main>
  );
}
