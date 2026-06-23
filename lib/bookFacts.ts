import { getBookDifficultyKey } from "./bookDifficulty";
import { openai } from "./openai";
import { createServiceSupabaseClient } from "./supabase/server";
import type { Json } from "./supabase/database.types";

export const BOOK_FACT_VERSION = 1;

const factModel = process.env.OPENAI_FACT_MODEL || process.env.OPENAI_QUIZ_MODEL || "gpt-4o-mini";

export type BookFactDetails = {
  title: string;
  author?: string;
  year?: string;
  isbn?: string;
};

export type BookFactSheetFacts = {
  protagonist: string[];
  majorCharacters: string[];
  antagonistsOrConflicts: string[];
  primarySettings: string[];
  importantObjects: string[];
  majorEvents: string[];
  causeEffectMoments: string[];
  themes: string[];
  avoidConfusions: string[];
  summary: string;
};

export type BookFactSheet = {
  canonicalKey: string;
  title: string;
  author: string;
  isbn: string;
  status: "ready" | "low_confidence" | "needs_review";
  sourceConfidence: number;
  facts: BookFactSheetFacts;
  sourceNames: string[];
  sourceUrls: string[];
  sourceNotes: string[];
};

type SourceSnippet = {
  name: string;
  url: string;
  text: string;
};

const emptyFacts: BookFactSheetFacts = {
  protagonist: [],
  majorCharacters: [],
  antagonistsOrConflicts: [],
  primarySettings: [],
  importantObjects: [],
  majorEvents: [],
  causeEffectMoments: [],
  themes: [],
  avoidConfusions: [],
  summary: "",
};

