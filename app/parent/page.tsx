"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentProfile,
  getProfiles,
  Profile,
  setCurrentUserId,
  updateProfile,
} from "../../lib/user";

type Prize = {
  id: string;
  name: string;
  description: string;
  pointsRequired: number;
};

const MAX_PRIZES = 10;

function defaultPrizeList(): Prize[] {
  return [
    {
      id: "1",
      name: "Buy a new book",
      description: "Reward your child with a new book of their choice.",
      pointsRequired: 100,
    },
    {
      id: "2",
      name: "TV/Movie Time",
      description: "Extra family movie or screen time.",
      pointsRequired: 250,
    },
    {
      id: "3",
      name: "Buy a new toy",
      description: "A small new toy for reaching the goal.",
      pointsRequired: 500,
    },
  ];
}

export default function ParentPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [children, setChildren] = useState<Profile[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("");
  const [childName, setChildName] = useState("");
  const [linkError, setLinkError] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [childPrizes, setChildPrizes] = useState<Prize[]>(defaultPrizeList());
  const [prizeSaveMessage, setPrizeSaveMessage] = useState("");

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile || !profile.isParent) {
      router.push("/");
      return;
    }

    setCurrentUser(profile);
    const allProfiles = getProfiles();
    const linkedChildren = allProfiles.filter((p) => profile.linkedChildren?.includes(p.id));
    setChildren(linkedChildren);
    if (linkedChildren.length > 0 && !selectedChild) {
      setSelectedChild(linkedChildren[0].id);
    }
  }, [router]);

  const selectedChildProfile = useMemo(
    () => children.find((child) => child.id === selectedChild) ?? null,
    [children, selectedChild],
  );

  useEffect(() => {
    if (!selectedChildProfile) {
      setChildPrizes(defaultPrizeList());
      return;
    }

    const savedPrizes = localStorage.getItem(`readingQuestPrizes_${selectedChildProfile.id}`);
    if (savedPrizes) {
      try {
        setChildPrizes(JSON.parse(savedPrizes));
      } catch {
        setChildPrizes(defaultPrizeList());
      }
    } else {
      setChildPrizes(defaultPrizeList());
    }
  }, [selectedChildProfile]);

  const handleLinkChild = () => {
    const trimmedName = childName.trim();
    if (!trimmedName) {
      setLinkError("Enter child's screen name.");
      return;
    }

    const allProfiles = getProfiles();
    const child = allProfiles.find((p) => p.name === trimmedName && !p.isParent);
    if (!child) {
      setLinkError("Child not found. Please enter their screen name exactly.");
      return;
    }

    if (currentUser?.linkedChildren?.includes(child.id)) {
      setLinkError("Child already linked.");
      return;
    }

    const updatedParent = {
      ...currentUser!,
      linkedChildren: [...(currentUser!.linkedChildren || []), child.id],
    };
    updateProfile(updatedParent);
    setCurrentUser(updatedParent);
    setChildren([...children, child]);
    setSelectedChild(child.id);
    setChildName("");
    setLinkError("");
    setShowLinkInput(false);
  };

  const handleRemoveChild = () => {
    if (!currentUser || !selectedChild) return;
    const updatedParent = {
      ...currentUser,
      linkedChildren: currentUser.linkedChildren?.filter((id) => id !== selectedChild) ?? [],
    };

    updateProfile(updatedParent);
    setCurrentUser(updatedParent);
    setChildren(children.filter((child) => child.id !== selectedChild));
    setSelectedChild((prev) => {
      const remaining = children.filter((child) => child.id !== prev);
      return remaining.length ? remaining[0].id : "";
    });
  };

  const handlePrizeChange = (index: number, field: keyof Prize, value: string) => {
    setChildPrizes((current) =>
      current.map((prize, idx) =>
        idx === index
          ? {
              ...prize,
              [field]: field === "pointsRequired" ? Number(value) : value,
            }
          : prize,
      ),
    );
    setPrizeSaveMessage("");
  };

  const handleAddPrize = () => {
    if (childPrizes.length >= MAX_PRIZES) {
      return;
    }
    setChildPrizes((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        name: "",
        description: "",
        pointsRequired: 100,
      },
    ]);
    setPrizeSaveMessage("");
  };

  const handleRemovePrize = (index: number) => {
    setChildPrizes((current) => current.filter((_, idx) => idx !== index));
    setPrizeSaveMessage("");
  };

  const handleSavePrizes = () => {
    if (!selectedChildProfile) {
      setPrizeSaveMessage("Select a child before saving prize goals.");
      return;
    }

    const validPrizes = childPrizes
      .filter((prize) => prize.name.trim() && prize.pointsRequired > 0)
      .map((prize, index) => ({ ...prize, id: prize.id || `prize-${index}` }));

    if (validPrizes.length === 0) {
      setPrizeSaveMessage("Please add at least one prize with a name and points threshold.");
      return;
    }

    localStorage.setItem(`readingQuestPrizes_${selectedChildProfile.id}`, JSON.stringify(validPrizes));
    setChildPrizes(validPrizes);
    setPrizeSaveMessage("Prize goals saved for your child.");
  };

  const getChildRank = (child: Profile) => {
    const profiles = getProfiles().slice().sort((a, b) => b.points - a.points);
    return profiles.findIndex((item) => item.id === child.id) + 1;
  };

  const childSuggestions = useMemo(() => {
    if (!selectedChildProfile) {
      return [];
    }

    const interests = selectedChildProfile.favoriteBooks?.join(" ") ?? "";
    const quizTitles = selectedChildProfile.quizzes.map((quiz) => quiz.bookTitle).join(" ");
    const combinedText = `${interests} ${quizTitles}`.toLowerCase();
    const suggestions: string[] = [];

    if (/fantasy|dragon|wizard|magic|castle/.test(combinedText)) {
      suggestions.push("The Neverending Story", "Ella Enchanted", "The Lion, the Witch and the Wardrobe");
    }
    if (/mystery|detective|clue|spy/.test(combinedText)) {
      suggestions.push("Encyclopedia Brown", "The Westing Game", "Nancy Drew and the Clue Crew");
    }
    if (/science fiction|space|robot|alien/.test(combinedText)) {
      suggestions.push("The Wild Robot", "A Wrinkle in Time", "The City of Ember");
    }
    if (suggestions.length === 0) {
      suggestions.push("Matilda", "Charlotte's Web", "The Magic Tree House");
    }

    return Array.from(new Set(suggestions)).slice(0, 3);
  }, [selectedChildProfile]);

  const handleSignOut = () => {
    setCurrentUserId(null);
    router.push("/");
  };

  if (!currentUser) {
    return <div>Loading...</div>;
  }

  return (
    <main>
      <div className="topbar parent-topbar">
        <div>
          <h1>Parent Dashboard</h1>
          <p>Welcome, {currentUser.name}!</p>
        </div>
        <div className="topbar-actions">
          <Link href="/settings">
            <button type="button">Settings</button>
          </Link>
          <button type="button" className="secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="parent-top-row">
        <div className="child-select-group">
          <label htmlFor="selectedChild">Selected child</label>
          <select
            id="selectedChild"
            value={selectedChild}
            onChange={(e) => setSelectedChild(e.target.value)}
          >
            <option value="">Select a child</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name} ({child.points} points)
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setShowLinkInput((prev) => !prev)}>
            {showLinkInput ? "Cancel" : "Add child"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!selectedChildProfile}
            onClick={handleRemoveChild}
          >
            Remove child
          </button>
        </div>
      </div>

      {showLinkInput && (
        <div className="parent-section add-child-section">
          <h2>Add a child</h2>
          <p>Enter the exact screen name of the child account to link it.</p>
          <div className="field">
            <label htmlFor="childName">Child's screen name</label>
            <input
              id="childName"
              type="text"
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
              placeholder="Enter child's name exactly"
            />
          </div>
          <button type="button" onClick={handleLinkChild}>
            Link Child
          </button>
          {linkError ? (
            <div className="output" style={{ background: "#fee2e2", color: "#991b1b" }}>
              {linkError}
            </div>
          ) : null}
        </div>
      )}

      <div className="parent-main-grid">
        <div className="parent-section prizes-section">
          <h2>Prize Setup</h2>
          <p>Set rewards and point goals for {selectedChildProfile?.name || "your child"}.</p>
          {selectedChildProfile ? (
            <>
              {childPrizes.map((prize, index) => (
                <div key={prize.id} className="nested-section">
                  <div className="field">
                    <label htmlFor={`prize-name-${index}`}>Prize name</label>
                    <input
                      id={`prize-name-${index}`}
                      type="text"
                      value={prize.name}
                      onChange={(event) => handlePrizeChange(index, "name", event.target.value)}
                      placeholder="e.g. Buy a new book"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`prize-points-${index}`}>Points needed</label>
                    <input
                      id={`prize-points-${index}`}
                      type="number"
                      min={1}
                      value={prize.pointsRequired}
                      onChange={(event) => handlePrizeChange(index, "pointsRequired", event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`prize-description-${index}`}>Description</label>
                    <input
                      id={`prize-description-${index}`}
                      type="text"
                      value={prize.description}
                      onChange={(event) => handlePrizeChange(index, "description", event.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                  {childPrizes.length > 1 ? (
                    <button type="button" className="secondary" onClick={() => handleRemovePrize(index)}>
                      Remove prize
                    </button>
                  ) : null}
                </div>
              ))}

              <div className="button-row">
                {childPrizes.length < MAX_PRIZES ? (
                  <button type="button" onClick={handleAddPrize}>
                    Add Prize
                  </button>
                ) : null}
                <button type="button" onClick={handleSavePrizes}>
                  Save Prizes
                </button>
              </div>
              {prizeSaveMessage ? (
                <div className="output" style={{ background: "#d1fae5", color: "#065f46" }}>
                  {prizeSaveMessage}
                </div>
              ) : null}
            </>
          ) : (
            <p>Select a linked child to edit reward goals.</p>
          )}
        </div>

        <div className="parent-section suggestions-section">
          <h2>Book Suggestions</h2>
          <p>See recommended reads based on your linked child's interests.</p>
          {selectedChildProfile ? (
            <ul className="small-list">
              {childSuggestions.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          ) : (
            <p>Select a linked child to load suggestions.</p>
          )}
        </div>

        <div className="parent-section leaderboard-section">
          <h2>Child Leaderboard</h2>
          <p>See how your linked children rank among all readers.</p>
          {children.length === 0 ? (
            <p>No linked children yet.</p>
          ) : (
            <ul className="small-list">
              {children.map((child) => (
                <li key={child.id}>
                  {child.name}: {child.points} points • Rank #{getChildRank(child)}
                </li>
              ))}
            </ul>
          )}
          <Link href="/leaderboards">
            <button>Full Leaderboard</button>
          </Link>
        </div>
      </div>

      <div className="parent-section sample-quiz-section">
        <h2>Sample Quiz</h2>
        <p>Review an AI-generated quiz and approve it for your child.</p>
        <Link href="/dashboard">
          <button>Review Sample Quiz</button>
        </Link>
      </div>
    </main>
  );
}
