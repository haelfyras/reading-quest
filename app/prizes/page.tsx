"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  getLifetimePoints,
  getProfiles,
  getSpendablePoints,
  getSpentPoints,
  Profile,
  redeemPrize,
} from "../../lib/user";

type Prize = {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
  icon?: string;
  claimed?: boolean;
  claimCount?: number;
  requestedAt?: string;
  lastClaimedAt?: string;
};

const defaultPrizes: Prize[] = [
  {
    id: "1",
    name: "Book Buddy",
    description: "A special bookmark and reading light",
    pointsRequired: 100,
    icon: "Book",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "2",
    name: "Story Time",
    description: "Extra 30 minutes of screen time",
    pointsRequired: 250,
    icon: "Time",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "3",
    name: "Library Trip",
    description: "Family trip to the library",
    pointsRequired: 500,
    icon: "Trip",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "4",
    name: "Reading Champion",
    description: "Special badge and certificate",
    pointsRequired: 1000,
    icon: "Badge",
    claimed: false,
    claimCount: 0,
  },
];

const prizeSuggestionSets = [
  [
    {
      name: "Screen Time",
      description: "Extra 20 minutes of screen time",
      pointsRequired: 10,
      icon: "Time",
      tier: "Cheap or free",
    },
    {
      name: "New Book",
      description: "Choose a new or used book",
      pointsRequired: 10,
      icon: "Book",
      tier: "Tangible",
    },
    {
      name: "Zoo Trip",
      description: "Family trip to the zoo",
      pointsRequired: 750,
      icon: "Trip",
      tier: "Larger reward",
    },
  ],
  [
    {
      name: "Playground Time",
      description: "Special trip to a favorite playground",
      pointsRequired: 25,
      icon: "Play",
      tier: "Cheap or free",
    },
    {
      name: "Small Toy",
      description: "Pick a small toy within the family budget",
      pointsRequired: 100,
      icon: "Toy",
      tier: "Tangible",
    },
    {
      name: "Aquarium Trip",
      description: "Family trip to an aquarium",
      pointsRequired: 900,
      icon: "Trip",
      tier: "Larger reward",
    },
  ],
  [
    {
      name: "Movie Night",
      description: "Family movie night at home",
      pointsRequired: 50,
      icon: "Movie",
      tier: "Cheap or free",
    },
    {
      name: "New Game",
      description: "Choose a board game, card game, or used video game",
      pointsRequired: 250,
      icon: "Game",
      tier: "Tangible",
    },
    {
      name: "Theme Park Day",
      description: "A larger family outing or special day trip",
      pointsRequired: 1500,
      icon: "Trip",
      tier: "Larger reward",
    },
  ],
];