const ignoredCapitalizedTerms = new Set([
  "a",
  "an",
  "and",
  "answer",
  "book",
  "chapter",
  "choice",
  "easy",
  "hard",
  "medium",
  "quest",
  "reading",
  "story",
  "the",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
]);

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeEntity(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\b(sgt|sgt.|sergeant|capt|capt.|captain|dr|dr.|mr|mr.|mrs|mrs.|ms|ms.)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactArray(value: unknown, limit = 12) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return items
    .map(cleanText)
    .filter((item) => {
      const key = normalizeEntity(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function getGroundedFactStrings(facts: BookFactSheetFacts) {
  return [
    ...facts.protagonist,
    ...facts.majorCharacters,
    ...facts.antagonistsOrConflicts,
    ...facts.primarySettings,
    ...facts.importantObjects,
    ...facts.majorEvents,
    ...facts.causeEffectMoments,
    ...facts.themes,
  ];
}

function getSpecificFactCount(facts: BookFactSheetFacts) {
  return getGroundedFactStrings(facts).filter((item) => normalizeEntity(item).length >= 3).length;
}

function parseFactSheetFacts(value: unknown): BookFactSheetFacts {
  const record = typeof value === "object" && value ? value as Record<string, unknown> : {};
  return {
    protagonist: compactArray(record.protagonist, 4),
    majorCharacters: compactArray(record.majorCharacters, 14),
    antagonistsOrConflicts: compactArray(record.antagonistsOrConflicts, 10),
    primarySettings: compactArray(record.primarySettings, 8),
    importantObjects: compactArray(record.importantObjects, 10),
    majorEvents: compactArray(record.majorEvents, 14),
    causeEffectMoments: compactArray(record.causeEffectMoments, 12),
    themes: compactArray(record.themes, 8),
    avoidConfusions: compactArray(record.avoidConfusions, 10),
    summary: cleanText(record.summary).slice(0, 700),
  };
}

function coerceConfidence(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.round(Math.min(1, Math.max(0, numberValue)) * 100) / 100;
}

function getFactStatus(facts: BookFactSheetFacts, confidence: number, snippetCount: number) {
  const specificFacts = getSpecificFactCount(facts);
  const hasCoreStoryFacts =
    facts.protagonist.length > 0 &&
    (facts.primarySettings.length > 0 || facts.majorEvents.length > 0) &&
    (facts.majorCharacters.length + facts.antagonistsOrConflicts.length + facts.majorEvents.length) >= 3;

  if (confidence >= 0.62 && specificFacts >= 7 && hasCoreStoryFacts && snippetCount > 0) {
    return "ready" as const;
  }

  if (confidence >= 0.42 && specificFacts >= 4) {
    return "low_confidence" as const;
  }

  return "needs_review" as const;
}

async function fetchJson(url: string, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "ReadingQuestBeta/1.5 book fact lookup",
      },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function truncateSnippet(text: string, maxLength = 900) {
  const cleaned = cleanText(text);
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

async function getGoogleBookSnippets(book: BookFactDetails): Promise<SourceSnippet[]> {
  const query = [
    book.isbn ? `isbn:${book.isbn}` : "",
    book.title ? `intitle:${book.title}` : "",
    book.author ? `inauthor:${book.author}` : "",
  ].filter(Boolean).join(" ");
  if (!query) return [];

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&printType=books`;
  const data = await fetchJson(url, 2600);
  const items = Array.isArray(data?.items) ? data.items : [];

  return items.flatMap((item: any): SourceSnippet[] => {
    const info = item?.volumeInfo;
    const parts = [
      info?.title ? `Title: ${info.title}${info.subtitle ? `: ${info.subtitle}` : ""}` : "",
      Array.isArray(info?.authors) ? `Authors: ${info.authors.join(", ")}` : "",
      info?.publishedDate ? `Published: ${info.publishedDate}` : "",
      info?.description ? `Description: ${info.description}` : "",
      Array.isArray(info?.categories) ? `Categories: ${info.categories.join(", ")}` : "",
    ].filter(Boolean).join("\n");

    return parts
      ? [{
          name: "Google Books",
          url: info?.infoLink || url,
          text: truncateSnippet(parts),
        }]
      : [];
  }).slice(0, 3);
}

async function getOpenLibrarySnippets(book: BookFactDetails): Promise<SourceSnippet[]> {
  const params = new URLSearchParams({
    limit: "4",
    fields: "key,title,author_name,first_publish_year,first_sentence,subject,place,person",
  });
  if (book.title) params.set("title", book.title);
  if (book.author) params.set("author", book.author);
  const searchUrl = `https://openlibrary.org/search.json?${params.toString()}`;
  const data = await fetchJson(searchUrl, 2600);
  const docs = Array.isArray(data?.docs) ? data.docs : [];

  const snippets: SourceSnippet[] = [];
  for (const doc of docs.slice(0, 3)) {
    const key = typeof doc?.key === "string" ? doc.key : "";
    let description = "";
    if (key.startsWith("/works/")) {
      const workData = await fetchJson(`https://openlibrary.org${key}.json`, 1800);
      const rawDescription = workData?.description;
      description = typeof rawDescription === "string"
        ? rawDescription
        : typeof rawDescription?.value === "string"
          ? rawDescription.value
          : "";
    }

    const parts = [
      doc?.title ? `Title: ${doc.title}` : "",
      Array.isArray(doc?.author_name) ? `Authors: ${doc.author_name.slice(0, 3).join(", ")}` : "",
      doc?.first_publish_year ? `First published: ${doc.first_publish_year}` : "",
      Array.isArray(doc?.first_sentence) ? `First sentence: ${doc.first_sentence[0]}` : "",
      Array.isArray(doc?.person) ? `People: ${doc.person.slice(0, 12).join(", ")}` : "",
      Array.isArray(doc?.place) ? `Places: ${doc.place.slice(0, 12).join(", ")}` : "",
      Array.isArray(doc?.subject) ? `Subjects: ${doc.subject.slice(0, 16).join(", ")}` : "",
      description ? `Description: ${description}` : "",
    ].filter(Boolean).join("\n");

    if (parts) {
      snippets.push({
        name: "Open Library",
        url: key ? `https://openlibrary.org${key}` : searchUrl,
        text: truncateSnippet(parts),
      });
    }
  }

  return snippets;
}

async function getWikipediaSnippets(book: BookFactDetails): Promise<SourceSnippet[]> {
  if (!book.title) return [];
  const search = [book.title, book.author, "book"].filter(Boolean).join(" ");
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(search)}&format=json&origin=*`;
  const data = await fetchJson(searchUrl, 2200);
  const results = Array.isArray(data?.query?.search) ? data.query.search : [];
  const snippets: SourceSnippet[] = [];

  for (const result of results.slice(0, 2)) {
    const title = typeof result?.title === "string" ? result.title : "";
    if (!title) continue;
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const summary = await fetchJson(summaryUrl, 1800);
    const extract = typeof summary?.extract === "string" ? summary.extract : "";
    if (extract) {
      snippets.push({
        name: "Wikipedia",
        url: typeof summary?.content_urls?.desktop?.page === "string" ? summary.content_urls.desktop.page : summaryUrl,
        text: truncateSnippet(`Title: ${title}\nSummary: ${extract}`),
      });
    }
  }

  return snippets;
}

async function collectSourceSnippets(book: BookFactDetails) {
  const [google, openLibrary, wikipedia] = await Promise.all([
    getGoogleBookSnippets(book),
    getOpenLibrarySnippets(book),
    getWikipediaSnippets(book),
  ]);

  const seen = new Set<string>();
  return [...google, ...openLibrary, ...wikipedia].filter((snippet) => {
    const key = normalizeEntity(`${snippet.name} ${snippet.url} ${snippet.text.slice(0, 80)}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 7);
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found.");
    return JSON.parse(match[0]);
  }
}

async function generateFactSheet(book: BookFactDetails, canonicalKey: string): Promise<BookFactSheet> {
  const snippets = await collectSourceSnippets(book);
  const snippetText = snippets.length
    ? snippets.map((snippet, index) => `Source ${index + 1}: ${snippet.name}\nURL: ${snippet.url}\n${snippet.text}`).join("\n\n")
    : "No reliable public source snippets were found.";

  const response = await openai.chat.completions.create({
    model: factModel,
    max_tokens: 1800,
    messages: [
      {
        role: "system",
        content:
          "You create source-grounded book fact sheets for children's reading quizzes. Return only JSON. Do not guess. If source snippets do not support a specific fact, leave it out and lower sourceConfidence.",
      },
      {
        role: "user",
        content: `Create a fact sheet for the exact book ${book.title}${book.author ? ` by ${book.author}` : ""}${book.year ? `, around ${book.year}` : ""}${book.isbn ? `, ISBN ${book.isbn}` : ""}.

Use these source snippets first. You may use your own knowledge only when you are highly confident and it does not conflict with the snippets. Never borrow facts from adaptations, sequels, prequels, games, or similarly named works.

${snippetText}

Return JSON only:
{
  "sourceConfidence": number from 0 to 1,
  "facts": {
    "protagonist": string[],
    "majorCharacters": string[],
    "antagonistsOrConflicts": string[],
    "primarySettings": string[],
    "importantObjects": string[],
    "majorEvents": string[],
    "causeEffectMoments": string[],
    "themes": string[],
    "avoidConfusions": string[],
    "summary": string
  },
  "sourceNotes": string[]
}`,
      },
    ],
  });

  const raw = parseJsonObject(response.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;
  const facts = parseFactSheetFacts(raw.facts);
  const sourceConfidence = coerceConfidence(raw.sourceConfidence);
  const adjustedConfidence = snippets.length === 0 ? Math.min(sourceConfidence, 0.44) : sourceConfidence;
  const status = getFactStatus(facts, adjustedConfidence, snippets.length);

  return {
    canonicalKey,
    title: book.title,
    author: book.author ?? "",
    isbn: book.isbn ?? "",
    status,
    sourceConfidence: adjustedConfidence,
    facts,
    sourceNames: Array.from(new Set(snippets.map((snippet) => snippet.name))),
    sourceUrls: snippets.map((snippet) => snippet.url),
    sourceNotes: compactArray(raw.sourceNotes, 8),
  };
}

function mapStoredFactSheet(row: any): BookFactSheet {
  return {
    canonicalKey: String(row.canonical_key ?? ""),
    title: String(row.title ?? ""),
    author: String(row.author ?? ""),
    isbn: String(row.isbn ?? ""),
    status: row.status === "ready" || row.status === "low_confidence" || row.status === "needs_review"
      ? row.status
      : "needs_review",
    sourceConfidence: coerceConfidence(row.source_confidence),
    facts: parseFactSheetFacts(row.facts),
    sourceNames: Array.isArray(row.source_names) ? row.source_names.map(String) : [],
    sourceUrls: Array.isArray(row.source_urls) ? row.source_urls.map(String) : [],
    sourceNotes: Array.isArray(row.source_notes) ? row.source_notes.map(String) : [],
  };
}

export async function getOrCreateBookFactSheet(details: {
  book: BookFactDetails;
  canonicalKey?: string;
  forceRefresh?: boolean;
}) {
  const canonicalKey = details.canonicalKey || getBookDifficultyKey(details.book);

  if (!details.forceRefresh) {
    try {
      const supabase = createServiceSupabaseClient();
      const { data } = await supabase
        .from("book_fact_sheets")
        .select("*")
        .eq("canonical_key", canonicalKey)
        .eq("fact_version", BOOK_FACT_VERSION)
        .maybeSingle();

      if (data) {
        return mapStoredFactSheet(data);
      }
    } catch {
      // Missing tables or temporary Supabase errors should not prevent an in-memory attempt.
    }
  }

  const factSheet = await generateFactSheet(details.book, canonicalKey);

  try {
    const supabase = createServiceSupabaseClient();
    await supabase.from("book_fact_sheets").upsert({
      canonical_key: canonicalKey,
      title: factSheet.title,
      author: factSheet.author || null,
      isbn: factSheet.isbn || null,
      fact_version: BOOK_FACT_VERSION,
      status: factSheet.status,
      source_confidence: factSheet.sourceConfidence,
      facts: factSheet.facts as unknown as Json,
      source_names: factSheet.sourceNames,
      source_urls: factSheet.sourceUrls,
      source_notes: factSheet.sourceNotes,
      ai_model: factModel,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "canonical_key" });
  } catch {
    // Fact sheets improve reliability, but storage should not crash the request.
  }

  return factSheet;
}

export function isFactSheetUsableForDifficulty(factSheet: BookFactSheet, difficulty: string) {
  if (difficulty === "easy") return true;
  const facts = factSheet.facts;
  const specificFacts = getSpecificFactCount(facts);

  if (difficulty === "medium") {
    return factSheet.sourceConfidence >= 0.45 &&
      specificFacts >= 5 &&
      (facts.protagonist.length + facts.majorCharacters.length) > 0 &&
      (facts.primarySettings.length + facts.majorEvents.length) > 0;
  }

  return factSheet.sourceConfidence >= 0.55 &&
    specificFacts >= 7 &&
    facts.majorEvents.length > 0 &&
    (facts.causeEffectMoments.length + facts.themes.length + facts.antagonistsOrConflicts.length) > 0;
}

export function getFactSheetPrompt(factSheet: BookFactSheet) {
  const facts = factSheet.facts;
  const line = (label: string, values: string[]) => `${label}: ${values.length ? values.join("; ") : "Not verified"}`;

  return `Verified book fact sheet for this exact book. Source confidence: ${factSheet.sourceConfidence.toFixed(2)}. Use only these verified facts for Medium and Hard questions. Do not introduce characters, places, objects, conflicts, events, or themes not listed here. If a planned question type lacks enough verified facts, choose a safer grounded question from the verified facts.
${line("Protagonist", facts.protagonist)}
${line("Major characters", facts.majorCharacters)}
${line("Antagonists or conflicts", facts.antagonistsOrConflicts)}
${line("Primary settings", facts.primarySettings)}
${line("Important objects", facts.importantObjects)}
${line("Major events", facts.majorEvents)}
${line("Cause/effect moments", facts.causeEffectMoments)}
${line("Clearly supported themes", facts.themes)}
${line("Avoid confusing with", facts.avoidConfusions)}
Summary: ${facts.summary || "No verified summary."}`;
}

function addEntityVariants(allowed: Set<string>, value: string) {
  const normalized = normalizeEntity(value);
  if (!normalized) return;
  allowed.add(normalized);
  const parts = normalized.split(" ").filter((part) => part.length > 2);
  parts.forEach((part) => allowed.add(part));
  if (parts.length >= 2) {
    allowed.add(parts.slice(-1)[0]);
    allowed.add(parts.slice(0, 2).join(" "));
  }
}

function getAllowedEntities(factSheet: BookFactSheet) {
  const allowed = new Set<string>();
  [
    factSheet.title,
    factSheet.author,
    ...getGroundedFactStrings(factSheet.facts),
  ].forEach((value) => addEntityVariants(allowed, value));
  return allowed;
}

function extractCapitalizedTerms(text: string) {
  const matches = text.match(/\b(?:[A-Z][a-zA-Z'’-]{2,}|[A-Z]{2,})(?:\s+(?:of|the|and|[A-Z][a-zA-Z'’-]{2,}|[A-Z]{2,}))*\b/g) ?? [];
  return Array.from(new Set(matches.map(cleanText))).filter((term) => {
    const normalized = normalizeEntity(term);
    return normalized.length >= 3 && !ignoredCapitalizedTerms.has(normalized);
  });
}

export function getUnsupportedQuizTerms(
  question: {
    question?: unknown;
    choices?: unknown;
    answerText?: unknown;
  },
  factSheet: BookFactSheet,
) {
  const allowed = getAllowedEntities(factSheet);
  const choices = Array.isArray(question.choices) ? question.choices.map(String) : [];
  const terms = extractCapitalizedTerms([
    question.question,
    ...choices,
    question.answerText,
  ].map(cleanText).join(" "));

  return terms.filter((term) => {
    const normalized = normalizeEntity(term);
    if (!normalized || ignoredCapitalizedTerms.has(normalized)) return false;
    if (allowed.has(normalized)) return false;
    const parts = normalized.split(" ").filter(Boolean);
    return !parts.every((part) => allowed.has(part) || ignoredCapitalizedTerms.has(part));
  });
}
