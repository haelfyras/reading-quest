"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAvatarOption } from "../../lib/avatarOptions";
import { getCurrentProfile, type Profile } from "../../lib/user";

export default function HeroProfileActions({
  profile,
  homeHref,
  homeLabel = "Home",
  children,
}: {
  profile: Profile | null | undefined;
  homeHref?: string;
  homeLabel?: string;
  children?: React.ReactNode;
}) {
  const [liveProfile, setLiveProfile] = useState(profile ?? null);
  const displayProfile = liveProfile?.id === profile?.id ? liveProfile : profile;
  const avatar = getAvatarOption(displayProfile?.avatarStyle);

  useEffect(() => {
    setLiveProfile(profile ?? null);
  }, [profile]);

  useEffect(() => {
    const refreshProfile = () => {
      const updated = getCurrentProfile();
      if (updated?.id === profile?.id) {
        setLiveProfile(updated);
      }
    };

    window.addEventListener("readingQuestProfileUpdated", refreshProfile);
    return () => window.removeEventListener("readingQuestProfileUpdated", refreshProfile);
  }, [profile?.id]);

  return (
    <div className="hero-actions">
      {homeHref ? (
        <Link href={homeHref}>
          <button type="button" className="secondary">{homeLabel}</button>
        </Link>
      ) : null}
      {children}
      {displayProfile ? (
        <Link href="/profile" className="hero-profile-chip" aria-label="Open profile">
          <img src={avatar.src} alt="" aria-hidden="true" />
          <span>{displayProfile.name}</span>
        </Link>
      ) : null}
    </div>
  );
}
