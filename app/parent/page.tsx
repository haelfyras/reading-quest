"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  awardQuizIssueReportPoints,
  defaultParentControls,
  getCurrentProfile,
  getLifetimePoints,
  getPointTimeline,
  getProfiles,
  getQuizIssueReports,
  getSpendablePoints,
  Profile,
  QuizIssueReport,
  updateProfile,
  updateQuizIssueReport,
} from "../../lib/user";
import { loadSiteLeaderboardProfiles } from "../../lib/leaderboards";
import { betaConfig } from "../../lib/beta";
import { hasSavedPrizes } from "../../lib/prizeData";
import BetaDisclaimer from "../components/BetaDisclaimer";
import SetupGuide, { type SetupStep } from "../components/SetupGuide";

const testingLevelOptions = [
  {
    value: "habit_formation",
    label: "Habit Forming",
    description: "I just want my child to read more.",
  },
  {
    value: "basic_recollection",
    label: "Basic Recollection",
    description: "I want my child to know names, places, and objects from the story.",
  },
  {
    value: "further_understanding",
    label: "Further Understanding",
    description: "I want my child to understand why characters did something or went somewhere.",
  },
  {
    value: "full_understanding",
    label: "Full Understanding",
    description: "I want my child to fully understand the material and the bigger picture of the work.",
  },
] as const;

