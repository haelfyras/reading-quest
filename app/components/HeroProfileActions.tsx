"use client";

import Link from "next/link";
import { getAvatarOption } from "../../lib/avatarOptions";
import type { Profile } from "../../lib/user";

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
  const avatar = getAvatarOption(profile?.avatarStyle);

  return (
    <div className="hero-actions">
      {homeHref ? (
        <Link href={homeHref}>
          <button type="button" className="secondary">{homeLabel}</button>
        </Link>
      ) : null}
      {children}
      {profile ? (
        <Link href="/profile" className="hero-profile-chip" aria-label="Open profile">
          <img src={avatar.src} alt="" aria-hidden="true" />
          <span>{profile.name}</span>
        </Link>
      ) : null}
    </div>
  );
}
