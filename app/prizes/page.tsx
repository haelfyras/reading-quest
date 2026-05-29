"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeroProfileActions from "../components/HeroProfileActions";
import {
  getCurrentProfile,
  getLifetimePoints,
  getProfiles,
  getSpendablePoints,
  getSpentPoints,
  canRequestPrizeIdeasForTier,
  getEffectiveSubscriptionTier,
  getPrizeSlotLimit,
  parentLibraryMessage,
  Profile,
  redeemPrize,
  subscriptionPlans,
} from "../../lib/user";
import {
  defaultPrizes,
  hasSavedPrizes,
  prizeSuggestionSets,
  readPrizeAddRequests,
  readPrizes,
  savePrizeAddRequests,
  savePrizes,
  type Prize,
  type PrizeAddRequest,
  type PrizeSuggestion,
} from "../../lib/prizeData";
import { refreshSharedProfileData } from "../../lib/supabase/profileData";
import { isUuid } from "../../lib/ids";
import { getChestImageSrc, getStoredThemeStyle, type ThemeStyle } from "../../lib/themeAssets";

export default function PrizesPage() {
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
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>("library");

  useEffect(() => {
    const loadInitialData = async () => {
      const currentUser = getCurrentProfile();
      setUser(currentUser);
      setThemeStyle(getStoredThemeStyle());

      if (!currentUser) {
        return;
      }
      setPrizeAddRequests(readPrizeAddRequests());

      if (currentUser.isParent) {
        try {
          const sharedData = await refreshSharedProfileData(currentUser.id);
          setUser(sharedData.profile);
          setChildren(sharedData.linkedChildren);
          if (sharedData.linkedChildren[0]) {
            await loadChildPrizes(sharedData.linkedChildren[0].id);
          }
          return;
        } catch {
          const linkedChildren = getProfiles().filter((profile) => currentUser.linkedChildren?.includes(profile.id));
          setChildren(linkedChildren);
          if (linkedChildren[0]) {
            await loadChildPrizes(linkedChildren[0].id);
          }
          return;
        }
      }

      await loadChildPrizes(currentUser.id);
    };

    void loadInitialData();
    const refreshTheme = () => setThemeStyle(getStoredThemeStyle());
    window.addEventListener("storage", refreshTheme);
    window.addEventListener("readingQuestProfileUpdated", refreshTheme);
    return () => {
      window.removeEventListener("storage", refreshTheme);
      window.removeEventListener("readingQuestProfileUpdated", refreshTheme);
    };
  }, []);

  const loadChildPrizes = async (childId: string) => {
    setSelectedChildId(childId);
    setClaimMessage("");

    try {
      if (!isUuid(childId)) {
        throw new Error("Local beta profile.");
      }
      const response = await fetch(`/api/prizes?childId=${encodeURIComponent(childId)}`);
      if (!response.ok) {
        throw new Error("Unable to load shared prizes.");
      }

      const data = await response.json() as {
        prizes?: Prize[];
        hasSavedPrizes?: boolean;
        prizeAddRequests?: PrizeAddRequest[];
      };
      setPrizes(data.prizes?.length ? data.prizes : defaultPrizes);
      setHasParentSetup(Boolean(data.hasSavedPrizes));
      setPrizeAddRequests(data.prizeAddRequests ?? readPrizeAddRequests());
    } catch {
      setPrizes(readPrizes(childId));
      setHasParentSetup(hasSavedPrizes(childId));
      setPrizeAddRequests(readPrizeAddRequests());
    }
  };

  const updateParentPrize = (index: number, field: keyof Prize, value: string) => {
    setPrizes((current) => current.map((prize, idx) => idx === index ? {
      ...prize,
      [field]: field === "pointsRequired" ? Number(value) : value,
    } : prize));
    setClaimMessage("");
  };

  const getCurrentPrizeLimit = () => {
    if (!user) return 4;
    return getPrizeSlotLimit(getEffectiveSubscriptionTier(user));
  };

  const canAddMorePrizes = () => prizes.length < getCurrentPrizeLimit();

  const addParentPrize = () => {
    if (!user || !canAddMorePrizes()) {
      const tier = user ? getEffectiveSubscriptionTier(user) : "free";
      setClaimMessage(`${subscriptionPlans[tier].name} supports up to ${getCurrentPrizeLimit()} prizes.`);
      return;
    }
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

  const addSuggestedPrize = (suggestion: PrizeSuggestion) => {
    if (!user || !canAddMorePrizes()) {
      const tier = user ? getEffectiveSubscriptionTier(user) : "free";
      setClaimMessage(`${subscriptionPlans[tier].name} supports up to ${getCurrentPrizeLimit()} prizes.`);
      return;
    }
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

  const removeParentPrize = (prizeId: string) => {
    setPrizes((current) => current.filter((prize) => prize.id !== prizeId));
    setClaimMessage("Prize removed. Save prizes when you are ready.");
  };

  const requestPrizeIdea = async () => {
    if (!user || user.isParent) return;
    const tier = getEffectiveSubscriptionTier(user);
    if (!canRequestPrizeIdeasForTier(tier)) {
      setClaimMessage("Ask your parent to update your prize list. They can change prizes or add more prize request options.");
      return;
    }

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
    let savedRequest = nextRequest;
    try {
      if (!isUuid(user.id)) {
        throw new Error("Local beta profile.");
      }
      const response = await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_prize_idea",
          childId: user.id,
          childName: user.name,
          name,
          description: nextRequest.description,
          pointsRequired,
        }),
      });
      if (response.ok) {
        const data = await response.json() as { request?: PrizeAddRequest };
        savedRequest = data.request ?? nextRequest;
      }
    } catch {
      // Local fallback keeps the child request visible in this browser.
    }

    const nextRequests = [savedRequest, ...prizeAddRequests];
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setRequestedPrizeName("");
    setRequestedPrizeDescription("");
    setRequestedPrizePoints(100);
    setClaimMessage(`${name} was sent to your parent to review.`);
  };

  const addRequestedPrizeToMenu = async (request: PrizeAddRequest) => {
    if (!user || !canAddMorePrizes()) {
      const tier = user ? getEffectiveSubscriptionTier(user) : "free";
      setClaimMessage(`${subscriptionPlans[tier].name} supports up to ${getCurrentPrizeLimit()} prizes.`);
      return;
    }
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
    try {
      if (!isUuid(request.id)) {
        throw new Error("Local beta request.");
      }
      await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_prize_request", requestId: request.id, status: "added" }),
      });
    } catch {
      // Local fallback keeps beta prize review moving.
    }
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setClaimMessage(`${request.name} added to the prize menu. Save prizes when you are ready.`);
  };

  const dismissRequestedPrize = async (requestId: string) => {
    const nextRequests = prizeAddRequests.map((item) =>
      item.id === requestId ? { ...item, status: "dismissed" as const } : item,
    );
    try {
      if (!isUuid(requestId)) {
        throw new Error("Local beta request.");
      }
      await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_prize_request", requestId, status: "dismissed" }),
      });
    } catch {
      // Local fallback keeps beta prize review moving.
    }
    savePrizeAddRequests(nextRequests);
    setPrizeAddRequests(nextRequests);
    setClaimMessage("Prize request dismissed.");
  };

  const saveParentPrizes = async () => {
    if (!selectedChildId) {
      setClaimMessage("Select a child before saving prizes.");
      return;
    }

    const validPrizes = prizes.filter((prize) => prize.name.trim() && prize.pointsRequired > 0);
    if (!validPrizes.length) {
      setClaimMessage("Add at least one prize with a name and point value.");
      return;
    }
    if (validPrizes.length > getCurrentPrizeLimit()) {
      const tier = user ? getEffectiveSubscriptionTier(user) : "free";
      setClaimMessage(`${subscriptionPlans[tier].name} supports up to ${getCurrentPrizeLimit()} prizes. Remove a prize or change plans before saving.`);
      return;
    }

    savePrizes(selectedChildId, validPrizes);
    setPrizes(validPrizes);
    try {
      if (!isUuid(selectedChildId)) {
        throw new Error("This child profile has not been synced to Supabase yet.");
      }
      const response = await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_prizes",
          parentId: user?.id,
          childId: selectedChildId,
          prizes: validPrizes,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "" }));
        throw new Error(data.error || "Unable to save prizes to Supabase.");
      }
      setClaimMessage("Prizes saved.");
    } catch (err) {
      setClaimMessage(err instanceof Error ? `Saved in this browser, but Supabase sync needs attention: ${err.message}` : "Saved in this browser, but Supabase sync needs attention.");
    }
  };

  const markPrizeRedeemed = async (prizeId: string) => {
    if (!selectedChildId) return;
    const selectedPrize = prizes.find((prize) => prize.id === prizeId);

    if (selectedPrize?.redemptionId && isUuid(selectedPrize.redemptionId)) {
      try {
        await fetch("/api/prizes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete_redemption", redemptionId: selectedPrize.redemptionId }),
        });
      } catch {
        // Local fallback still clears the parent-facing button.
      }
    }

    const updatedPrizes = prizes.map((prize) => prize.id === prizeId ? {
      ...prize,
      claimed: false,
      requestedAt: undefined,
      redemptionId: undefined,
    } : prize);
    savePrizes(selectedChildId, updatedPrizes);
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
    savePrizes(updatedUser.id, updatedPrizes);
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
  const sortedPrizes = [...prizes].sort((first, second) => first.pointsRequired - second.pointsRequired);
  const nextPrize = sortedPrizes.find((prize) => prize.pointsRequired > spendablePoints);
  const requestedPrizes = prizes.filter((prize) => prize.claimed);
  const requestedPrizeIdeas = prizeAddRequests.filter(
    (request) => request.childId === selectedChildId && request.status === "pending",
  );
  const childPendingPrizeIdeas = user.isParent ? [] : prizeAddRequests.filter(
    (request) => request.childId === user.id && request.status === "pending",
  );
  const effectiveTier = getEffectiveSubscriptionTier(user);
  const prizeLimit = getPrizeSlotLimit(effectiveTier);
  const canRequestPrizeIdeas = canRequestPrizeIdeasForTier(effectiveTier);

  if (user.isParent) {
    return (
      <main className="app-screen">
        <div className="hero-panel app-hero">
          <div>
            <div className="kicker">Reward Shelf</div>
            <h1>Prizes</h1>
            <p>Manage reward goals and requests for verified children.</p>
          </div>
          <HeroProfileActions profile={user} homeHref={homeHref} />
        </div>

        <section className="home-section" aria-labelledby="child-prizes-heading">
          <h2 id="child-prizes-heading">Child Prizes</h2>
          <div className="notice">
            <strong>Library access matters.</strong> {parentLibraryMessage}
          </div>
          {children.length > 0 ? (
            <>
              <div className="field">
                <label htmlFor="selectedChild">Selected child</label>
                <select id="selectedChild" value={selectedChildId} onChange={(event) => void loadChildPrizes(event.target.value)}>
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
                        <button type="button" onClick={() => void markPrizeRedeemed(prize.id)}>Mark Redeemed</button>
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
                          <button type="button" onClick={() => void addRequestedPrizeToMenu(request)}>Add to Menu</button>
                          <button type="button" className="secondary" onClick={() => void dismissRequestedPrize(request.id)}>Dismiss</button>
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
                <div className="section-header-row">
                  <div>
                    <h3 id="prize-menu-heading">Prize Menu</h3>
                    <p>{subscriptionPlans[effectiveTier].name} supports up to {prizeLimit} prizes. You can edit or remove existing prizes anytime.</p>
                  </div>
                  <span className="badge-pill">{prizes.length} / {prizeLimit}</span>
                </div>
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
                      <button type="button" className="secondary danger-button" onClick={() => removeParentPrize(prize.id)}>
                        Remove prize
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="button-row">
                <button type="button" onClick={addParentPrize} disabled={!canAddMorePrizes()}>Add Prize</button>
                <button type="button" onClick={() => void saveParentPrizes()}>Save Prizes</button>
              </div>
              {!canAddMorePrizes() ? (
                <p className="setting-description">Change plans in Settings to unlock more prize slots.</p>
              ) : null}
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
        <HeroProfileActions profile={user} homeHref={homeHref} />
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
            <h2>Treasure Path</h2>
            <p>
              {spendablePoints} points available for prizes.
              {nextPrize ? ` ${nextPrize.pointsRequired - spendablePoints} points to ${nextPrize.name}.` : " Every treasure is unlocked."}
            </p>
          </div>
        </div>
        <div className="progress-track compact-progress treasure-track">
          <div className="progress-fill" style={{ width: `${fillPercent}%` }} />
        </div>
        <div className="prize-milestone-list treasure-milestones">
          {sortedPrizes.map((prize) => (
            <span
              key={prize.id}
              className={`${spendablePoints >= prize.pointsRequired ? "milestone-reached" : ""} ${nextPrize?.id === prize.id ? "next-milestone" : ""}`}
            >
              <img
                className="treasure-chest-image small"
                src={getChestImageSrc(themeStyle, spendablePoints >= prize.pointsRequired)}
                alt=""
              />
              {prize.name}: {prize.pointsRequired}
            </span>
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
              <div className="prize-icon">
                <img
                  src={getChestImageSrc(themeStyle, isEligible)}
                  alt={isEligible ? `${prize.name} unlocked` : `${prize.name} locked`}
                />
              </div>
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
        {canRequestPrizeIdeas ? (
          <>
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
            <button type="button" onClick={() => void requestPrizeIdea()}>Send to Parent</button>
            {childPendingPrizeIdeas.length > 0 ? (
              <p className="setting-description">
                {childPendingPrizeIdeas.length} prize {childPendingPrizeIdeas.length === 1 ? "idea is" : "ideas are"} waiting for parent review.
              </p>
            ) : null}
          </>
        ) : (
          <div className="notice">
            Want different prizes? Ask your parent nicely. They can change your prize list and decide which rewards fit your reading goals.
          </div>
        )}
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
