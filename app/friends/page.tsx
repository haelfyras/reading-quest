"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import HeroProfileActions from "../components/HeroProfileActions";
import { getBookRecommendations } from "../../lib/recommendations";
import {
  addFriendByProfileCode,
  ensureProfileCode,
  getBookCompetitionRows,
  getCurrentProfile,
  getFriendProfiles,
  getProfiles,
  getReadingChallenges,
  Profile,
  ReadingChallenge,
  regenerateProfileCode,
  updateProfile,
} from "../../lib/user";
import { betaConfig } from "../../lib/beta";

type FriendBookSuggestion = {
  id: string;
  fromProfileId: string;
  fromName: string;
  toProfileId: string;
  bookTitle: string;
  note: string;
  date: string;
};

const FRIEND_BOOK_SUGGESTIONS_KEY = "readingQuestFriendBookSuggestions";

function recentQuizBook(profile: Profile) {
  return profile.quizzes
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

function getRecentBooks(profile: Profile) {
  const entries = [
    ...(profile.readingLogs ?? []).map((log) => ({
      title: log.bookTitle,
      date: log.date,
      source: "reading log",
    })),
    ...profile.quizzes.map((quiz) => ({
      title: quiz.bookTitle,
      date: quiz.date,
      source: "quiz",
    })),
    ...(profile.readingNow ?? []).map((title, index) => ({
      title,
      date: new Date(Date.now() - index).toISOString(),
      source: "reading now",
    })),
  ];

  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.title.trim())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((entry) => {
      const key = entry.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function readFriendSuggestions() {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(FRIEND_BOOK_SUGGESTIONS_KEY);
    return stored ? JSON.parse(stored) as FriendBookSuggestion[] : [];
  } catch {
    return [];
  }
}

function saveFriendSuggestions(suggestions: FriendBookSuggestion[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FRIEND_BOOK_SUGGESTIONS_KEY, JSON.stringify(suggestions));
}

export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [linkedChildren, setLinkedChildren] = useState<Profile[]>([]);
  const [friendCode, setFriendCode] = useState("");
  const [message, setMessage] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [suggestedBookTitle, setSuggestedBookTitle] = useState("");
  const [suggestionNote, setSuggestionNote] = useState("");
  const [friendSuggestions, setFriendSuggestions] = useState<FriendBookSuggestion[]>([]);
  const [readingChallenges, setReadingChallenges] = useState<ReadingChallenge[]>([]);

  const refresh = () => {
    const profile = getCurrentProfile();
    if (!profile) return;
    const profileWithCode = ensureProfileCode(profile);
    setUser(profileWithCode);
    const nextFriends = getFriendProfiles(profileWithCode);
    setFriends(nextFriends);
    setSelectedFriendId((current) => current || nextFriends[0]?.id || "");
    setLinkedChildren(getProfiles().filter((child) => profileWithCode.linkedChildren?.includes(child.id)));
    setFriendSuggestions(readFriendSuggestions());
    setReadingChallenges(getReadingChallenges());
  };

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile) {
      router.push("/");
      return;
    }
    const profileWithCode = ensureProfileCode(profile);
    const nextFriends = getFriendProfiles(profileWithCode);
    setUser(profileWithCode);
    setFriends(nextFriends);
    setSelectedFriendId(nextFriends[0]?.id || "");
    setLinkedChildren(getProfiles().filter((child) => profileWithCode.linkedChildren?.includes(child.id)));
    setFriendSuggestions(readFriendSuggestions());
    setReadingChallenges(getReadingChallenges());
  }, [router]);

  const bookSuggestions = useMemo(() => {
    return friends.flatMap((friend) => {
      const recentQuiz = recentQuizBook(friend);
      const recommendation = getBookRecommendations({ profile: friend, limit: 1 }).suggestions[0];
      const titles = [
        ...(friend.readingNow ?? []),
        ...(friend.favoriteBooks ?? []),
        recentQuiz?.bookTitle,
        recommendation,
      ].filter(Boolean) as string[];

      return Array.from(new Set(titles)).slice(0, 2).map((title) => ({
        friend,
        title,
        reason: `${friend.name} has shown interest in this book or similar books.`,
      }));
    });
  }, [friends]);

  const competitionRows = useMemo(() => user ? getBookCompetitionRows(user) : [], [user, friends]);
  const incomingSuggestions = useMemo(
    () => user ? friendSuggestions.filter((suggestion) => suggestion.toProfileId === user.id) : [],
    [friendSuggestions, user],
  );
  const outgoingSuggestions = useMemo(
    () => user ? friendSuggestions.filter((suggestion) => suggestion.fromProfileId === user.id) : [],
    [friendSuggestions, user],
  );
  const incomingChallenges = useMemo(
    () => user ? readingChallenges.filter((challenge) => challenge.toProfileId === user.id) : [],
    [readingChallenges, user],
  );
  const outgoingChallenges = useMemo(
    () => user ? readingChallenges.filter((challenge) => challenge.fromProfileId === user.id) : [],
    [readingChallenges, user],
  );
  const homeHref = user?.isParent ? "/parent" : "/home";
  const canUseCodes = betaConfig.friendCodeSharingEnabled && Boolean(user?.isParent || user?.canAddFriends);

  const addFriend = () => {
    if (!user) return;
    if (!betaConfig.friendCodeSharingEnabled) {
      setMessage("Book suggestions to friends are visible but paused during private beta.");
      return;
    }
    try {
      const updated = addFriendByProfileCode(user, friendCode);
      setUser(updated);
      const nextFriends = getFriendProfiles(updated);
      setFriends(nextFriends);
      setSelectedFriendId(nextFriends[0]?.id || "");
      setFriendCode("");
      setMessage("Friend added. You can now share book ideas and compare matching quizzes.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to add friend.");
    }
  };

  const rotateCode = () => {
    if (!user) return;
    const updated = regenerateProfileCode(user);
    setUser(updated);
    setMessage("Profile code refreshed.");
  };

  const copyCode = async () => {
    if (!user?.profileCode) return;
    try {
      await navigator.clipboard.writeText(user.profileCode);
      setMessage("Profile code copied.");
    } catch {
      setMessage(`Your profile code is ${user.profileCode}.`);
    }
  };

  const toggleChildFriends = (child: Profile) => {
    if (!betaConfig.friendCodeSharingEnabled) {
      setMessage("Friend code sharing is visible but paused during private beta.");
      return;
    }
    const updated = updateProfile({ ...child, canAddFriends: !child.canAddFriends });
    setLinkedChildren((current) => current.map((item) => item.id === updated.id ? updated : item));
    setMessage(`${child.name} friend sharing is now ${updated.canAddFriends ? "on" : "off"}.`);
  };

  const sendBookSuggestion = () => {
    if (!user) return;
    const friend = friends.find((item) => item.id === selectedFriendId);
    if (!friend) {
      setMessage("Choose a friend first.");
      return;
    }
    if (!suggestedBookTitle.trim()) {
      setMessage("Enter a book title to suggest.");
      return;
    }

    const nextSuggestion: FriendBookSuggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromProfileId: user.id,
      fromName: user.realName || user.name,
      toProfileId: friend.id,
      bookTitle: suggestedBookTitle.trim(),
      note: suggestionNote.trim(),
      date: new Date().toISOString(),
    };
    const nextSuggestions = [nextSuggestion, ...friendSuggestions];
    saveFriendSuggestions(nextSuggestions);
    setFriendSuggestions(nextSuggestions);
    setSuggestedBookTitle("");
    setSuggestionNote("");
    setMessage(`Suggested ${nextSuggestion.bookTitle} to ${friend.name}.`);
  };

  if (!user) {
    return <main><p>Loading...</p></main>;
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Reading Circle</div>
          <h1>Friends</h1>
          <p>Add readers by profile code, share book ideas, and compete on the same book tests.</p>
        </div>
        <HeroProfileActions profile={user} homeHref={homeHref} />
      </div>

      <section className="home-section" aria-labelledby="code-sharing-heading">
        <div className="section-header-row">
          <div>
            <h2 id="code-sharing-heading">Profile Code</h2>
            <p>{betaConfig.friendCodeSharingEnabled ? (canUseCodes ? "Share this code with readers you know." : "Ask your parent to turn on code sharing first.") : "Friend code sharing is visible but paused during private beta."}</p>
          </div>
          <span className={canUseCodes ? "badge-pill" : "badge-pill muted-pill"}>{betaConfig.friendCodeSharingEnabled ? (canUseCodes ? "Sharing on" : "Sharing off") : "Paused for beta"}</span>
        </div>
        {canUseCodes ? (
          <>
            <div className="profile-code-box">{user.profileCode}</div>
            <div className="button-row">
              <button type="button" className="secondary" onClick={copyCode}>Copy code</button>
              <button type="button" className="secondary" onClick={rotateCode}>Refresh code</button>
            </div>
          </>
        ) : (
          <div className="warning-box">
            {betaConfig.friendCodeSharingEnabled
              ? "A verified parent can turn this on from the Friends page or Profile page. Your code stays hidden until then."
              : "Friend codes, book sharing, and head-to-head challenges are visible but paused during private beta."}
          </div>
        )}
      </section>

      <section className="home-section" aria-labelledby="add-friend-heading">
        <h2 id="add-friend-heading">Add a Friend</h2>
        {canUseCodes ? (
          <>
            <div className="field">
              <label htmlFor="friendCode">Friend profile code</label>
              <input
                id="friendCode"
                value={friendCode}
                onChange={(event) => setFriendCode(event.target.value)}
                placeholder="RQ-READ-1234"
                autoCapitalize="characters"
              />
            </div>
            <button type="button" onClick={addFriend} disabled={!friendCode.trim()}>Add friend</button>
          </>
        ) : (
          <p>{betaConfig.friendCodeSharingEnabled ? "Friend adding is locked for this child profile until a verified parent allows it." : "Friend adding is paused during private beta."}</p>
        )}
        {message ? <div className={message.includes("Unable") || message.includes("Ask") || message.includes("No reader") ? "error-box" : "success-box"}>{message}</div> : null}
      </section>

      {user.isParent && linkedChildren.length > 0 ? (
        <section className="home-section" aria-labelledby="child-friend-controls-heading">
          <h2 id="child-friend-controls-heading">Child Friend Controls</h2>
          <div className="compact-list">
            {linkedChildren.map((child) => (
              <div key={child.id} className="friend-card">
                <div>
                  <strong>{child.name}</strong>
                  <p>Code sharing is {child.canAddFriends ? "on" : "off"}.</p>
                </div>
                <button type="button" className="secondary" disabled={!betaConfig.friendCodeSharingEnabled} onClick={() => toggleChildFriends(child)}>
                  {betaConfig.friendCodeSharingEnabled ? (child.canAddFriends ? "Turn off" : "Turn on") : "Paused"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="home-section" aria-labelledby="friends-list-heading">
        <h2 id="friends-list-heading">My Friends</h2>
        {!betaConfig.friendCodeSharingEnabled ? (
          <div className="warning-box">Friend profiles, suggestions, and challenges are paused for private beta. Existing data remains visible.</div>
        ) : null}
        {friends.length > 0 ? (
          <div className="friend-grid">
            {friends.map((friend) => (
              <div key={friend.id} className="friend-card">
                <div>
                  <strong>{friend.realName || friend.name}</strong>
                  <p>{friend.isParent ? "Grown-up reader" : "Child reader"} - {friend.quizzes.length} quizzes</p>
                  <div className="mini-book-list">
                    <span>Recent books</span>
                    {getRecentBooks(friend).length > 0 ? (
                      <ul>
                        {getRecentBooks(friend).map((book) => (
                          <li key={`${friend.id}-${book.title}`}>{book.title} <small>({book.source})</small></li>
                        ))}
                      </ul>
                    ) : (
                      <p>No recent books yet.</p>
                    )}
                  </div>
                </div>
                <div className="friend-actions">
                  <span className="badge-pill">{friend.profileCode}</span>
                  {getRecentBooks(friend)[0] && betaConfig.friendCodeSharingEnabled ? (
                    <Link href={`/quiz?bookTitle=${encodeURIComponent(getRecentBooks(friend)[0].title)}&challenge=true&friendId=${encodeURIComponent(friend.id)}&friendName=${encodeURIComponent(friend.name)}`}>
                      <button type="button" className="action-button small secondary">Challenge</button>
                    </Link>
                  ) : getRecentBooks(friend)[0] ? (
                    <button type="button" className="action-button small secondary" disabled>Challenge paused</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No friends yet. Add someone with their profile code.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="suggest-friend-book-heading">
        <h2 id="suggest-friend-book-heading">Suggest a Book</h2>
        {friends.length > 0 ? (
          <>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="selectedFriend">Friend</label>
                <select id="selectedFriend" value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)}>
                  {friends.map((friend) => (
                    <option key={friend.id} value={friend.id}>{friend.realName || friend.name}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="suggestedBookTitle">Book title</label>
                <input id="suggestedBookTitle" value={suggestedBookTitle} onChange={(event) => setSuggestedBookTitle(event.target.value)} placeholder="Book to recommend" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="suggestionNote">Note</label>
              <input id="suggestionNote" value={suggestionNote} onChange={(event) => setSuggestionNote(event.target.value)} placeholder="Why they might like it" />
            </div>
            <button type="button" onClick={sendBookSuggestion} disabled={!betaConfig.friendCodeSharingEnabled}>Send suggestion</button>
          </>
        ) : (
          <p>Add a friend with a profile code before sending book suggestions.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="friend-suggestions-heading">
        <h2 id="friend-suggestions-heading">Friend Suggestions</h2>
        {incomingSuggestions.length > 0 ? (
          <div className="compact-list">
            {incomingSuggestions.slice(0, 5).map((suggestion) => (
              <div key={suggestion.id} className="friend-card">
                <div>
                  <strong>{suggestion.bookTitle}</strong>
                  <p>{suggestion.fromName} suggested this book{suggestion.note ? `: ${suggestion.note}` : "."}</p>
                </div>
                <div className="friend-actions">
                  <Link href={`/quiz?bookTitle=${encodeURIComponent(suggestion.bookTitle)}`}>
                    <button type="button" className="action-button small secondary">Try quiz</button>
                  </Link>
                  {betaConfig.friendCodeSharingEnabled ? (
                    <Link href={`/quiz?bookTitle=${encodeURIComponent(suggestion.bookTitle)}&challenge=true&friendId=${encodeURIComponent(suggestion.fromProfileId)}&friendName=${encodeURIComponent(suggestion.fromName)}`}>
                      <button type="button" className="action-button small secondary">Challenge</button>
                    </Link>
                  ) : (
                    <button type="button" className="action-button small secondary" disabled>Challenge paused</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No book suggestions from friends yet.</p>
        )}
        {outgoingSuggestions.length > 0 ? (
          <p className="setting-description">You have sent {outgoingSuggestions.length} book {outgoingSuggestions.length === 1 ? "suggestion" : "suggestions"}.</p>
        ) : null}
      </section>

      <section className="home-section" aria-labelledby="head-to-head-heading">
        <h2 id="head-to-head-heading">Head-to-Head Challenges</h2>
        {incomingChallenges.length > 0 ? (
          <div className="compact-list">
            {incomingChallenges.slice(0, 8).map((challenge) => (
              <div key={challenge.id} className="friend-card">
                <div>
                  <strong>{challenge.bookTitle}</strong>
                  <p>
                    {challenge.fromName} scored {challenge.initiatorScore} / {challenge.initiatorMaxScore}.
                    {challenge.status === "completed" && typeof challenge.responderScore === "number"
                      ? ` You scored ${challenge.responderScore} / ${challenge.responderMaxScore}.`
                      : " Accept when you are ready to take the same quiz."}
                  </p>
                </div>
                <div className="friend-actions">
                  <span className="badge-pill">{challenge.status === "completed" ? "Complete" : "Pending"}</span>
                  {challenge.status === "pending" && betaConfig.friendCodeSharingEnabled ? (
                    <Link href={`/quiz?challenge=true&challengeId=${encodeURIComponent(challenge.id)}&friendName=${encodeURIComponent(challenge.fromName)}`}>
                      <button type="button" className="action-button small secondary">Accept</button>
                    </Link>
                  ) : challenge.status === "pending" ? (
                    <button type="button" className="action-button small secondary" disabled>Accept paused</button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No incoming challenges yet.</p>
        )}

        {outgoingChallenges.length > 0 ? (
          <div className="nested-section">
            <h3>Challenges You Sent</h3>
            <div className="compact-list">
              {outgoingChallenges.slice(0, 5).map((challenge) => (
                <div key={challenge.id} className="friend-card">
                  <div>
                    <strong>{challenge.bookTitle}</strong>
                    <p>
                      Sent to {challenge.toName}. You scored {challenge.initiatorScore} / {challenge.initiatorMaxScore}.
                      {challenge.status === "completed" && typeof challenge.responderScore === "number"
                        ? ` They scored ${challenge.responderScore} / ${challenge.responderMaxScore}.`
                        : " Waiting for them to accept."}
                    </p>
                  </div>
                  <span className="badge-pill">{challenge.status === "completed" ? "Complete" : "Pending"}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="home-section" aria-labelledby="shared-books-heading">
        <h2 id="shared-books-heading">Book Ideas From Friends</h2>
        {bookSuggestions.length > 0 ? (
          <div className="compact-list">
            {bookSuggestions.slice(0, 8).map((suggestion) => (
              <div key={`${suggestion.friend.id}-${suggestion.title}`} className="friend-card">
                <div>
                  <strong>{suggestion.title}</strong>
                  <p>{suggestion.reason}</p>
                </div>
                <Link href={`/quiz?bookTitle=${encodeURIComponent(suggestion.title)}`}>
                  <button type="button" className="secondary">Try quiz</button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p>Friend book ideas will appear when friends save favorites, reading-now books, or quiz history.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="same-book-heading">
        <h2 id="same-book-heading">Same Book Challenges</h2>
        {competitionRows.length > 0 ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Friend</th>
                  <th>Your score</th>
                  <th>Friend score</th>
                  <th>Challenge</th>
                </tr>
              </thead>
              <tbody>
                {competitionRows.slice(0, 10).map((row) => (
                  <tr key={`${row.friend.id}-${row.bookTitle}-${row.difficulty}`}>
                    <td>{row.bookTitle}</td>
                    <td>{row.friend.name}</td>
                    <td>{row.yourScore} / {row.yourMaxScore}</td>
                    <td>{row.friendScore} / {row.friendMaxScore}</td>
                    <td>
                      {betaConfig.friendCodeSharingEnabled ? (
                        <Link href={`/quiz?bookTitle=${encodeURIComponent(row.bookTitle)}&difficulty=${encodeURIComponent(row.difficulty)}&challenge=true&friendId=${encodeURIComponent(row.friend.id)}&friendName=${encodeURIComponent(row.friend.name)}`}>
                          <button type="button" className="action-button small secondary">Challenge</button>
                        </Link>
                      ) : (
                        <button type="button" className="action-button small secondary" disabled>Challenge paused</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>When you and a friend test on the same book, the match-up will show here.</p>
        )}
      </section>
    </main>
  );
}
