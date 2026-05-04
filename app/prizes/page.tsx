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

type PrizeAddRequest = {
  id: string;
  childId: string;
  childName: string;
  name: string;
  description: string;
  pointsRequired: number;
  status: "pending" | "added" | "dismissed";
  requestedAt: string;
};

const PRIZE_ADD_REQUESTS_KEY = "readingQuestPrizeAddRequests";

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

function readPrizeAddRequests() {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PRIZE_ADD_REQUESTS_KEY);
    return stored ? JSON.parse(stored) as PrizeAddRequest[] : [];
  } catch {
    return [];
  }
}

function savePrizeAddRequests(requests: PrizeAddRequest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRIZE_ADD_REQUESTS_KEY, JSON.stringify(requests));
}

export default function PrizesPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [children, setChildren] = useState<Profile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [hasParentSetup, setHasParentSetup] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [suggestionSetIndex, setSuggestionSetIndex] = useState(0);
  const [prizeAddRequests, setPrizeAddRequests] = useState<PrizeAddRequest[]>([]);
  const [requestedPrizeName, setRequestedPrizeName] = useState("");
  const [requestedPrizeDescription, setRequestedPrizeDescription] = useState("");
  const [requestedPrizePoints, setRequestedPrizePoints] = useState(100);

  useEffect(() => {
    const currentUser = getCurrentProfile();
    setUser(currentUser);

    if (!currentUser) {
      return;
    }
    setPrizeAddRequests(readPrizeAddRequests());

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

  const requestPrizeIdea = () => {
    if (!user || user.isParent) return;

    const name = requestedPrizeName.trim();
    if (!name) {
      setClaimMessage("Enter the prize you want to request.");
      return;
    }

    const pointsRequired = Math.max(10, Math.round(Number(requestedPrizePoints) || 10));
    const nextRequest: PrizeAddRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      childId: user.id,
      childName: user.name,
      name,
      description: requestedPrizeDescription.trim() || "Requested by child",
      pointsRequired,
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    const nextRequests = [nextRequest, ...prizeAddRequests];
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setRequestedPrizeName("");
    setRequestedPrizeDescription("");
    setRequestedPrizePoints(100);
    setClaimMessage(`${name} was sent to your parent to review.`);
  };

  const addRequestedPrizeToMenu = (request: PrizeAddRequest) => {
    setPrizes((current) => [
      ...current,
      {
        id: `child-request-${request.id}`,
        name: request.name,
        description: request.description,
        pointsRequired: request.pointsRequired,
        icon: "Idea",
        claimed: false,
        claimCount: 0,
      },
    ]);

    const nextRequests = prizeAddRequests.map((item) =>
      item.id === request.id ? { ...item, status: "added" as const } : item,
    );
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setClaimMessage(`${request.name} added to the prize menu. Save prizes when you are ready.`);
  };

  const dismissRequestedPrize = (requestId: string) => {
    const nextRequests = prizeAddRequests.map((item) =>
      item.id === requestId ? { ...item, status: "dismissed" as const } : item,
    );
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setClaimMessage("Prize request dismissed.");
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
  const requestedPrizes = prizes.filter((prize) => prize.claimed);
  const requestedPrizeIdeas = prizeAddRequests.filter(
    (request) => request.childId === selectedChildId && request.status === "pending",
  );
  const childPendingPrizeIdeas = user.isParent ? [] : prizeAddRequests.filter(
    (request) => request.childId === user.id && request.status === "pending",
  );

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
              <div className="nested-section" aria-labelledby="requested-prizes-heading">
                <div className="section-header-row">
                  <div>
                    <h3 id="requested-prizes-heading">Requested Prizes</h3>
                    <p>Prizes waiting for parent confirmation.</p>
                  </div>
                  <span className="badge-pill">{requestedPrizes.length} active</span>
                </div>
                {requestedPrizes.length > 0 ? (
                  <div className="compact-list">
                    {requestedPrizes.map((prize) => (
                      <div key={prize.id} className="review-queue-item">
                        <div>
                          <strong>{prize.name}</strong>
                          <p>{prize.pointsRequired} points spent.</p>
                          <small>Claimed {prize.claimCount ?? 0} {prize.claimCount === 1 ? "time" : "times"}</small>
                        </div>
                        <button type="button" onClick={() => markPrizeRedeemed(prize.id)}>Mark Redeemed</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No prize requests right now.</p>
                )}
              </div>
              <div className="nested-section" aria-labelledby="prize-ideas-heading">
                <div className="section-header-row">
                  <div>
                    <h3 id="prize-ideas-heading">Prize Ideas From Child</h3>
                    <p>Prize ideas your child asked you to add.</p>
                  </div>
                  <span className="badge-pill">{requestedPrizeIdeas.length} pending</span>
                </div>
                {requestedPrizeIdeas.length > 0 ? (
                  <div className="compact-list">
                    {requestedPrizeIdeas.map((request) => (
                      <div key={request.id} className="review-queue-item">
                        <div>
                          <strong>{request.name}</strong>
                          <p>{request.description}</p>
                          <small>{request.childName} suggested {request.pointsRequired} points.</small>
                        </div>
                        <div className="button-row">
                          <button type="button" onClick={() => addRequestedPrizeToMenu(request)}>Add to Menu</button>
                          <button type="button" className="secondary" onClick={() => dismissRequestedPrize(request.id)}>Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No prize ideas from this child right now.</p>
                )}
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
              <div className="nested-section" aria-labelledby="prize-menu-heading">
                <h3 id="prize-menu-heading">Prize Menu</h3>
                <div className="prize-editor-grid">
                  {prizes.map((prize, index) => (
                    <div key={prize.id} className="prize-editor-card">
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
                </div>
              </div>
              <div className="button-row">
                <button type="button" onClick={addParentPrize}>Add Prize</button>
                <button type="button" onClick={saveParentPrizes}>Save Prizes</button>
              </div>
            </>
          ) : (
            <p>Verify a child from Profile before setting prize goals.</p>
          )}
          {claimMessage ? (
            <div className={claimMessage.includes("Select") || claimMessage.includes("Add at least") ? "error-box" : "success-box"}>
              {claimMessage}
            </div>
          ) : null}
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

      {claimMessage ? (
        <div className={claimMessage.includes("Unable") || claimMessage.includes("Not enough") || claimMessage.includes("Enter") ? "error-box" : "success-box"}>
          {claimMessage}
        </div>
      ) : null}

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

      <section className="home-section" aria-labelledby="request-prize-heading">
        <h2 id="request-prize-heading">Request a Prize</h2>
        <p>Ask your parent to add a prize idea to your list.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="requestedPrizeName">Prize idea</label>
            <input
              id="requestedPrizeName"
              value={requestedPrizeName}
              onChange={(event) => setRequestedPrizeName(event.target.value)}
              placeholder="New soccer ball"
            />
          </div>
          <div className="field">
            <label htmlFor="requestedPrizePoints">Suggested points</label>
            <input
              id="requestedPrizePoints"
              type="number"
              min={10}
              value={requestedPrizePoints}
              onChange={(event) => setRequestedPrizePoints(Number(event.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="requestedPrizeDescription">Why this prize?</label>
          <input
            id="requestedPrizeDescription"
            value={requestedPrizeDescription}
            onChange={(event) => setRequestedPrizeDescription(event.target.value)}
            placeholder="I would like to earn this after finishing a chapter book."
          />
        </div>
        <button type="button" onClick={requestPrizeIdea}>Send to Parent</button>
        {childPendingPrizeIdeas.length > 0 ? (
          <p className="setting-description">
            {childPendingPrizeIdeas.length} prize {childPendingPrizeIdeas.length === 1 ? "idea is" : "ideas are"} waiting for parent review.
          </p>
        ) : null}
      </section>

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
