import type { BookMatch } from "./books";
import type { Profile } from "./types";

export const BOOK_METADATA_KEY = "__bookMeta";

export type StoredBookMeta = {
  title: string;
  author?: string;
  coverUrl?: string;
  isbn?: string;
  source?: string;
  completedAt?: string;
  updatedAt?: string;
};

export type BookMetadataMap = Record<string, StoredBookMeta>;

export function normalizeBookKey(title: string) {
  return title.trim().toLowerCase();
}

export function buildBookMeta(book: BookMatch): StoredBookMeta {
  return {
    title: book.title,
    author: book.author === "Unknown author" ? "" : book.author,
    coverUrl: book.coverUrl,
    isbn: book.isbn,
    source: book.source,
    updatedAt: new Date().toISOString(),
  };
}

export function getProfileBookMetadata(profile: Pick<Profile, "bookAccess"> | null | undefined): BookMetadataMap {
  const metadata = profile?.bookAccess?.[BOOK_METADATA_KEY];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as BookMetadataMap;
}

export function withBookMetadata(
  bookAccess: Profile["bookAccess"] | undefined,
  metadata: BookMetadataMap,
): Profile["bookAccess"] {
  return {
    ...(bookAccess ?? {}),
    [BOOK_METADATA_KEY]: metadata,
  };
}
