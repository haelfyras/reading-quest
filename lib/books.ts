export type BookMatch = {
  id: string;
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  isbn?: string;
  source?: string;
  confidence?: number;
  difficultyIndex?: number;
  bookLevel?: string;
};

export type BookLookupResult = {
  status: "exact" | "options" | "not_found";
  books: BookMatch[];
};
