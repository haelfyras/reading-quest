"use client";

import { useEffect, useState } from "react";
import {
  AvatarArchetypeId,
  avatarArchetypes,
  defaultAvatarId,
  getAvatarArchetypeForAvatar,
  getAvatarOptionsForArchetype,
} from "../../lib/avatarOptions";

export default function AvatarPicker({
  selectedAvatar,
  onSelect,
}: {
  selectedAvatar: string;
  onSelect: (avatarId: string) => void;
}) {
  const [selectedArchetype, setSelectedArchetype] = useState<AvatarArchetypeId>(() =>
    getAvatarArchetypeForAvatar(selectedAvatar || defaultAvatarId),
  );
  const visibleAvatars = getAvatarOptionsForArchetype(selectedArchetype);

  useEffect(() => {
    setSelectedArchetype(getAvatarArchetypeForAvatar(selectedAvatar || defaultAvatarId));
  }, [selectedAvatar]);

  const chooseArchetype = (archetypeId: AvatarArchetypeId) => {
    setSelectedArchetype(archetypeId);
    const firstAvatar = getAvatarOptionsForArchetype(archetypeId)[0];
    if (firstAvatar) {
      onSelect(firstAvatar.id);
    }
  };

  return (
    <div className="avatar-picker">
      <div className="avatar-archetype-grid" aria-label="Avatar type">
        {avatarArchetypes.map((archetype) => (
          <button
            key={archetype.id}
            type="button"
            className={`avatar-archetype-button ${selectedArchetype === archetype.id ? "selected" : ""}`}
            onClick={() => chooseArchetype(archetype.id)}
            aria-pressed={selectedArchetype === archetype.id}
          >
            <img src={archetype.src} alt="" loading="lazy" aria-hidden="true" />
            <strong>{archetype.name}</strong>
            <span>{archetype.description}</span>
          </button>
        ))}
      </div>

      <section className="avatar-group" aria-labelledby={`avatar-group-${selectedArchetype}`}>
        <h3 id={`avatar-group-${selectedArchetype}`}>
          {selectedArchetype === "tassel" ? "Choose Tassel" : `Choose your ${selectedArchetype} avatar`}
        </h3>
        <div className={selectedArchetype === "tassel" ? "avatar-grid avatar-grid-single" : "avatar-grid"}>
          {visibleAvatars.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              className={`avatar-choice ${selectedAvatar === avatar.id ? "selected" : ""}`}
              onClick={() => onSelect(avatar.id)}
              aria-pressed={selectedAvatar === avatar.id}
            >
              <img src={avatar.src} alt={avatar.name} loading="lazy" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