export default function PrizesPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [children, setChildren] = useState<Profile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [hasParentSetup, setHasParentSetup] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [suggestionSetIndex, setSuggestionSetIndex] = useState(0);

  useEffect(() => {
    const currentUser = getCurrentProfile();
    setUser(currentUser);

    if (!currentUser) {
      return;
    }

    if (currentUser.isParent) {
      const linkedChildren = getProfiles().filter((profile) => currentUser.linkedChildren?.includes(profile.id));
      setChildren(linkedChildren);
      if (linkedChildren[0]) {
        setSelectedChildId(linkedChildren[0].id);
        const savedPrizes = localStorage.getItem(`readingQuestPrizes_${linkedChildren[0].id}`);
        setPrizes(savedPrizes ? JSON.parse(savedPrizes) : defaultPrizes);
      }
      return;
    }

    const parentPrizes = localStorage.getItem(`readingQuestPrizes_${currentUser.id}`);
    if (parentPrizes) {
      setHasParentSetup(true);
      setPrizes(JSON.parse(parentPrizes));
    } else {
      setPrizes(defaultPrizes);
    }
  }, []);

  const loadChildPrizes = (childId: string) => {
    setSelectedChildId(childId);
    const savedPrizes = localStorage.getItem(`readingQuestPrizes_${childId}`);
    setPrizes(savedPrizes ? JSON.parse(savedPrizes) : defaultPrizes);
    setClaimMessage("");
  };

  const updateParentPrize = (index: number, field: keyof Prize, value: string) => {
    setPrizes((current) => current.map((prize, idx) => idx === index ? {
      ...prize,
      [field]: field === "pointsRequired" ? Number(value) : value,
    } : prize));
    setClaimMessage("");
  };

  const addParentPrize = () => {
    setPrizes((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        name: "",
        description: "",
        pointsRequired: 100,
        claimed: false,
        claimCount: 0,
      },
    ]);
  };

  const addSuggestedPrize = (suggestion: typeof prizeSuggestionSets[number][number]) => {
    setPrizes((current) => [
      ...current,
      {
        id: `suggestion-${Date.now()}-${current.length}`,
        name: suggestion.name,
        description: suggestion.description,
        pointsRequired: Math.max(10, suggestion.pointsRequired),
        icon: suggestion.icon,
        claimed: false,
        claimCount: 0,
      },
    ]);
    setClaimMessage(`${suggestion.name} added. Save prizes when you are ready.`);
  };

  const saveParentPrizes = () => {
    if (!selectedChildId) {
      setClaimMessage("Select a child before saving prizes.");
      return;
    }

    const validPrizes = prizes.filter((prize) => prize.name.trim() && prize.pointsRequired > 0);
    if (!validPrizes.length) {
      setClaimMessage("Add at least one prize with a name and point value.");
      return;
    }

    localStorage.setItem(`readingQuestPrizes_${selectedChildId}`, JSON.stringify(validPrizes));
    setPrizes(validPrizes);
    setClaimMessage("Prizes saved.");
  };

  const markPrizeRedeemed = (prizeId: string) => {
    if (!selectedChildId) return;

    const updatedPrizes = prizes.map((prize) => prize.id === prizeId ? {
      ...prize,
      claimed: false,
      requestedAt: undefined,
    } : prize);
    localStorage.setItem(`readingQuestPrizes_${selectedChildId}`, JSON.stringify(updatedPrizes));
    setPrizes(updatedPrizes);
    setClaimMessage("Prize marked as redeemed.");
  };

  const claimPrize = (prizeId: string) => {
    if (!user) return;

    const selectedPrize = prizes.find((prize) => prize.id === prizeId);
    if (!selectedPrize || selectedPrize.claimed) return;

    let updatedUser: Profile | null = null;
    try {
      updatedUser = redeemPrize({
        prizeId: selectedPrize.id,
        prizeName: selectedPrize.name,
        pointsSpent: selectedPrize.pointsRequired,
      });
    } catch (err) {
      setClaimMessage(err instanceof Error ? err.message : "Unable to claim that prize.");
      return;
    }

    if (!updatedUser) return;

    const updatedPrizes = prizes.map((prize) =>
      prize.id === prizeId
        ? {
            ...prize,
            claimed: true,
            claimCount: (prize.claimCount ?? 0) + 1,
            requestedAt: new Date().toISOString(),
            lastClaimedAt: new Date().toISOString(),
          }
        : prize,
    );

    setUser(updatedUser);
    setPrizes(updatedPrizes);
    setClaimMessage(`${selectedPrize.pointsRequired} points spent on ${selectedPrize.name}. Your parent can mark it redeemed when you receive it.`);
    localStorage.setItem(`readingQuestPrizes_${updatedUser.id}`, JSON.stringify(updatedPrizes));
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

  const spendablePoints = getSpendablePoints(user);
  const lifetimePoints = getLifetimePoints(user);
  const spentPoints = getSpentPoints(user);
  const homeHref = user.isParent ? "/parent" : "/home";
  const progressMax = Math.max(spendablePoints, ...prizes.map((prize) => prize.pointsRequired), 1);
  const fillPercent = Math.min(100, (spendablePoints / progressMax) * 100);

  if (user.isParent) {
    return (
      <main className="app-screen">
        <div className="hero-panel app-hero">
          <div>
            <div className="kicker">Reward Shelf</div>
            <h1>Prizes</h1>
            <p>Manage reward goals and requests for verified children.</p>
          </div>
          <button type="button" className="secondary" onClick={() => router.push(homeHref)}>
            Home
          </button>
        </div>

        <section className="home-section" aria-labelledby="child-prizes-heading">
          <h2 id="child-prizes-heading">Child Prizes</h2>
          {children.length > 0 ? (
            <>
              <div className="field">
                <label htmlFor="selectedChild">Selected child</label>
                <select id="selectedChild" value={selectedChildId} onChange={(event) => loadChildPrizes(event.target.value)}>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>{child.name}</option>
                  ))}
                </select>
              </div>
              <div className="nested-section prize-suggestions" aria-labelledby="prize-suggestions-heading">
                <div className="section-header-row">
                  <div>
                    <h3 id="prize-suggestions-heading">Prize Suggestions</h3>
                    <p>Balanced reward ideas: one low-cost, one modest tangible reward, and one larger goal.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSuggestionSetIndex((current) => (current + 1) % prizeSuggestionSets.length)}
                  >
                    New suggestions
                  </button>
                </div>
                <div className="prize-suggestion-grid">
                  {prizeSuggestionSets[suggestionSetIndex].map((suggestion) => (
                    <div key={`${suggestion.tier}-${suggestion.name}`} className="prize-suggestion-card">
                      <span className="badge-pill">{suggestion.tier}</span>
                      <strong>{suggestion.name}</strong>
                      <p>{suggestion.description}</p>
                      <div className="prize-points">{suggestion.pointsRequired} points</div>
                      <button type="button" className="secondary" onClick={() => addSuggestedPrize(suggestion)}>
                        Add to prizes
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {prizes.map((prize, index) => (
                <div key={prize.id} className="nested-section">
                  {prize.claimed ? (
                    <div className="warning-box">
                      <strong>Prize requested:</strong> {prize.name}
                      <div className="button-row">
                        <button type="button" onClick={() => markPrizeRedeemed(prize.id)}>Mark Redeemed</button>
                      </div>
                    </div>
                  ) : null}
                  <div className="field">
                    <label htmlFor={`prizeName-${index}`}>Prize name</label>
                    <input id={`prizeName-${index}`} value={prize.name} onChange={(event) => updateParentPrize(index, "name", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`prizePoints-${index}`}>Points needed</label>
                    <input id={`prizePoints-${index}`} type="number" min={1} value={prize.pointsRequired} onChange={(event) => updateParentPrize(index, "pointsRequired", event.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`prizeDescription-${index}`}>Description</label>
                    <input id={`prizeDescription-${index}`} value={prize.description} onChange={(event) => updateParentPrize(index, "description", event.target.value)} />
                  </div>
                  <p className="setting-description">Claimed {prize.claimCount ?? 0} {prize.claimCount === 1 ? "time" : "times"}</p>
                </div>
              ))}
              <div className="button-row">
                <button type="button" onClick={addParentPrize}>Add Prize</button>
                <button type="button" onClick={saveParentPrizes}>Save Prizes</button>
              </div>
            </>
          ) : (
            <p>Verify a child from Profile before setting prize goals.</p>
          )}
          {claimMessage ? <div className={claimMessage.includes("saved") || claimMessage.includes("redeemed") ? "success-box" : "error-box"}>{claimMessage}</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Reward Shelf</div>
          <h1>My Prizes</h1>
          <p>You have {spendablePoints} points to spend.</p>
          <p className="setting-description">
            Lifetime earned: {lifetimePoints} points. Spent on prizes: {spentPoints} points.
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => router.push(homeHref)}>
          Home
        </button>
      </div>

      {!hasParentSetup && (
        <div className="warning-box">
          <strong>Note:</strong> These are default prizes. Ask a parent to set up custom prizes for you.
        </div>
      )}

      {claimMessage ? <div className={claimMessage.includes("Unable") || claimMessage.includes("Not enough") ? "error-box" : "success-box"}>{claimMessage}</div> : null}

      <div className="points-panel">
        <div className="points-panel-header">
          <div>
            <h2>Prize Journey</h2>
            <p>{spendablePoints} points available for prizes.</p>
          </div>
        </div>
        <div className="progress-track compact-progress">
          <div className="progress-fill" style={{ width: `${fillPercent}%` }} />
        </div>
        <div className="prize-milestone-list">
          {prizes.map((prize) => (
            <span key={prize.id}>{prize.name}: {prize.pointsRequired}</span>
          ))}
        </div>
      </div>

      <div className="prizes-grid">
        {prizes.map((prize) => {
          const isClaimed = Boolean(prize.claimed);
          const isEligible = spendablePoints >= prize.pointsRequired;
          const canClaim = isEligible && !isClaimed;

          return (
            <div
              key={prize.id}
              className={`prize-card ${isClaimed ? "claimed" : ""} ${isEligible ? "eligible" : ""}`}
            >
              <div className="prize-icon">{prize.icon || "Prize"}</div>
              <h3>{prize.name}</h3>
              <p className="prize-description">{prize.description}</p>
              <div className="prize-points">{prize.pointsRequired} points required</div>
              <div className="setting-description">
                Claimed {prize.claimCount ?? 0} {prize.claimCount === 1 ? "time" : "times"}
              </div>

              {isClaimed ? (
                <div className="claimed-badge">Requested</div>
              ) : canClaim ? (
                <button type="button" className="claim-button" onClick={() => claimPrize(prize.id)}>
                  Request Prize
                </button>
              ) : (
                <div className="points-needed">
                  Need {prize.pointsRequired - spendablePoints} more points
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasParentSetup && (
        <div className="output">
          <p>
            <strong>Parent Setup:</strong> These prizes were customized by a parent.
            Contact them if you would like to change the available prizes.
          </p>
        </div>
      )}
    </main>
  );
}
