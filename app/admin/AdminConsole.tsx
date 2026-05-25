"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  getEffectiveSubscriptionTier,
  getLifetimePoints,
  getParentVerificationRequests,
  getPlanQuizAvailability,
  getProfiles,
  getQuizIssueReports,
  getReadingChallenges,
  getSpendablePoints,
  getSpentPoints,
  normalizeSubscriptionTier,
  ParentVerificationRequest,
  Profile,
  QuizIssueReport,
  ReadingChallenge,
  subscriptionPlans,
  updateQuizIssueReport,
} from "../../lib/user";
import { COMPANY_NAME, PRODUCT_NAME, PRODUCT_VERSION } from "../../lib/product";
import { BETA_FEEDBACK_KEY } from "../../lib/beta";

type AdminTab = "overview" | "accounts" | "quiz" | "seeding" | "safety" | "prizes" | "errors";
type IssueTypeFilter = "all" | "feedback" | "quiz_report" | "error";
type IssueStatusFilter = "all" | "ongoing" | "resolved";
type IssueSort = "newest" | "oldest" | "type" | "status";

type TelemetryEvent = {
  id: string;
  type: "page_view" | "client_error" | "unhandled_rejection" | "fetch_error" | "api_failure";
  message: string;
  source?: string;
  status?: number;
  date: string;
};

type PrizeAddRequest = {
  id: string;
  childId: string;
  childName: string;
  prizeName: string;
  points: number;
  status: "pending" | "added" | "dismissed";
  date: string;
};

type FeedbackEntry = {
  id: string;
  profileId?: string;
  profileName?: string;
  category: string;
  message: string;
  page: string;
  adminStatus?: "still_problem" | "in_process" | "resolved";
  date: string;
};

type AdminProfile = Profile & {
  appDeletedAt?: string;
  appDeletedReason?: string;
  testAccountAt?: string;
};

type AdminIssueRow = {
  id: string;
  type: "Feedback" | "Quiz report" | "Error";
  filterType: Exclude<IssueTypeFilter, "all">;
  status: "ongoing" | "resolved";
  statusLabel: string;
  source: string;
  profileName: string;
  category: string;
  message: string;
  date: string;
  action?: ReactNode;
};

type QuestionPoolStats = {
  totalQuestions: number;
  activeQuestions: number;
  uniqueBooks: number;
  versionCounts: Record<string, number>;
  difficultyCounts: Record<string, number>;
  seededBooks: SeededBookRow[];
  recentBooks: Array<{
    title: string;
    author: string;
    version: number;
    difficulty: string;
    createdAt: string;
  }>;
};

type SeededBookRow = {
  canonicalKey: string;
  title: string;
  author: string;
  isbn: string;
  bookLevel: string;
  difficultyIndex: number | null;
  difficulties: Record<string, number>;
  questionCount: number;
  activeQuestionCount: number;
  version: number;
  firstSeededAt: string;
  lastSeededAt: string;
};

type SeedResult = {
  title: string;
  author: string;
  isbn?: string;
  level?: string;
  difficultyIndex?: number;
  generated: string[];
  skipped: Array<{ difficulty: string; reason: string }>;
  errors: Array<{ difficulty: string; error: string }>;
  generationMs: number;
};

type ExistingSeedPool = {
  title: string;
  author: string;
  isbn: string;
  canonicalKey?: string;
  difficulties: string[];
  questionCount: number;
};

type SeededBookSortKey = "title" | "author" | "bookLevel" | "difficulties" | "questionCount" | "lastSeededAt";

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "quiz", label: "Quiz Trust" },
  { id: "seeding", label: "Seed Pools" },
  { id: "safety", label: "Safety" },
  { id: "prizes", label: "Prizes" },
  { id: "errors", label: "Issue Center" },
];

const pageUsageColors = ["#22d3ee", "#facc15", "#2f6f4e", "#c084fc", "#f97316", "#9b2c2c", "#60a5fa", "#34d399"];
const ADMIN_FEEDBACK_SEEN_KEY = "readingQuestAdminFeedbackSeenAt";
const seedInputPlaceholder = `Where the Wild Things Are | Maurice Sendak
The Very Hungry Caterpillar | Eric Carle
Don't Let the Pigeon Drive the Bus! | Mo Willems
Frog and Toad Are Friends | Arnold Lobel`;
const knownSeedAuthors = [
  "Bill Martin Jr. & John Archambault",
  "Margaret Wise Brown",
  "Maurice Sendak",
  "Dr. Seuss",
  "Eric Carle",
  "Mo Willems",
  "Arnold Lobel",
  "Bill Martin Jr.",
  "Ezra Jack Keats",
  "Sandra Boynton",
  "Kevin Henkes",
  "Robert Munsch",
  "Don Freeman",
  "P. D. Eastman",
  "Doreen Cronin",
  "Julia Donaldson",
  "Oliver Jeffers",
  "Jon Klassen",
  "Lois Ehlert",
  "Laura Numeroff",
  "Anna Dewdney",
  "Crockett Johnson",
  "Ludwig Bemelmans",
];

const feedbackStatusLabels: Record<NonNullable<FeedbackEntry["adminStatus"]>, string> = {
  still_problem: "Still a problem",
  in_process: "In process",
  resolved: "Fixed/resolved",
};

const pageLabels: Record<string, string> = {
  "/": "Login",
  "/home": "Child Home",
  "/parent": "Parent Home",
  "/quiz": "Quiz",
  "/my-books": "My Books",
  "/leaderboards": "Leaderboards",
  "/prizes": "Prizes",
  "/friends": "Friends",
  "/settings": "Settings",
  "/faq": "FAQ",
  "/profile": "Profile",
  "/review": "Reviews",
  "/dashboard": "Dashboard",
};

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getLastActivity(profile: Profile) {
  const dates = [
    ...profile.quizzes.map((quiz) => quiz.date),
    ...(profile.readingLogs ?? []).map((log) => log.date),
    ...(profile.prizeRedemptions ?? []).map((redemption) => redemption.date),
  ].map((date) => new Date(date).getTime());

  const latest = Math.max(0, ...dates);
  return latest ? new Date(latest).toISOString() : "";
}

function isExpectedTelemetry(event: TelemetryEvent) {
  if (event.type === "page_view") {
    return true;
  }

  if (event.type === "api_failure" && event.source?.includes("/api/auth/child-profile") && [400, 401, 409].includes(event.status ?? 0)) {
    return true;
  }

  return false;
}

