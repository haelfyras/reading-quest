"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addFriendContact,
  childConfirmParentRequest,
  createParentVerificationRequest,
  enterParentVerificationCode,
  getCurrentProfile,
  getParentVerificationRequests,
  getProfiles,
  ParentVerificationRequest,
  Profile,
  rejectParentVerificationRequest,
  retryParentVerificationRequest,
  updateProfile,
} from "../../lib/user";
import { betaConfig } from "../../lib/beta";
import { refreshSharedProfileData } from "../../lib/supabase/profileData";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [friendName, setFriendName] = useState("");
  const [friendEmail, setFriendEmail] = useState("");
  const [friendPhone, setFriendPhone] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [childName, setChildName] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [requests, setRequests] = useState<ParentVerificationRequest[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [confirmingRequestId, setConfirmingRequestId] = useState("");
  const [linkedChildren, setLinkedChildren] = useState<Profile[]>([]);

  const loadDatabaseRequests = async (profile: Profile) => {
    const response = await fetch(`/api/family-verification?profileId=${encodeURIComponent(profile.id)}`);
    if (!response.ok) {
      throw new Error("Unable to load database verification requests.");
    }
    const data = await response.json() as { requests?: ParentVerificationRequest[] };
    return data.requests ?? [];
  };

  const refresh = async () => {
    let profile = getCurrentProfile();
    if (!profile) return;
    let sharedChildren: Profile[] | null = null;
    try {
      const sharedData = await refreshSharedProfileData(profile.id);
      profile = sharedData.profile;
      sharedChildren = sharedData.linkedChildren;
    } catch {
      // Local beta data remains available if Supabase hydration fails.
    }
    setUser(profile);
    setRealName(profile.realName || "");
    setPhone(profile.phone || "");
    try {
      const databaseRequests = await loadDatabaseRequests(profile);
      setRequests(databaseRequests);
    } catch {
      setRequests(getParentVerificationRequests().filter((request) => (
        profile.isParent ? request.parentId === profile.id : request.childId === profile.id
      )));
    }
    setLinkedChildren(sharedChildren ?? getProfiles().filter((child) => profile.linkedChildren?.includes(child.id)));
  };

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile) {
      router.push("/");
      return;
    }
    void refresh();
  }, [router]);

  const saveProfile = () => {
    if (!user) return;
    const updated = updateProfile({
      ...user,
      realName: user.isParent ? realName.trim() : user.realName,
      phone: betaConfig.phoneCollectionEnabled ? phone.trim() : user.phone,
    });
    setUser(updated);
    setProfileMessage("Profile saved.");
  };

  const addFriend = () => {
    if (!user) return;
    if (!betaConfig.friendCodeSharingEnabled) {
      setFriendMessage("Friend adding is visible but paused during private beta.");
      return;
    }
    try {
      const updated = addFriendContact(user, { name: friendName, email: friendEmail, phone: friendPhone });
      setUser(updated);
      setFriendName("");
      setFriendEmail("");
      setFriendPhone("");
      setFriendMessage("Friend added.");
    } catch (err) {
      setFriendMessage(err instanceof Error ? err.message : "Unable to add friend.");
    }
  };

  const updateLocalParentLink = (childId: string) => {
    if (!user?.isParent || !childId) return;
    const updated = updateProfile({
      ...user,
      linkedChildren: Array.from(new Set([...(user.linkedChildren ?? []), childId])),
    });
    setUser(updated);
  };

  const requestChildVerification = async () => {
    if (!user) return;
    try {
      const response = await fetch("/api/family-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          parentId: user.id,
          childScreenName: childName,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "" }));
        throw new Error(data.error || "Unable to send request.");
      }
      setChildName("");
      setRequestMessage("Verification request sent to your child. It expires in 10 minutes.");
      await refresh();
    } catch (err) {
      try {
        createParentVerificationRequest(user, { childScreenName: childName });
        setChildName("");
        setRequestMessage("Verification request sent to your child. It expires in 10 minutes.");
        await refresh();
      } catch (fallbackErr) {
        setRequestMessage(fallbackErr instanceof Error ? fallbackErr.message : err instanceof Error ? err.message : "Unable to send request.");
      }
    }
  };

  const submitCode = async (requestId: string) => {
    if (!user) return;
    try {
      const response = await fetch("/api/family-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enter_code",
          requestId,
          actor: user.isParent ? "parent" : "child",
          code: codes[requestId] || "",
        }),
      });
      const data = await response.json().catch(() => ({})) as { request?: ParentVerificationRequest; linkedChildId?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Unable to verify code.");
      }
      if (data.linkedChildId) {
        updateLocalParentLink(data.linkedChildId);
      }
      setCodes((current) => ({ ...current, [requestId]: "" }));
      setRequestMessage(data.request?.status === "verified" ? "Family link verified." : "Code accepted. The other account still needs to enter the code.");
      await refresh();
    } catch (err) {
      try {
        const updatedRequest = enterParentVerificationCode(requestId, user.isParent ? "parent" : "child", codes[requestId] || "");
        if (updatedRequest.status === "verified") {
          updateLocalParentLink(updatedRequest.childId);
        }
        setCodes((current) => ({ ...current, [requestId]: "" }));
        setRequestMessage(updatedRequest.status === "verified" ? "Family link verified." : "Code accepted. The other account still needs to enter the code.");
        await refresh();
      } catch (fallbackErr) {
        setRequestMessage(fallbackErr instanceof Error ? fallbackErr.message : err instanceof Error ? err.message : "Unable to verify code.");
      }
    }
  };

  const confirmParent = async (request: ParentVerificationRequest) => {
    try {
      const response = await fetch("/api/family-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "child_confirm", requestId: request.id }),
      });
      const data = await response.json().catch(() => ({ error: "" }));
      if (!response.ok) {
        throw new Error(data.error || "Unable to confirm request.");
      }
      setConfirmingRequestId("");
      setRequestMessage("Parent confirmed. Enter the code within 10 minutes.");
      await refresh();
    } catch (err) {
      try {
        childConfirmParentRequest(request.id);
        setConfirmingRequestId("");
        setRequestMessage("Parent confirmed. Enter the code within 10 minutes.");
        await refresh();
      } catch (fallbackErr) {
        setRequestMessage(fallbackErr instanceof Error ? fallbackErr.message : err instanceof Error ? err.message : "Unable to confirm request.");
      }
    }
  };

  const rejectParent = async (requestId: string) => {
    try {
      const response = await fetch("/api/family-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", requestId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "" }));
        throw new Error(data.error || "Unable to decline request.");
      }
      setRequestMessage("Request declined.");
      await refresh();
    } catch {
      rejectParentVerificationRequest(requestId);
      setRequestMessage("Request declined.");
      await refresh();
    }
  };

  const retryVerification = async (requestId: string) => {
    try {
      const response = await fetch("/api/family-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", requestId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "" }));
        throw new Error(data.error || "Unable to restart verification.");
      }
      setCodes((current) => ({ ...current, [requestId]: "" }));
      setConfirmingRequestId("");
      setRequestMessage("Verification restarted. You have 10 minutes.");
      await refresh();
    } catch (err) {
      try {
        retryParentVerificationRequest(requestId);
        setCodes((current) => ({ ...current, [requestId]: "" }));
        setConfirmingRequestId("");
        setRequestMessage("Verification restarted. You have 10 minutes.");
        await refresh();
      } catch (fallbackErr) {
        setRequestMessage(fallbackErr instanceof Error ? fallbackErr.message : err instanceof Error ? err.message : "Unable to restart verification.");
      }
    }
  };

  const toggleChildFriends = (child: Profile) => {
    if (!betaConfig.friendCodeSharingEnabled) {
      setRequestMessage("Child friend sharing is visible but paused during private beta.");
      return;
    }
    const updated = updateProfile({ ...child, canAddFriends: !child.canAddFriends });
    setLinkedChildren((current) => current.map((item) => item.id === updated.id ? updated : item));
  };

  if (!user) {
    return <main><p>Loading...</p></main>;
  }

  const homeHref = user.isParent ? "/parent" : "/home";
  const canManageFriends = betaConfig.friendCodeSharingEnabled && (user.isParent || user.canAddFriends);

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Account</div>
          <h1>Profile</h1>
          <p>Manage your account, friends, and family connections.</p>
        </div>
        <Link href={homeHref}>
          <button type="button" className="secondary">Home</button>
        </Link>
      </div>

      <section className="home-section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p><strong>Screen name:</strong> {user.name}</p>
        {user.email ? <p><strong>Email:</strong> {user.email}</p> : null}
        {user.isParent ? (
          <div className="field">
            <label htmlFor="realName">Real name</label>
            <input id="realName" value={realName} onChange={(event) => setRealName(event.target.value)} />
          </div>
        ) : null}
        {user.isParent && betaConfig.phoneCollectionEnabled ? (
          <div className="field">
            <label htmlFor="phone">Phone number</label>
            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
        ) : null}
        <button type="button" onClick={saveProfile}>Save Profile</button>
        {profileMessage ? <div className="success-box">{profileMessage}</div> : null}
      </section>

      <section className="home-section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy</h2>
        <p>
          Reading Quest uses {user.isParent ? "your account details" : "your screen name"} for app progress and safety features.
          {user.isParent ? " Your real name, email, friends, and family links are only for account and safety features." : " Child accounts do not need a real name or email address."}
          {" "}Phone numbers are not being collected during private beta.
        </p>
        <p>Verified parents can see linked child quiz history, reading logs, prize requests, and reported quiz questions. Friend adding for child accounts stays locked until a verified parent allows it.</p>
      </section>

      <section className="home-section" aria-labelledby="friends-heading">
        <h2 id="friends-heading">Friends</h2>
        {!betaConfig.friendCodeSharingEnabled ? (
          <div className="warning-box">Friend adding is visible but paused during private beta.</div>
        ) : canManageFriends ? (
          <>
            <div className="field">
              <label htmlFor="friendName">Friend name</label>
              <input id="friendName" value={friendName} onChange={(event) => setFriendName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="friendEmail">Friend email</label>
              <input id="friendEmail" value={friendEmail} onChange={(event) => setFriendEmail(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="friendPhone">Friend phone</label>
              <input id="friendPhone" value={friendPhone} disabled={!betaConfig.phoneCollectionEnabled} onChange={(event) => setFriendPhone(event.target.value)} />
            </div>
            <button type="button" onClick={addFriend}>Add Friend</button>
          </>
        ) : (
          <p>A verified parent needs to allow friend adding first.</p>
        )}
        {friendMessage ? <div className={friendMessage.includes("Unable") || friendMessage.includes("required") ? "error-box" : "success-box"}>{friendMessage}</div> : null}
        {(user.friends ?? []).length > 0 ? (
          <ul className="small-list">
            {user.friends?.map((friend) => (
              <li key={friend.id}>{friend.name}{friend.email ? ` - ${friend.email}` : ""}{friend.phone ? ` - ${friend.phone}` : ""}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {user.isParent ? (
        <section className="home-section" aria-labelledby="family-heading">
          <h2 id="family-heading">Family Verification</h2>
          <div className="field">
            <label htmlFor="childName">Child screen name</label>
            <input id="childName" value={childName} onChange={(event) => setChildName(event.target.value)} />
          </div>
          <button type="button" onClick={() => void requestChildVerification()}>Request Verification</button>

          {linkedChildren.length > 0 ? (
            <div className="nested-section">
              <h3>Verified Children</h3>
              <ul className="small-list">
                {linkedChildren.map((child) => (
                  <li key={child.id}>
                    {child.name}
                    <div className="button-row">
                      <button type="button" className="secondary" disabled={!betaConfig.friendCodeSharingEnabled} onClick={() => toggleChildFriends(child)}>
                        {betaConfig.friendCodeSharingEnabled ? (child.canAddFriends ? "Disable child friends" : "Allow child friends") : "Friend sharing paused"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="home-section" aria-labelledby="requests-heading">
        <h2 id="requests-heading">Verification Requests</h2>
        {requests.length > 0 ? requests.map((request) => (
          <div key={request.id} className="nested-section">
            <h3>{user.isParent ? request.childScreenName : request.parentName}</h3>
            <p>Status: {request.status}</p>
            {!user.isParent && request.status === "child_pending" ? (
              <>
                <p>{request.parentName} has requested to add you as their parent. Is this your parent?</p>
                {confirmingRequestId === request.id ? (
                  <>
                    <div className="button-row">
                      <button type="button" onClick={() => void confirmParent(request)}>Yes</button>
                      <button type="button" className="secondary" onClick={() => void rejectParent(request.id)}>No</button>
                    </div>
                  </>
                ) : (
                  <div className="button-row">
                    <button type="button" onClick={() => setConfirmingRequestId(request.id)}>Yes</button>
                    <button type="button" className="secondary" onClick={() => void rejectParent(request.id)}>No</button>
                  </div>
                )}
              </>
            ) : null}

            {request.status === "code_pending" ? (
              <>
                {user.isParent ? (
                  <div className="notice">In-app verification code: <strong>{request.code}</strong>. Enter it on both accounts before it expires.</div>
                ) : null}
                <div className="field">
                  <label htmlFor={`code-${request.id}`}>Verification code</label>
                  <input id={`code-${request.id}`} value={codes[request.id] || ""} onChange={(event) => setCodes((current) => ({ ...current, [request.id]: event.target.value }))} />
                </div>
                <button type="button" onClick={() => void submitCode(request.id)}>Submit Code</button>
              </>
            ) : null}

            {request.status !== "verified" ? (
              <div className="button-row">
                <button type="button" className="secondary" onClick={() => void retryVerification(request.id)}>Try Again</button>
              </div>
            ) : null}
          </div>
        )) : <p>No active requests.</p>}
        {requestMessage ? <div className={requestMessage.includes("Unable") || requestMessage.includes("expired") ? "error-box" : "success-box"}>{requestMessage}</div> : null}
      </section>
    </main>
  );
}
