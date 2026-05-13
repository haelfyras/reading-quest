"use client";

import { useEffect, useMemo, useState } from "react";
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

type AdminTab = "overview" | "accounts" | "quiz" | "safety" | "prizes" | "errors";

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

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "accounts", label: "Accounts" },
  { id: "quiz", label: "Quiz Trust" },
  { id: "safety", label: "Safety" },
  { id: "prizes", label: "Prizes" },
  { id: "errors", label: "Errors" },
];

const pageUsageColors = ["#22d3ee", "#facc15", "#2f6f4e", "#c084fc", "#f97316", "#9b2c2c", "#60a5fa", "#34d399"];
const ADMIN_FEEDBACK_SEEN_KEY = "readingQuestAdminFeedbackSeenAt";

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

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<Array<QuizIssueReport & { source?: "supabase" | "local" }>>([]);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [prizeAddRequests, setPrizeAddRequests] = useState<PrizeAddRequest[]>([]);
  const [feedbackEntries, setFeedbackEntries] = useState<FeedbackEntry[]>([]);
  const [databaseParentRequests, setDatabaseParentRequests] = useState<ParentVerificationRequest[]>([]);
  const [databaseChallenges, setDatabaseChallenges] = useState<ReadingChallenge[]>([]);
  const [dataSource, setDataSource] = useState<"browser" | "database">("browser");
  const [feedbackSeenAt, setFeedbackSeenAt] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

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
        profiles?: Profile[];
        reports?: Array<QuizIssueReport & { source?: "supabase" }>;
        telemetry?: TelemetryEvent[];
        feedbackEntries?: FeedbackEntry[];
        parentRequests?: ParentVerificationRequest[];
        prizeAddRequests?: PrizeAddRequest[];
        challenges?: ReadingChallenge[];
      };

      setProfiles(data.profiles ?? []);
      setReports(data.reports ?? []);
      setTelemetry(data.telemetry ?? []);
      setFeedbackEntries(data.feedbackEntries ?? []);
      setDatabaseParentRequests(data.parentRequests ?? []);
      setPrizeAddRequests(data.prizeAddRequests ?? []);
      setDatabaseChallenges(data.challenges ?? []);
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
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.realName || profile.name}</strong>
                      <small className="block-note">{profile.email || profile.profileCode || profile.id}</small>
                    </td>
                    <td>{profile.isParent ? "Parent" : "Child"}</td>
                    <td>{subscriptionPlans[getEffectiveSubscriptionTier(profile)].name}</td>
                    <td>{getSpendablePoints(profile)} available, {getLifetimePoints(profile)} lifetime</td>
                    <td>{profile.quizzes.length}</td>
                    <td>{profile.friendProfileIds?.length ?? 0}</td>
                    <td>{getLastActivity(profile) ? formatDate(getLastActivity(profile)) : "No activity yet"}</td>
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
                  <th>AI review</th>
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
              <h2 id="admin-errors-heading">Errors And API Health</h2>
              <p>Client crashes, unhandled errors, failed fetches, and unexpected API failures. Page views and normal failed sign-ins are filtered out.</p>
            </div>
            <button type="button" className="secondary" onClick={clearTelemetry}>Clear log</button>
          </div>
          <div className="admin-card-list admin-error-list" role="log" aria-label="Actionable admin errors">
            {actionableTelemetry.length > 0 ? actionableTelemetry.map((event) => (
              <article key={event.id} className="nested-section">
                <div className="section-header-row">
                  <div>
                    <strong>{event.type.replace(/_/g, " ")}</strong>
                    <p>{event.message}</p>
                    <small>{event.source || "App"}{event.status ? `, status ${event.status}` : ""}</small>
                  </div>
                  <span className="badge-pill">{formatDate(event.date)}</span>
                </div>
              </article>
            )) : <p>No client errors have been captured in this browser.</p>}
          </div>
        </section>
      ) : null}

      <p className="auth-footer-note">Admin data currently reflects browser-stored beta data. Move profiles and events to a database before broad public launch. {COMPANY_NAME}</p>
    </main>
  );
}
