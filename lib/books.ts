export type BookMatch = {
  id: string;
  title: string;
  author: string;
  year?: number;
  coverUrl?: string;
  isbn?: string;
};

export type BookLookupResult = {
  status: "exact" | "options" | "not_found";
  books: BookMatch[];
};
