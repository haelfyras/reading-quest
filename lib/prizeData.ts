import { readStorage, writeStorage } from "./localStorage";

export type Prize = {
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

export type PrizeAddRequest = {
  id: string;
  childId: string;
  childName: string;
  name: string;
  description: string;
  pointsRequired: number;
  status: "pending" | "added" | "dismissed";
  requestedAt: string;
};

export type PrizeSuggestion = {
  name: string;
  description: string;
  pointsRequired: number;
  icon: string;
  tier: string;
};

const PRIZE_ADD_REQUESTS_KEY = "readingQuestPrizeAddRequests";

export const defaultPrizes: Prize[] = [
  {
    id: "1",
    name: "Buy a New Book",
    description: "Choose a new or used book",
    pointsRequired: 50,
    icon: "Book",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "2",
    name: "Extra Screen Time",
    description: "Extra 30 minutes of screen time",
    pointsRequired: 200,
    icon: "Time",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "3",
    name: "New Toy",
    description: "Pick a new toy within the family budget",
    pointsRequired: 500,
    icon: "Toy",
    claimed: false,
    claimCount: 0,
  },
  {
    id: "4",
    name: "New Game",
    description: "Choose a board game, card game, or used video game",
    pointsRequired: 1000,
    icon: "Game",
    claimed: false,
    claimCount: 0,
  },
];

export const prizeSuggestionSets: PrizeSuggestion[][] = [
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

export function getPrizeStorageKey(profileId: string) {
  return `readingQuestPrizes_${profileId}`;
}

export function readPrizes(profileId: string) {
  return readStorage<Prize[]>(getPrizeStorageKey(profileId)) ?? defaultPrizes;
}

export function hasSavedPrizes(profileId: string) {
  return Boolean(readStorage<Prize[]>(getPrizeStorageKey(profileId)));
}

export function savePrizes(profileId: string, prizes: Prize[]) {
  writeStorage(getPrizeStorageKey(profileId), prizes);
}

export function readPrizeAddRequests() {
  return readStorage<PrizeAddRequest[]>(PRIZE_ADD_REQUESTS_KEY) ?? [];
}

export function savePrizeAddRequests(requests: PrizeAddRequest[]) {
  writeStorage(PRIZE_ADD_REQUESTS_KEY, requests);
}