function parseSeedBooks(input: string) {
  const splitLine = (line: string) => {
    if (line.includes("|")) {
      return line.split("|").map((part) => part.trim());
    }

    const byMatch = line.match(/^(.+?)\s+by\s+(.+)$/i);
    if (byMatch) {
      return [byMatch[1].trim(), byMatch[2].trim()];
    }

    const spacedParts = line.split(/\t+|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (spacedParts.length > 1) {
      return spacedParts;
    }

    const lowerLine = line.toLowerCase();
    const matchedAuthor = knownSeedAuthors
      .slice()
      .sort((a, b) => b.length - a.length)
      .find((author) => lowerLine.endsWith(` ${author.toLowerCase()}`));
    if (matchedAuthor) {
      return [line.slice(0, -matchedAuthor.length).trim(), matchedAuthor];
    }

    return [line];
  };

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = splitLine(line);
      return {
        title: parts[0] ?? "",
        author: parts[1] ?? "",
        isbn: parts[2] ?? "",
        year: parts[3] ?? "",
      };
    })
    .filter((book) => book.title);
}

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [reports, setReports] = useState<Array<QuizIssueReport & { source?: "supabase" | "local" }>>([]);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [prizeAddRequests, setPrizeAddRequests] = useState<PrizeAddRequest[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [databaseParentRequests, setDatabaseParentRequests] = useState<ParentVerificationRequest[]>([]);
  const [databaseChallenges, setDatabaseChallenges] = useState<ReadingChallenge[]>([]);
  const [dataSource, setDataSource] = useState<"browser" | "database">("browser");
  const [feedbackSeenAt, setFeedbackSeenAt] = useState("");
  const [search, setSearch] = useState("");
  const [issueSearch, setIssueSearch] = useState("");
  const [issueTypeFilter, setIssueTypeFilter] = useState<IssueTypeFilter>("all");
  const [issueStatusFilter, setIssueStatusFilter] = useState<IssueStatusFilter>("all");
  const [issueSort, setIssueSort] = useState<IssueSort>("newest");
  const [message, setMessage] = useState("");
  const [pointAdjustments, setPointAdjustments] = useState<Record<string, string>>({});
  const [questionPoolStats, setQuestionPoolStats] = useState<QuestionPoolStats | null>(null);
  const [seedInput, setSeedInput] = useState("");
  const [seedResults, setSeedResults] = useState<SeedResult[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedWarnings, setSeedWarnings] = useState<ExistingSeedPool[]>([]);
  const [pendingSeedRequest, setPendingSeedRequest] = useState<{
    books: ReturnType<typeof parseSeedBooks>;
  } | null>(null);
  const [seedTableSearch, setSeedTableSearch] = useState("");
  const [seedDifficultyFilter, setSeedDifficultyFilter] = useState("all");
  const [seedLevelFilter, setSeedLevelFilter] = useState("all");
  const [seedVersionFilter, setSeedVersionFilter] = useState("all");
  const [seedSortKey, setSeedSortKey] = useState<SeededBookSortKey>("title");
  const [seedSortDirection, setSeedSortDirection] = useState<"asc" | "desc">("asc");

  const refresh = async () => {
    setProfiles(getProfiles());
    setReports(getQuizIssueReports().map((report) => ({ ...report, source: "local" as const })));
    setTelemetry(readLocalStorage<TelemetryEvent[]>("readingQuestTelemetryEvents", []));
    setPrizeAddRequests(readLocalStorage<PrizeAddRequest[]>("readingQuestPrizeAddRequests", []));
    setFeedbackEntries(readLocalStorage<FeedbackEntry[]>(BETA_FEEDBACK_KEY, []));

    try {
      const response = await fetch("/api/admin/data");
      if (!response.ok) {
        setDataSource("browser");
        return;
      }

      const data = await response.json() as {
        profiles?: AdminProfile[];
        reports?: Array<QuizIssueReport & { source?: "supabase" }>;
        telemetry?: TelemetryEvent[];
        feedbackEntries?: FeedbackEntry[];
        parentRequests?: ParentVerificationRequest[];
        prizeAddRequests?: PrizeAddRequest[];
        challenges?: ReadingChallenge[];
        questionPoolStats?: QuestionPoolStats;
      };

      setProfiles(data.profiles ?? []);
      setReports(data.reports ?? []);
      setTelemetry(data.telemetry ?? []);
      setFeedbackEntries(data.feedbackEntries ?? []);
      setDatabaseParentRequests(data.parentRequests ?? []);
      setPrizeAddRequests(data.prizeAddRequests ?? []);
      setDatabaseChallenges(data.challenges ?? []);
      setQuestionPoolStats(data.questionPoolStats ?? null);
      setDataSource("database");
    } catch {
      setDataSource("browser");
    }
  };

  useEffect(() => {
    setFeedbackSeenAt(typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_FEEDBACK_SEEN_KEY) ?? "" : "");
    void refresh();
  }, []);

  const signOut = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  };

  const parentRequests = useMemo(
    () => databaseParentRequests.length > 0 ? databaseParentRequests : getParentVerificationRequests(),
    [databaseParentRequests, profiles, reports],
  );
  const challenges = useMemo(
    () => databaseChallenges.length > 0 ? databaseChallenges : getReadingChallenges(),
    [databaseChallenges, profiles, reports],
  );
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const metrics = useMemo(() => {
    const children = profiles.filter((profile) => !profile.isParent);
    const parents = profiles.filter((profile) => profile.isParent);
    const quizzes = profiles.flatMap((profile) => profile.quizzes.map((quiz) => ({ ...quiz, profile })));
    const quizLast24 = quizzes.filter((quiz) => new Date(quiz.date).getTime() >= dayAgo);
    const activeThisWeek = profiles.filter((profile) => {
      const last = getLastActivity(profile);
      return last && new Date(last).getTime() >= weekAgo;
    });
    const betaLimitUsed = children.reduce((total, child) => total + getPlanQuizAvailability(child).used, 0);
    const betaLimitMax = Math.max(1, children.length * 10);
    const reportsOpen = reports.filter((report) => report.status !== "dismissed" && report.status !== "accepted");
    const reportedWrongAnswers = reports.filter((report) => report.reason === "wrong_answer").length;

    return {
      children,
      parents,
      quizzes,
      quizLast24,
      activeThisWeek,
      betaLimitUsed,
      betaLimitMax,
      reportsOpen,
      reportedWrongAnswers,
    };
  }, [dayAgo, profiles, reports, weekAgo]);

  const filteredProfiles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return profiles;
    return profiles.filter((profile) => {
      const text = [
        profile.name,
        profile.realName,
        profile.email,
        profile.phone,
        profile.profileCode,
        profile.id,
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(normalized);
    });
  }, [profiles, search]);

  const tierCounts = useMemo(() => {
    return profiles.reduce<Record<string, number>>((counts, profile) => {
      if (!profile.isParent) return counts;
      const tier = normalizeSubscriptionTier(profile.subscriptionTier);
      counts[tier] = (counts[tier] ?? 0) + 1;
      return counts;
    }, {});
  }, [profiles]);

  const resolveReport = async (reportId: string, status: "accepted" | "dismissed") => {
    const report = reports.find((item) => item.id === reportId);
    const parentNote = status === "accepted"
      ? "Admin marked this as needing correction or review."
      : "Admin dismissed this report.";

    if (report?.source === "supabase") {
      const response = await fetch("/api/admin/quiz-report", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status, parentNote }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Unable to update report." }));
        setMessage(data.error ?? "Unable to update report.");
        return;
      }
    } else {
      updateQuizIssueReport(reportId, { status, parentNote });
    }

    setMessage(status === "accepted" ? "Report marked for correction." : "Report dismissed.");
    await refresh();
  };

  const clearTelemetry = () => {
    window.localStorage.setItem("readingQuestTelemetryEvents", JSON.stringify([]));
    setTelemetry([]);
    setMessage("Error log cleared for this browser.");
  };

  const latestFeedbackDate = useMemo(() => {
    const latest = Math.max(0, ...feedbackEntries.map((entry) => new Date(entry.date).getTime()));
    return latest ? new Date(latest).toISOString() : "";
  }, [feedbackEntries]);

  const hasNewFeedback = Boolean(
    latestFeedbackDate &&
    (!feedbackSeenAt || new Date(latestFeedbackDate).getTime() > new Date(feedbackSeenAt).getTime()),
  );

  const markFeedbackSeen = () => {
    const seenAt = latestFeedbackDate || new Date().toISOString();
    window.localStorage.setItem(ADMIN_FEEDBACK_SEEN_KEY, seenAt);
    setFeedbackSeenAt(seenAt);
    setMessage("Feedback notification marked as seen.");
  };

  const updateFeedbackStatus = async (feedbackId: string, adminStatus: NonNullable<FeedbackEntry["adminStatus"]>) => {
    const nextEntries = feedbackEntries.map((entry) =>
      entry.id === feedbackId ? { ...entry, adminStatus } : entry,
    );
    setFeedbackEntries(nextEntries);

    if (dataSource === "database") {
      const response = await fetch("/api/admin/data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedbackId, adminStatus }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Unable to update feedback status." }));
        setMessage(data.error ?? "Unable to update feedback status.");
        await refresh();
        return;
      }
    } else {
      window.localStorage.setItem(BETA_FEEDBACK_KEY, JSON.stringify(nextEntries));
    }

    setMessage(`Feedback marked: ${feedbackStatusLabels[adminStatus]}.`);
  };

  const addManualPoints = async (profile: AdminProfile) => {
    const points = Math.ceil(Number(pointAdjustments[profile.id] ?? 0));
    if (!points || points < 1) {
      setMessage("Enter at least 1 point to add.");
      return;
    }

    const response = await fetch("/api/admin/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_points", profileId: profile.id, points }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Unable to add points." }));
      setMessage(data.error ?? "Unable to add points.");
      return;
    }

    setPointAdjustments((current) => ({ ...current, [profile.id]: "" }));
    setMessage(`Added ${points} points to ${profile.realName || profile.name}.`);
    await refresh();
  };

  const softDeleteAccount = async (profile: AdminProfile) => {
    const confirmed = window.confirm(`Remove ${profile.realName || profile.name} from the app? This keeps the Supabase record but blocks app sign-in and hides the account from leaderboards.`);
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/admin/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "soft_delete", profileId: profile.id }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Unable to remove account." }));
      setMessage(data.error ?? "Unable to remove account.");
      return;
    }

    setMessage(`${profile.realName || profile.name} was removed from the app.`);
    await refresh();
  };

  const toggleTestAccount = async (profile: AdminProfile) => {
    const enabled = !profile.testAccountAt;
    const confirmed = window.confirm(
      enabled
        ? `Turn ${profile.realName || profile.name} into a test account? They will be hidden from leaderboards while this is on and should sign out and back in before testing.`
        : `Turn off test account mode for ${profile.realName || profile.name}? They should sign out and back in before testing again.`,
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/admin/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_test_account", profileId: profile.id, enabled }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Unable to update test account status." }));
      setMessage(data.error ?? "Unable to update test account status.");
      return;
    }

    setMessage(enabled
      ? `${profile.realName || profile.name} is now a test account. Ask them to sign out and back in.`
      : `${profile.realName || profile.name} is no longer a test account. Ask them to sign out and back in.`,
    );
    await refresh();
  };

  const submitSeedBatch = async (books: ReturnType<typeof parseSeedBooks>, options: { forceReseed?: boolean } = {}) => {
    setSeedLoading(true);
    setMessage("Detecting book levels and seeding the appropriate quiz pools. Keep this tab open until the batch finishes.");

    try {
      const response = await fetch("/api/admin/seed-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books, forceReseed: Boolean(options.forceReseed) }),
      });
      const data = await response.json().catch(() => ({ error: "Unable to seed quiz pools." }));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to seed quiz pools.");
        return;
      }

      setSeedResults(data.results ?? []);
      setSeedWarnings([]);
      setPendingSeedRequest(null);
      setMessage(`Seeded ${data.processedBooks ?? 0} book${data.processedBooks === 1 ? "" : "s"}.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to seed quiz pools.");
    } finally {
      setSeedLoading(false);
    }
  };

  const runSeedBatch = async () => {
    const books = parseSeedBooks(seedInput);

    if (books.length === 0) {
      setMessage("Add at least one book in the seed list.");
      return;
    }

    setSeedLoading(true);
    setMessage("Checking existing question pools before seeding.");

    try {
      const response = await fetch("/api/admin/seed-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ books, checkOnly: true }),
      });
      const data = await response.json().catch(() => ({ error: "Unable to check existing pools." }));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to check existing pools.");
        return;
      }

      if (Array.isArray(data.existingPools) && data.existingPools.length > 0) {
        setSeedWarnings(data.existingPools);
        setPendingSeedRequest({ books });
        setMessage("One or more books already have question pools. Choose whether to re-seed.");
        return;
      }

      await submitSeedBatch(books);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to check existing pools.");
    } finally {
      setSeedLoading(false);
    }
  };

  const confirmReseed = async () => {
    if (!pendingSeedRequest) return;
    await submitSeedBatch(pendingSeedRequest.books, { forceReseed: true });
  };

  const cancelReseed = () => {
    setSeedWarnings([]);
    setPendingSeedRequest(null);
    setMessage("Re-seed cancelled. No API calls were used.");
  };

  const latestQuizzes = metrics.quizzes
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const latestRedemptions = profiles
    .flatMap((profile) => (profile.prizeRedemptions ?? []).map((redemption) => ({ ...redemption, profile })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  const pageUsage = useMemo(() => {
    const counts = telemetry
      .filter((event) => event.type === "page_view" && event.source)
      .reduce<Record<string, number>>((accumulator, event) => {
        const path = event.source ?? "Unknown";
        accumulator[path] = (accumulator[path] ?? 0) + 1;
        return accumulator;
      }, {});

    return Object.entries(counts)
      .map(([path, count]) => ({
        path,
        name: pageLabels[path] ?? path,
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [telemetry]);

  const actionableTelemetry = useMemo(
    () => telemetry.filter((event) => !isExpectedTelemetry(event)),
    [telemetry],
  );

  const seededBooks = questionPoolStats?.seededBooks ?? [];
  const seedVersionOptions = useMemo(
    () => Array.from(new Set(seededBooks.map((book) => String(book.version)).filter(Boolean))).sort((a, b) => Number(b) - Number(a)),
    [seededBooks],
  );
  const filteredSeededBooks = useMemo(() => {
    const normalizedSearch = seedTableSearch.trim().toLowerCase();
    const rows = seededBooks
      .filter((book) => {
        if (!normalizedSearch) return true;
        return [
          book.title,
          book.author,
          book.isbn,
          book.bookLevel,
          Object.keys(book.difficulties).join(" "),
        ].join(" ").toLowerCase().includes(normalizedSearch);
      })
      .filter((book) => seedDifficultyFilter === "all" || Boolean(book.difficulties[seedDifficultyFilter]))
      .filter((book) => seedLevelFilter === "all" || book.bookLevel === seedLevelFilter)
      .filter((book) => seedVersionFilter === "all" || String(book.version) === seedVersionFilter);

    return rows.sort((a, b) => {
      const direction = seedSortDirection === "asc" ? 1 : -1;
      if (seedSortKey === "difficulties") {
        return (Object.keys(a.difficulties).join(", ").localeCompare(Object.keys(b.difficulties).join(", "))) * direction;
      }
      if (seedSortKey === "questionCount") {
        return (a.questionCount - b.questionCount) * direction;
      }
      if (seedSortKey === "lastSeededAt") {
        return (new Date(a.lastSeededAt).getTime() - new Date(b.lastSeededAt).getTime()) * direction;
      }
      return String(a[seedSortKey] ?? "").localeCompare(String(b[seedSortKey] ?? "")) * direction;
    });
  }, [seedDifficultyFilter, seedLevelFilter, seedSortDirection, seedSortKey, seedTableSearch, seedVersionFilter, seededBooks]);

  const updateSeedSort = (key: SeededBookSortKey) => {
    if (seedSortKey === key) {
      setSeedSortDirection((direction) => direction === "asc" ? "desc" : "asc");
      return;
    }

    setSeedSortKey(key);
    setSeedSortDirection(key === "lastSeededAt" || key === "questionCount" ? "desc" : "asc");
  };

  const seedSearchMissing = Boolean(seedTableSearch.trim()) && filteredSeededBooks.length === 0;
  const queueSearchedSeedTitle = () => {
    const title = seedTableSearch.trim();
    if (!title) return;
    setSeedInput((current) => current.trim() ? `${current.trim()}\n${title}` : title);
    setMessage(`${title} was added to the seed list.`);
  };

  const issueRows = useMemo<AdminIssueRow[]>(() => {
    const feedbackRows: AdminIssueRow[] = feedbackEntries.map((entry) => {
      const status = entry.adminStatus ?? "still_problem";
      return {
        id: `feedback-${entry.id}`,
        type: "Feedback",
        filterType: "feedback",
        status: status === "resolved" ? "resolved" : "ongoing",
        statusLabel: feedbackStatusLabels[status],
        source: entry.page || "App",
        profileName: entry.profileName || "Unknown profile",
        category: entry.category,
        message: entry.message,
        date: entry.date,
        action: (
          <div className="feedback-status-controls compact">
            <button
              type="button"
              className={status === "still_problem" ? "selected feedback-status-button red" : "secondary feedback-status-button red"}
              onClick={() => void updateFeedbackStatus(entry.id, "still_problem")}
            >
              Red
            </button>
            <button
              type="button"
              className={status === "in_process" ? "selected feedback-status-button yellow" : "secondary feedback-status-button yellow"}
              onClick={() => void updateFeedbackStatus(entry.id, "in_process")}
            >
              Yellow
            </button>
            <button
              type="button"
              className={status === "resolved" ? "selected feedback-status-button green" : "secondary feedback-status-button green"}
              onClick={() => void updateFeedbackStatus(entry.id, "resolved")}
            >
              Green
            </button>
          </div>
        ),
      };
    });

    const reportRows: AdminIssueRow[] = reports.map((report) => {
      const resolved = report.status === "accepted" || report.status === "dismissed";
      return {
        id: `quiz-report-${report.id}`,
        type: "Quiz report",
        filterType: "quiz_report",
        status: resolved ? "resolved" : "ongoing",
        statusLabel: report.status === "accepted" ? "Accepted" : report.status === "dismissed" ? "Dismissed" : "Open",
        source: report.bookTitle,
        profileName: report.profileName || "Unknown profile",
        category: report.reason.replace(/_/g, " "),
        message: report.question,
        date: report.date,
        action: resolved ? (
          <span className="badge-pill">Reviewed</span>
        ) : (
          <div className="feedback-status-controls compact">
            <button type="button" className="secondary" onClick={() => void resolveReport(report.id, "accepted")}>Accept</button>
            <button type="button" className="secondary" onClick={() => void resolveReport(report.id, "dismissed")}>Dismiss</button>
          </div>
        ),
      };
    });

    const errorRows: AdminIssueRow[] = actionableTelemetry.map((event) => ({
      id: `error-${event.id}`,
      type: "Error",
      filterType: "error",
      status: "ongoing",
      statusLabel: "Needs review",
      source: event.source || "App",
      profileName: "System",
      category: event.type.replace(/_/g, " "),
      message: `${event.message}${event.status ? `, status ${event.status}` : ""}`,
      date: event.date,
    }));

    const normalizedSearch = issueSearch.trim().toLowerCase();
    return [...feedbackRows, ...reportRows, ...errorRows]
      .filter((row) => issueTypeFilter === "all" || row.filterType === issueTypeFilter)
      .filter((row) => issueStatusFilter === "all" || row.status === issueStatusFilter)
      .filter((row) => {
        if (!normalizedSearch) return true;
        return [
          row.type,
          row.statusLabel,
          row.source,
          row.profileName,
          row.category,
          row.message,
        ].join(" ").toLowerCase().includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (issueSort === "oldest") return new Date(a.date).getTime() - new Date(b.date).getTime();
        if (issueSort === "type") return a.type.localeCompare(b.type) || new Date(b.date).getTime() - new Date(a.date).getTime();
        if (issueSort === "status") return a.status.localeCompare(b.status) || new Date(b.date).getTime() - new Date(a.date).getTime();
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
  }, [actionableTelemetry, feedbackEntries, issueSearch, issueSort, issueStatusFilter, issueTypeFilter, reports]);

  return (
    <main className="admin-shell">
      <section className="admin-hero" aria-labelledby="admin-title">
        <div>
          <div className="kicker">Sightless Studios Admin</div>
          <h1 id="admin-title">{PRODUCT_NAME} Admin</h1>
          <p>{PRODUCT_VERSION} beta operations: accounts, quiz trust, child safety, prizes, errors, and usage.</p>
        </div>
        <button type="button" className="secondary" onClick={signOut}>Admin sign out</button>
      </section>

      <nav className="admin-tabs" aria-label="Admin sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "selected" : "secondary"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message ? <div className="success-box">{message}</div> : null}
      {seedWarnings.length > 0 ? (
        <div className="admin-modal-shell" role="dialog" aria-modal="true" aria-labelledby="seed-warning-heading">
          <button type="button" className="admin-modal-scrim" aria-label="Go back without re-seeding" onClick={cancelReseed} />
          <div className="admin-modal">
            <div className="kicker">Seed Pool Warning</div>
            <h2 id="seed-warning-heading">Existing question pool found</h2>
            <p>
              {seedWarnings.length === 1
                ? `${seedWarnings[0].title} has already been seeded.`
                : `${seedWarnings.length} books already have seeded question pools.`}
            </p>
            <div className="admin-card-list">
              {seedWarnings.map((warning) => (
                <div key={warning.canonicalKey ?? `${warning.title}-${warning.author}`} className="nested-section">
                  <strong>{warning.title}</strong>
                  <small className="block-note">
                    {warning.author || "Author not provided"}
                    {warning.isbn ? ` - ISBN ${warning.isbn}` : ""}
                  </small>
                  <p>Pool found for {warning.difficulties.join(", ")} with {warning.questionCount} stored questions.</p>
                </div>
              ))}
            </div>
            <div className="button-row">
              <button type="button" onClick={() => void confirmReseed()} disabled={seedLoading}>
                {seedLoading ? "Re-seeding..." : "Re-seed anyway"}
              </button>
              <button type="button" className="secondary" onClick={cancelReseed}>Go back</button>
            </div>
          </div>
        </div>
      ) : null}
      {hasNewFeedback ? (
        <div className="warning-box admin-feedback-notice">
          <div>
            <strong>New feedback received.</strong>
            <span> Review the latest notes in Beta Feedback below.</span>
          </div>
          <div className="button-row">
            <button type="button" className="secondary" onClick={markFeedbackSeen}>Mark as read</button>
          </div>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <>
          <section className="admin-section" aria-labelledby="admin-health-heading">
            <div className="section-header-row">
              <div>
                <h2 id="admin-health-heading">Beta Health</h2>
                <p>Fast signals for whether the app is being used safely and whether API usage is under control.</p>
              </div>
              <button type="button" className="secondary" onClick={() => void refresh()}>Refresh</button>
            </div>
            <p className="auth-footer-note">
              Data source: {dataSource === "database" ? "Supabase database, with browser fallback" : "this browser only"}.
            </p>
            <div className="admin-metric-grid">
              <div className="stat-tile"><span>Total accounts</span><strong>{profiles.length}</strong></div>
              <div className="stat-tile"><span>Children</span><strong>{metrics.children.length}</strong></div>
              <div className="stat-tile"><span>Parents</span><strong>{metrics.parents.length}</strong></div>
              <div className="stat-tile"><span>Active this week</span><strong>{metrics.activeThisWeek.length}</strong></div>
              <div className="stat-tile"><span>Quizzes today</span><strong>{metrics.quizLast24.length}</strong></div>
              <div className="stat-tile"><span>Beta quiz usage</span><strong>{metrics.betaLimitUsed} / {metrics.betaLimitMax}</strong></div>
              <div className="stat-tile"><span>Open quiz reports</span><strong>{metrics.reportsOpen.length}</strong></div>
              <div className="stat-tile"><span>Beta feedback</span><strong>{feedbackEntries.length}</strong></div>
              <div className="stat-tile"><span>Client errors</span><strong>{actionableTelemetry.length}</strong></div>
              <div className="stat-tile"><span>Pooled books</span><strong>{questionPoolStats?.uniqueBooks ?? 0}</strong></div>
              <div className="stat-tile"><span>Pool questions</span><strong>{questionPoolStats?.activeQuestions ?? 0}</strong></div>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="admin-feedback-heading">
            <div className="section-header-row">
              <div>
                <h2 id="admin-feedback-heading">Beta Feedback</h2>
                <p>Recent notes from families using the visible feedback button.</p>
              </div>
              <span className="badge-pill">{feedbackEntries.length} notes</span>
            </div>
            {feedbackEntries.length > 0 ? (
              <div className="admin-card-list">
                {feedbackEntries.map((entry) => {
                  const status = entry.adminStatus ?? "still_problem";
                  return (
                  <article key={entry.id} className={`nested-section feedback-review-card feedback-status-${status}`}>
                    <div className="section-header-row">
                      <div>
                        <strong>{entry.category}</strong>
                        <p>{entry.message}</p>
                        <small>{entry.profileName || "Unknown profile"} on {entry.page}</small>
                      </div>
                      <div className="feedback-review-meta">
                        <span className={`feedback-status-pill feedback-status-${status}`}>{feedbackStatusLabels[status]}</span>
                        <span className="badge-pill">{formatDate(entry.date)}</span>
                      </div>
                    </div>
                    <div className="feedback-status-controls" aria-label={`Status for ${entry.category}`}>
                      <button
                        type="button"
                        className={status === "still_problem" ? "selected feedback-status-button red" : "secondary feedback-status-button red"}
                        onClick={() => void updateFeedbackStatus(entry.id, "still_problem")}
                      >
                        Still a problem
                      </button>
                      <button
                        type="button"
                        className={status === "in_process" ? "selected feedback-status-button yellow" : "secondary feedback-status-button yellow"}
                        onClick={() => void updateFeedbackStatus(entry.id, "in_process")}
                      >
                        In process
                      </button>
                      <button
                        type="button"
                        className={status === "resolved" ? "selected feedback-status-button green" : "secondary feedback-status-button green"}
                        onClick={() => void updateFeedbackStatus(entry.id, "resolved")}
                      >
                        Fixed/resolved
                      </button>
                    </div>
                  </article>
                  );
                })}
              </div>
            ) : (
              <p>No beta feedback has been submitted yet.</p>
            )}
          </section>

          <section className="admin-section" aria-labelledby="admin-priorities-heading">
            <h2 id="admin-priorities-heading">Priority Watchlist</h2>
            <div className="admin-watch-grid">
              <div className="nested-section">
                <strong>Quiz trust</strong>
                <p>{metrics.reportsOpen.length} active reports, {metrics.reportedWrongAnswers} wrong-answer reports total.</p>
              </div>
              <div className="nested-section">
                <strong>Family safety</strong>
                <p>{parentRequests.filter((request) => request.status !== "verified").length} unresolved parent-child verification requests.</p>
              </div>
              <div className="nested-section">
                <strong>Social features</strong>
                <p>{challenges.filter((challenge) => challenge.status === "pending").length} pending head-to-head challenges.</p>
              </div>
              <div className="nested-section">
                <strong>Prize flow</strong>
                <p>{latestRedemptions.length} recent redemptions and {prizeAddRequests.filter((request) => request.status === "pending").length} child prize ideas waiting.</p>
              </div>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="admin-recommendations-heading">
            <h2 id="admin-recommendations-heading">Admin Recommendations</h2>
            <div className="admin-watch-grid">
              <div className="nested-section">
                <strong>Review unresolved issues first</strong>
                <p>Use the Issue Center to filter for ongoing feedback, quiz reports, and unexpected API failures before adding new features.</p>
              </div>
              <div className="nested-section">
                <strong>Watch quiz trust weekly</strong>
                <p>Track repeated wrong-answer and not-from-book reports by title so prompt fixes are based on patterns, not one-off examples.</p>
              </div>
              <div className="nested-section">
                <strong>Separate usage from errors</strong>
                <p>Keep page views in usage analytics, and reserve the Issue Center for items that need admin action.</p>
              </div>
              <div className="nested-section">
                <strong>Protect beta families</strong>
                <p>Check parent-child verification, prize requests, and child account access before expanding social features.</p>
              </div>
            </div>
          </section>

          <section className="admin-section" aria-labelledby="admin-page-usage-heading">
            <div className="section-header-row">
              <div>
                <h2 id="admin-page-usage-heading">Site Usage By Page</h2>
                <p>Page views captured during this beta browser session. Use this to spot which areas deserve updates first.</p>
              </div>
              <span className="badge-pill">{pageUsage.reduce((total, page) => total + page.value, 0)} views</span>
            </div>
            {pageUsage.length > 0 ? (
              <div className="admin-usage-grid">
                <div className="admin-chart-panel" aria-label="Site usage pie chart">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={pageUsage}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={104}
                        paddingAngle={2}
                      >
                        {pageUsage.map((entry, index) => (
                          <Cell key={entry.path} fill={pageUsageColors[index % pageUsageColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} views`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="admin-card-list">
                  {pageUsage.slice(0, 8).map((page, index) => (
                    <div key={page.path} className="admin-usage-row">
                      <span style={{ background: pageUsageColors[index % pageUsageColors.length] }} />
                      <strong>{page.name}</strong>
                      <small>{page.value} views</small>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p>No page usage has been captured yet. Navigate around the app, then refresh the admin page.</p>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "accounts" ? (
        <section className="admin-section" aria-labelledby="admin-accounts-heading">
          <div className="section-header-row">
            <div>
              <h2 id="admin-accounts-heading">Accounts</h2>
              <p>Search by screen name, real name, email, phone, profile code, or account id.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="admin-search">Search accounts</label>
            <input id="admin-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" />
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Plan</th>
                  <th>Points</th>
                  <th>Quizzes</th>
                  <th>Friends</th>
                  <th>Last activity</th>
                  <th>Beta admin</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id} className={profile.appDeletedAt ? "admin-deleted-account" : ""}>
                    <td>
                      <strong>{profile.realName || profile.name}</strong>
                      <small className="block-note">{profile.email || profile.profileCode || profile.id}</small>
                      {profile.appDeletedAt ? <span className="badge-pill danger-pill">Removed from app</span> : null}
                      {profile.testAccountAt ? <span className="badge-pill test-pill">Test account</span> : null}
                    </td>
                    <td>{profile.isParent ? "Parent" : "Child"}</td>
                    <td>{subscriptionPlans[getEffectiveSubscriptionTier(profile)].name}</td>
                    <td>{getSpendablePoints(profile)} available, {getLifetimePoints(profile)} lifetime</td>
                    <td>{profile.quizzes.length}</td>
                    <td>{profile.friendProfileIds?.length ?? 0}</td>
                    <td>{getLastActivity(profile) ? formatDate(getLastActivity(profile)) : "No activity yet"}</td>
                    <td>
                      <div className="admin-account-actions">
                        <input
                          aria-label={`Points to add to ${profile.realName || profile.name}`}
                          inputMode="numeric"
                          min={1}
                          type="number"
                          value={pointAdjustments[profile.id] ?? ""}
                          onChange={(event) => setPointAdjustments((current) => ({ ...current, [profile.id]: event.target.value }))}
                          placeholder="+ points"
                        />
                        <button type="button" className="secondary" onClick={() => void addManualPoints(profile)}>Add</button>
                        <button type="button" className="secondary danger-button" disabled={Boolean(profile.appDeletedAt)} onClick={() => void softDeleteAccount(profile)}>
                          {profile.appDeletedAt ? "Removed" : "Delete"}
                        </button>
                        <button type="button" className="secondary" disabled={Boolean(profile.appDeletedAt)} onClick={() => void toggleTestAccount(profile)}>
                          {profile.testAccountAt ? "Test Off" : "Test On"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "quiz" ? (
        <section className="admin-section" aria-labelledby="admin-quiz-heading">
          <div className="section-header-row">
            <div>
              <h2 id="admin-quiz-heading">Quiz Trust</h2>
              <p>Review reports where a parent or child flagged a question as unfair, wrong, or impossible.</p>
            </div>
            <span className="badge-pill">{metrics.reportsOpen.length} open</span>
          </div>
          <div className="admin-card-list">
            {reports.length > 0 ? reports.map((report) => (
              <article key={report.id} className="review-queue-item">
                <div className="section-header-row">
                  <div>
                    <strong>{report.bookTitle}</strong>
                    <p>{report.question}</p>
                    <small>{report.profileName} reported {report.reason.replace(/_/g, " ")} on {formatDate(report.date)}</small>
                  </div>
                  <span className="badge-pill">{report.status ?? "open"}</span>
                </div>
                <div className="admin-answer-grid">
                  {report.choices.map((choice, index) => (
                    <div key={`${report.id}-${choice}`} className={`nested-section ${index === report.answerIndex ? "admin-correct-answer" : ""} ${index === report.selectedChoice ? "admin-selected-answer" : ""}`}>
                      <strong>{choice}</strong>
                      <small>{index === report.answerIndex ? "System answer" : ""}{index === report.selectedChoice ? " Child picked" : ""}</small>
                    </div>
                  ))}
                </div>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={() => void resolveReport(report.id, "accepted")}>Mark needs correction</button>
                  <button type="button" className="secondary" onClick={() => void resolveReport(report.id, "dismissed")}>Dismiss report</button>
                </div>
              </article>
            )) : <p>No quiz reports yet.</p>}
          </div>
          <h3>Recent Quizzes</h3>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Reader</th>
                  <th>Book</th>
                  <th>Difficulty</th>
                  <th>Score</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {latestQuizzes.map((quiz) => (
                  <tr key={`${quiz.profile.id}-${quiz.bookTitle}-${quiz.date}`}>
                    <td>{quiz.profile.realName || quiz.profile.name}</td>
                    <td>{quiz.bookTitle}</td>
                    <td>{quiz.difficulty}</td>
                    <td>{quiz.score} / {quiz.maxScore}</td>
                    <td>{formatDate(quiz.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "seeding" ? (
        <section className="admin-section admin-seed-section" aria-labelledby="admin-seed-heading">
          <div className="section-header-row">
            <div>
              <h2 id="admin-seed-heading">Quiz Pool Seeding</h2>
              <p>Admin-only batch generation for curated books. Run small batches, review results, then continue.</p>
            </div>
            <button type="button" className="secondary" onClick={() => void refresh()}>Refresh pool stats</button>
          </div>

          <div className="admin-metric-grid">
            <div className="stat-tile"><span>Active questions</span><strong>{questionPoolStats?.activeQuestions ?? 0}</strong></div>
            <div className="stat-tile"><span>Unique books</span><strong>{questionPoolStats?.uniqueBooks ?? 0}</strong></div>
            <div className="stat-tile"><span>Easy</span><strong>{questionPoolStats?.difficultyCounts.easy ?? 0}</strong></div>
            <div className="stat-tile"><span>Medium</span><strong>{questionPoolStats?.difficultyCounts.medium ?? 0}</strong></div>
            <div className="stat-tile"><span>Hard</span><strong>{questionPoolStats?.difficultyCounts.hard ?? 0}</strong></div>
          </div>

          <div className="admin-seed-grid">
            <div className="nested-section admin-seed-control">
              <h3>Seed a curated batch</h3>
              <p>One book per line. Use <strong>Title | Author | ISBN | Year</strong>. Only the title is required. The batch is capped at 5 books per run.</p>
              <div className="notice">
                Reading Quest detects each book level and seeds the full allowed cumulative pool: Beginner seeds Easy, Intermediate seeds Easy and Medium, and Advanced seeds Easy, Medium, and Hard.
              </div>
              <div className="field">
                <label htmlFor="seed-books">Books to seed</label>
                <textarea
                  id="seed-books"
                  value={seedInput}
                  onChange={(event) => setSeedInput(event.target.value)}
                  placeholder={seedInputPlaceholder}
                  rows={9}
                />
              </div>
              <div className="button-row">
                <button type="button" onClick={() => void runSeedBatch()} disabled={seedLoading}>
                  {seedLoading ? "Seeding..." : "Seed book pools"}
                </button>
                <button type="button" className="secondary" onClick={() => setSeedInput(seedInputPlaceholder)}>
                  Load sample format
                </button>
              </div>
              <p className="auth-footer-note">Quiz difficulty is cumulative, so higher pools still include grounded recall, timeline, cause/effect, and comprehension checks.</p>
            </div>

            <div className="nested-section">
              <h3>Recent pooled books</h3>
              <div className="admin-card-list">
                {questionPoolStats?.recentBooks?.length ? questionPoolStats.recentBooks.map((book) => (
                  <div key={`${book.title}-${book.difficulty}-${book.createdAt}`} className="admin-usage-row admin-seed-row">
                    <span />
                    <strong>{book.title}</strong>
                    <small>{book.difficulty} · v{book.version} · {formatDate(book.createdAt)}</small>
                  </div>
                )) : <p>No pooled books yet.</p>}
              </div>
            </div>
          </div>

          <div className="admin-section admin-seeded-library" aria-labelledby="seeded-library-heading">
            <div className="section-header-row">
              <div>
                <h3 id="seeded-library-heading">Seeded Book Library</h3>
                <p>A running book registry from Supabase, sorted alphabetically by default. A row appears when at least one question pool exists for that book.</p>
              </div>
              <span className="badge-pill">{filteredSeededBooks.length} shown / {seededBooks.length} seeded</span>
            </div>

            <div className="admin-issue-controls admin-seeded-controls">
              <div className="field">
                <label htmlFor="seeded-book-search">Search seeded books</label>
                <input
                  id="seeded-book-search"
                  value={seedTableSearch}
                  onChange={(event) => setSeedTableSearch(event.target.value)}
                  placeholder="Search title, author, ISBN, level, or difficulty"
                />
              </div>
              <div className="field">
                <label htmlFor="seeded-difficulty-filter">Difficulty</label>
                <select id="seeded-difficulty-filter" value={seedDifficultyFilter} onChange={(event) => setSeedDifficultyFilter(event.target.value)}>
                  <option value="all">All difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="seeded-level-filter">Book level</label>
                <select id="seeded-level-filter" value={seedLevelFilter} onChange={(event) => setSeedLevelFilter(event.target.value)}>
                  <option value="all">All levels</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="seeded-version-filter">Pool version</label>
                <select id="seeded-version-filter" value={seedVersionFilter} onChange={(event) => setSeedVersionFilter(event.target.value)}>
                  <option value="all">All versions</option>
                  {seedVersionOptions.map((version) => (
                    <option key={version} value={version}>v{version}</option>
                  ))}
                </select>
              </div>
            </div>

            {seedSearchMissing ? (
              <div className="warning-box admin-seed-missing">
                <strong>{seedTableSearch.trim()} has not yet been seeded.</strong>
                <span> Add it to the seed list above and run a batch when you are ready.</span>
                <button type="button" className="secondary" onClick={queueSearchedSeedTitle}>Add to seed list</button>
              </div>
            ) : null}

            <div className="responsive-table admin-seeded-table-wrap">
              <table className="admin-seeded-table">
                <thead>
                  <tr>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("title")}>Book {seedSortKey === "title" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("author")}>Author {seedSortKey === "author" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                    <th>ISBN</th>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("bookLevel")}>Level {seedSortKey === "bookLevel" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("difficulties")}>Seeded quizzes {seedSortKey === "difficulties" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("questionCount")}>Questions {seedSortKey === "questionCount" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                    <th>Version</th>
                    <th><button type="button" className="table-sort-button" onClick={() => updateSeedSort("lastSeededAt")}>Last seeded {seedSortKey === "lastSeededAt" ? (seedSortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSeededBooks.length > 0 ? filteredSeededBooks.map((book) => (
                    <tr key={book.canonicalKey}>
                      <td><strong>{book.title}</strong></td>
                      <td>{book.author || "Not stored"}</td>
                      <td>{book.isbn || "Not stored"}</td>
                      <td>{book.bookLevel || "Unknown"}{book.difficultyIndex ? ` · ${book.difficultyIndex}/9.9` : ""}</td>
                      <td>
                        {Object.entries(book.difficulties)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([difficulty]) => difficulty)
                          .join(", ")}
                      </td>
                      <td>{book.questionCount}</td>
                      <td>v{book.version}</td>
                      <td>{formatDate(book.lastSeededAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8}>No seeded books match the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {seedResults.length > 0 ? (
            <div className="responsive-table admin-seed-results">
              <table>
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Detected level</th>
                    <th>Generated</th>
                    <th>Skipped</th>
                    <th>Errors</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {seedResults.map((result) => (
                    <tr key={`${result.title}-${result.generationMs}`}>
                      <td>
                        <strong>{result.title}</strong>
                        <small className="block-note">
                          {result.author || "Author not provided"}
                          {result.isbn ? ` - ISBN ${result.isbn}` : ""}
                        </small>
                      </td>
                      <td>{result.level ?? "Unknown"}{result.difficultyIndex ? ` · ${result.difficultyIndex}/9.9` : ""}</td>
                      <td>{result.generated.length ? result.generated.join(", ") : "None"}</td>
                      <td>{result.skipped.length ? result.skipped.map((skip) => `${skip.difficulty}: ${skip.reason}`).join("; ") : "None"}</td>
                      <td>{result.errors.length ? result.errors.map((error) => `${error.difficulty}: ${error.error}`).join("; ") : "None"}</td>
                      <td>{Math.round(result.generationMs / 1000)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "safety" ? (
        <section className="admin-section" aria-labelledby="admin-safety-heading">
          <h2 id="admin-safety-heading">Family Safety</h2>
          <div className="admin-card-list">
            {parentRequests.length > 0 ? parentRequests.map((request) => (
              <article key={request.id} className="nested-section">
                <div className="section-header-row">
                  <div>
                    <strong>{request.parentName} requested {request.childScreenName}</strong>
                    <p>Child approval required from the child profile.</p>
                    <small>Created {formatDate(request.createdAt)}{request.expiresAt ? `, expires ${formatDate(request.expiresAt)}` : ""}</small>
                  </div>
                  <span className="badge-pill">{request.status.replace(/_/g, " ")}</span>
                </div>
              </article>
            )) : <p>No parent-child verification requests yet.</p>}
          </div>
          <h3>Child Permissions</h3>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Parent linked</th>
                  <th>Friend sharing</th>
                  <th>Location lookup</th>
                  <th>Quiz review</th>
                </tr>
              </thead>
              <tbody>
                {metrics.children.map((child) => {
                  const linkedParent = profiles.find((profile) => profile.isParent && profile.linkedChildren?.includes(child.id));
                  return (
                    <tr key={child.id}>
                      <td>{child.name}</td>
                      <td>{linkedParent?.realName || linkedParent?.name || "No"}</td>
                      <td>{child.canAddFriends ? "On" : "Off"}</td>
                      <td>{child.parentControls?.allowLocationLookup ? "On" : "Off"}</td>
                      <td>{child.parentControls?.requireAiQuizReview ? "Required" : "Optional"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === "prizes" ? (
        <section className="admin-section" aria-labelledby="admin-prizes-heading">
          <h2 id="admin-prizes-heading">Prizes, Plans, And Social Activity</h2>
          <div className="admin-watch-grid">
            {Object.entries(subscriptionPlans).map(([tier, plan]) => (
              <div key={tier} className="nested-section">
                <strong>{plan.name}</strong>
                <p>{tierCounts[tier] ?? 0} parent accounts. {plan.quizRule}.</p>
              </div>
            ))}
          </div>
          <h3>Recent Prize Redemptions</h3>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Reader</th>
                  <th>Prize</th>
                  <th>Spent</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {latestRedemptions.map((redemption) => (
                  <tr key={redemption.id}>
                    <td>{redemption.profile.realName || redemption.profile.name}</td>
                    <td>{redemption.prizeName}</td>
                    <td>{redemption.pointsSpent}</td>
                    <td>{formatDate(redemption.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Child Prize Ideas</h3>
          <div className="admin-card-list">
            {prizeAddRequests.length > 0 ? prizeAddRequests.map((request) => (
              <div key={request.id} className="nested-section">
                <strong>{request.prizeName}</strong>
                <p>{request.childName} requested this for {request.points} points.</p>
                <small>{request.status} on {formatDate(request.date)}</small>
              </div>
            )) : <p>No child prize ideas yet.</p>}
          </div>
          <h3>Head-To-Head Challenges</h3>
          <div className="admin-card-list">
            {challenges.length > 0 ? challenges.slice(0, 8).map((challenge) => (
              <div key={challenge.id} className="nested-section">
                <strong>{challenge.bookTitle}</strong>
                <p>{challenge.fromName} challenged {challenge.toName}. Status: {challenge.status}.</p>
                <small>Created {formatDate(challenge.createdAt)}</small>
              </div>
            )) : <p>No challenges yet.</p>}
          </div>
        </section>
      ) : null}

      {activeTab === "errors" ? (
        <section className="admin-section" aria-labelledby="admin-errors-heading">
          <div className="section-header-row">
            <div>
              <h2 id="admin-errors-heading">Issue Center</h2>
              <p>Table-friendly review for feedback, quiz reports, client crashes, failed fetches, and unexpected API failures.</p>
            </div>
            <button type="button" className="secondary" onClick={clearTelemetry}>Clear log</button>
          </div>

          <div className="admin-issue-controls">
            <div className="field">
              <label htmlFor="issue-search">Search issues</label>
              <input
                id="issue-search"
                value={issueSearch}
                onChange={(event) => setIssueSearch(event.target.value)}
                placeholder="Search feedback, errors, books, profiles"
              />
            </div>
            <div className="field">
              <label htmlFor="issue-type-filter">Type</label>
              <select id="issue-type-filter" value={issueTypeFilter} onChange={(event) => setIssueTypeFilter(event.target.value as IssueTypeFilter)}>
                <option value="all">All types</option>
                <option value="feedback">Feedback</option>
                <option value="quiz_report">Quiz reports</option>
                <option value="error">Errors/API failures</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="issue-status-filter">Status</label>
              <select id="issue-status-filter" value={issueStatusFilter} onChange={(event) => setIssueStatusFilter(event.target.value as IssueStatusFilter)}>
                <option value="all">All statuses</option>
                <option value="ongoing">Ongoing</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="issue-sort">Sort</label>
              <select id="issue-sort" value={issueSort} onChange={(event) => setIssueSort(event.target.value as IssueSort)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="type">Type</option>
                <option value="status">Status</option>
              </select>
            </div>
          </div>

          <div className="admin-issue-summary">
            <span className="badge-pill">{issueRows.length} shown</span>
            <span className="badge-pill">{issueRows.filter((row) => row.status === "ongoing").length} ongoing</span>
            <span className="badge-pill">{issueRows.filter((row) => row.status === "resolved").length} resolved</span>
          </div>

          <div className="responsive-table admin-issue-table-wrap">
            <table className="admin-issue-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Profile</th>
                  <th>Source</th>
                  <th>Category</th>
                  <th>Message</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {issueRows.length > 0 ? issueRows.map((row) => (
                  <tr key={row.id} className={`admin-issue-row issue-${row.status}`}>
                    <td><strong>{row.type}</strong></td>
                    <td><span className={`feedback-status-pill feedback-status-${row.status === "resolved" ? "resolved" : "still_problem"}`}>{row.statusLabel}</span></td>
                    <td>{row.profileName}</td>
                    <td>{row.source}</td>
                    <td>{row.category}</td>
                    <td className="admin-issue-message">{row.message}</td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.action ?? <span className="badge-pill">Review</span>}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8}>No issues match the current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="auth-footer-note">Admin data uses Supabase when available and falls back to browser beta data only if the shared database cannot be reached. {COMPANY_NAME}</p>
    </main>
  );
}