export default function ParentPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [children, setChildren] = useState<Profile[]>([]);
  const [reports, setReports] = useState<QuizIssueReport[]>([]);
  const [parentMessage, setParentMessage] = useState("");
  const [adultLeaderboard, setAdultLeaderboard] = useState<Profile[]>([]);

  useEffect(() => {
    const profile = getCurrentProfile();
    if (!profile || !profile.isParent) {
      router.push("/");
      return;
    }

    setCurrentUser(profile);
    setChildren(getProfiles().filter((child) => profile.linkedChildren?.includes(child.id)));
    setReports(getQuizIssueReports().filter((report) => report.status !== "dismissed"));
    loadSiteLeaderboardProfiles(profile.id)
      .then((profiles) => {
        setAdultLeaderboard(
          profiles
            .filter((item) => item.isParent)
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      })
      .catch(() => {
        setAdultLeaderboard(
          getProfiles()
            .filter((item) => item.isParent)
            .slice()
            .sort((a, b) => getLifetimePoints(b) - getLifetimePoints(a)),
        );
      });
  }, [router]);

  const currentRank = currentUser ? adultLeaderboard.findIndex((profile) => profile.id === currentUser.id) + 1 : 0;
  const pointsProgressData = useMemo(() => currentUser ? getPointTimeline(currentUser) : [], [currentUser]);
  const childQuizCount = children.reduce((total, child) => total + child.quizzes.length, 0);
  const hasChildPrizes = children.some((child) => hasSavedPrizes(child.id));
  const hasAdjustedChildSettings = children.some((child) => Boolean(child.parentControls));
  const parentSetupSteps: SetupStep[] = [
    {
      id: "account",
      title: "Create and confirm your parent account",
      description: "Use your email and password, confirm the email, then sign in for the first time.",
      href: "/profile",
      actionLabel: "View Profile",
      complete: Boolean(currentUser?.verified || currentUser?.email),
    },
    {
      id: "link-child",
      title: "Connect your child",
      description: "If your child already has an account, add them from Profile and follow the child approval and code steps.",
      href: "/profile",
      actionLabel: "Add Child",
      complete: children.length > 0,
    },
    {
      id: "review-quizzes",
      title: "Review child quiz history",
      description: "See what quizzes your child has taken, what they missed, and whether anything needs parent review.",
      href: "/parent",
      actionLabel: "Review Quizzes",
      complete: children.length > 0 && childQuizCount > 0,
    },
    {
      id: "prizes-settings",
      title: "Set prizes or child settings",
      description: "Set up prizes now, or update testing level, retakes, and review controls first and do prizes later.",
      href: hasChildPrizes ? "/settings" : "/prizes",
      actionLabel: hasChildPrizes ? "Update Settings" : "Set Prizes",
      complete: children.length > 0 && (hasChildPrizes || hasAdjustedChildSettings),
    },
    {
      id: "parent-reader",
      title: "Join the reading challenge too",
      description: "Parents can set goals, take quizzes, earn points, and model reading alongside their child.",
      href: currentUser?.quizzes.length ? "/settings" : "/quiz",
      actionLabel: currentUser?.quizzes.length ? "Set Goals" : "Take a Quiz",
      complete: (currentUser?.quizzes.length ?? 0) > 0,
    },
  ];

  const refreshParentData = () => {
    if (!currentUser) return;
    const profiles = getProfiles();
    const updatedParent = profiles.find((profile) => profile.id === currentUser.id) ?? currentUser;
    setCurrentUser(updatedParent);
    setChildren(profiles.filter((child) => updatedParent.linkedChildren?.includes(child.id)));
    setReports(getQuizIssueReports().filter((report) => report.status !== "dismissed"));
  };

  const updateChildControls = (child: Profile, key: keyof NonNullable<Profile["parentControls"]>, value: boolean | string) => {
    const controls = { ...defaultParentControls, ...(child.parentControls ?? {}) };
    const updated = updateProfile({
      ...child,
      parentControls: {
        ...controls,
        [key]: value,
      },
    });
    setChildren((current) => current.map((item) => item.id === updated.id ? updated : item));
    setParentMessage("Parent control saved.");
  };

  const resolveReport = (reportId: string, status: "accepted" | "dismissed") => {
    if (status === "accepted") {
      awardQuizIssueReportPoints(reportId);
      updateQuizIssueReport(reportId, {
        status,
        parentNote: "Parent agreed this quiz item needs review and awarded the missed points.",
      });
      setParentMessage("Report accepted. The reader received the missed points for that question.");
    } else {
      updateQuizIssueReport(reportId, {
        status,
        parentNote: "Parent dismissed this report.",
      });
      setParentMessage("Report dismissed.");
    }
    refreshParentData();
  };

  if (!currentUser) {
    return <main><p>Loading...</p></main>;
  }

  return (
    <main className="app-screen">
      <div className="hero-panel app-hero">
        <div>
          <div className="kicker">Parent Hub</div>
          <h1>Reading Quest</h1>
          <p>Welcome, {currentUser.realName || currentUser.name}.</p>
        </div>
      </div>

      <BetaDisclaimer />

      <SetupGuide
        title="Set Up Your Family Reading Hub"
        description="These steps help parents move from account setup to child safety, quiz review, prizes, and reading alongside the family."
        steps={parentSetupSteps}
      />

      <section className="home-section summary-section" aria-labelledby="parent-summary-heading">
        <h2 id="parent-summary-heading">Today</h2>
        <div className="hero-stats">
          <div className="stat-tile">
            <span>Available points</span>
            <strong>{getSpendablePoints(currentUser)}</strong>
          </div>
          <div className="stat-tile">
            <span>Lifetime earned</span>
            <strong>{getLifetimePoints(currentUser)}</strong>
          </div>
          <div className="stat-tile">
            <span>Adult rank</span>
            <strong>{currentRank ? `#${currentRank}` : "--"}</strong>
          </div>
          <div className="stat-tile">
            <span>Verified children</span>
            <strong>{children.length}</strong>
          </div>
        </div>
        <Link href="/quiz">
          <button type="button" className="primary-action">Take a Quiz</button>
        </Link>
      </section>

      {children.length > 0 ? (
        <section className="home-section" aria-labelledby="child-reports-heading">
          <h2 id="child-reports-heading">Child Reading Reports</h2>
          <div className="compact-list">
            {children.map((child) => {
              const controls = { ...defaultParentControls, ...(child.parentControls ?? {}) };
              const latestQuizzes = child.quizzes.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3);
              return (
                <div key={child.id} className="child-report-card">
                  <div className="section-header-row">
                    <div>
                      <h3>{child.name}</h3>
                      <p>{getLifetimePoints(child)} lifetime points - {child.readingLogs?.length ?? 0} reading logs</p>
                    </div>
                    <span className="badge-pill">{child.badges?.length ?? 0} badges</span>
                  </div>
                  <div className="responsive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Book</th>
                          <th>Score</th>
                          <th>Earned</th>
                          <th>Missed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latestQuizzes.map((quiz) => (
                          <tr key={`${child.id}-${quiz.bookTitle}-${quiz.date}`}>
                            <td>{quiz.bookTitle}</td>
                            <td>{quiz.score} / {quiz.maxScore}</td>
                            <td>{quiz.earnedPoints ?? quiz.score}</td>
                            <td>{Math.max(0, quiz.maxScore - quiz.score)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {latestQuizzes.length === 0 ? <p>No quizzes yet.</p> : null}
                  <div className="parent-controls-grid">
                    <label className="setting-label">
                      <input type="checkbox" checked={controls.prizeApprovalRequired} onChange={(event) => updateChildControls(child, "prizeApprovalRequired", event.target.checked)} />
                      <span>Require prize approval</span>
                    </label>
                    <label className="setting-label">
                      <input type="checkbox" checked={controls.allowQuizRetakes} onChange={(event) => updateChildControls(child, "allowQuizRetakes", event.target.checked)} />
                      <span>Allow quiz retakes</span>
                    </label>
                    <label className="setting-label">
                      <input type="checkbox" checked={controls.requireAiQuizReview} onChange={(event) => updateChildControls(child, "requireAiQuizReview", event.target.checked)} />
                      <span>Review AI quizzes first</span>
                    </label>
                    <label className="setting-label">
                      <input
                        type="checkbox"
                        checked={betaConfig.locationLookupEnabled && controls.allowLocationLookup}
                        disabled={!betaConfig.locationLookupEnabled}
                        onChange={(event) => updateChildControls(child, "allowLocationLookup", event.target.checked)}
                      />
                      <span>Allow nearby libraries and bookstores</span>
                    </label>
                    {!betaConfig.locationLookupEnabled ? <p className="setting-description">Location lookup is visible but paused during private beta.</p> : null}
                    <div className="field">
                      <label htmlFor={`max-difficulty-${child.id}`}>Goal difficulty cap</label>
                      <select id={`max-difficulty-${child.id}`} value={controls.maxGoalDifficulty} onChange={(event) => updateChildControls(child, "maxGoalDifficulty", event.target.value)}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div className="field testing-level-field">
                      <label htmlFor={`testing-level-${child.id}`}>Testing level</label>
                      <select id={`testing-level-${child.id}`} value={controls.testingLevel} onChange={(event) => updateChildControls(child, "testingLevel", event.target.value)}>
                        {testingLevelOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <p className="setting-description">
                        {testingLevelOptions.find((option) => option.value === controls.testingLevel)?.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {parentMessage ? <div className="success-box">{parentMessage}</div> : null}
        </section>
      ) : null}

      <section className="home-section" aria-labelledby="parent-trust-heading">
        <div className="section-header-row">
          <div>
            <h2 id="parent-trust-heading">Parent Review Queue</h2>
            <p>Quiz questions reported as wrong, impossible, too hard, spoilers, or not from the book.</p>
          </div>
          <span className="badge-pill">{reports.length} active</span>
        </div>
        {reports.length > 0 ? (
          <div className="compact-list">
            {reports.slice(0, 5).map((report) => (
              <div key={report.id} className="review-queue-item">
                <div>
                  <strong>{report.bookTitle}</strong>
                  <p>{report.question}</p>
                  <small>
                    {report.profileName} reported: {report.reason.replace(/_/g, " ")}
                    {report.correctionPointsAwarded ? ` - ${report.correctionPoints ?? 0} correction points awarded` : ""}
                  </small>
                </div>
                <div className="button-row">
                  <button type="button" className="secondary" disabled={report.correctionPointsAwarded} onClick={() => resolveReport(report.id, "accepted")}>
                    {report.correctionPointsAwarded ? "Points awarded" : "Agree and award points"}
                  </button>
                  <button type="button" className="secondary" onClick={() => resolveReport(report.id, "dismissed")}>Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No active quiz reports.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="parent-progress-heading">
        <h2 id="parent-progress-heading">Points Journey</h2>
        {pointsProgressData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={pointsProgressData} margin={{ top: 20, right: 20, bottom: 40, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="eventNumber" label={{ value: "Event", position: "bottom", offset: 20 }} tickMargin={10} />
              <YAxis label={{ value: "Points", angle: -90, position: "left", offset: 0 }} tickMargin={10} />
              <Tooltip formatter={(value) => `${value} points`} />
              <Line type="monotone" name="Earned" dataKey="earned" stroke="var(--accent)" strokeWidth={3} dot={{ fill: "var(--accent)" }} />
              <Line type="monotone" name="Available" dataKey="available" stroke="var(--success)" strokeWidth={3} dot={{ fill: "var(--success)" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p>Take your first quiz to start your points graph.</p>
        )}
      </section>

      <section className="home-section" aria-labelledby="adult-leaderboard-heading">
        <div className="section-header-row">
          <div>
            <h2 id="adult-leaderboard-heading">Adult Leaderboard</h2>
            <p>Your rank among adult readers.</p>
          </div>
          <Link href="/leaderboards"><button type="button" className="secondary">View all</button></Link>
        </div>
        <div className="leaderboard-list compact-list">
          {adultLeaderboard.slice(0, 3).map((profile, index) => (
            <div key={profile.id} className={`leaderboard-item ${profile.id === currentUser.id ? "current-user" : ""}`}>
              <div className="rank">#{index + 1}</div>
              <div className="user-info">
                <div className="name">{profile.realName || profile.name}</div>
                <div className="stats">{getLifetimePoints(profile)} lifetime points</div>
              </div>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}
