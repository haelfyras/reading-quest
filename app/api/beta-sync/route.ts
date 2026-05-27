import { NextResponse } from "next/server";
import { createServiceSupabaseClient, isServiceSupabaseConfigured } from "../../../lib/supabase/server";

const allowedKinds = new Set([
  "profile",
  "quiz_result",
  "quiz_issue_report",
  "quiz_issue_report_update",
  "reading_log",
  "prize_redemption",
  "prize_add_request",
  "prize_add_request_update",
  "reading_challenge",
  "reading_challenge_update",
  "friend_book_suggestion",
  "review",
  "feedback",
  "telemetry",
]);

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function cleanReadingPath(value: unknown): "explorer" | "genre_adventurer" | "skill_builder" {
  const candidate = String(value);
  if (candidate === "genre_adventurer" || candidate === "skill_builder") {
    return candidate;
  }
  return "explorer";
}

function clampDifficultyAdjustment(value: number) {
  return Math.min(1, Math.max(-1, Math.round(value * 10) / 10));
}

function clampDifficultyScore(value: number) {
  return Math.min(9.9, Math.max(1, Math.round(value * 10) / 10));
}

async function updateBookDifficultyStats(supabase: any, payload: Record<string, any>) {
  const ratingId = cleanString(payload.bookDifficultyRatingId);
  if (!isUuid(ratingId)) return;

  const score = Math.max(0, Number(payload.score ?? 0));
  const maxScore = Math.max(1, Number(payload.maxScore ?? 1));
  const accuracy = Math.min(1, Math.max(0, score / maxScore));
  const eligible = accuracy >= 0.1;

  const { data: rating } = await supabase
    .from("book_difficulty_ratings")
    .select("ai_base_score,community_adjustment,completed_quiz_count,eligible_attempt_count,eligible_accuracy_total,last_adjusted_attempt_count")
    .eq("id", ratingId)
    .maybeSingle();

  if (!rating) return;

  const completedCount = Number(rating.completed_quiz_count ?? 0) + 1;
  const eligibleCount = Number(rating.eligible_attempt_count ?? 0) + (eligible ? 1 : 0);
  const accuracyTotal = Number(rating.eligible_accuracy_total ?? 0) + (eligible ? accuracy : 0);
  const lastAdjusted = Number(rating.last_adjusted_attempt_count ?? 0);
  const updates: Record<string, unknown> = {
    completed_quiz_count: completedCount,
    eligible_attempt_count: eligibleCount,
    eligible_accuracy_total: accuracyTotal,
    updated_at: new Date().toISOString(),
  };

  if (completedCount >= 25 && eligibleCount - lastAdjusted >= 10 && eligibleCount > 0) {
    const averageAccuracy = accuracyTotal / eligibleCount;
    const delta = averageAccuracy >= 0.9 ? -0.1 : averageAccuracy <= 0.45 ? 0.1 : 0;
    const nextAdjustment = clampDifficultyAdjustment(Number(rating.community_adjustment ?? 0) + delta);
    updates.community_adjustment = nextAdjustment;
    updates.current_score = clampDifficultyScore(Number(rating.ai_base_score ?? 5) + nextAdjustment);
    updates.last_adjusted_attempt_count = eligibleCount;
  }

  await supabase.from("book_difficulty_ratings").update(updates).eq("id", ratingId);
}

async function updateQuestionPoolStats(supabase: any, payload: Record<string, any>) {
  const quizPayload = payload.quizPayload && typeof payload.quizPayload === "object"
    ? payload.quizPayload as Record<string, any>
    : null;
  const questions = Array.isArray(quizPayload?.questions) ? quizPayload.questions : [];
  const selectedAnswers = Array.isArray(payload.selectedAnswers) ? payload.selectedAnswers : [];
  if (questions.length === 0 || selectedAnswers.length === 0) return;

  await Promise.allSettled(questions.map(async (question: any, index: number) => {
    const questionId = cleanString(question.poolQuestionId);
    if (!isUuid(questionId)) return;

    const selected = Number(selectedAnswers[index]);
    const answerIndex = Number(question.answerIndex);
    const { data } = await supabase
      .from("book_question_pool")
      .select("correct_count,incorrect_count,skipped_count")
      .eq("id", questionId)
      .maybeSingle();

    if (!data) return;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (selected < 0) {
      updates.skipped_count = Number(data.skipped_count ?? 0) + 1;
    } else if (selected === answerIndex) {
      updates.correct_count = Number(data.correct_count ?? 0) + 1;
    } else {
      updates.incorrect_count = Number(data.incorrect_count ?? 0) + 1;
    }

    await supabase.from("book_question_pool").update(updates).eq("id", questionId);
  }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const kind = cleanString(body.kind);
  const payload = body.payload && typeof body.payload === "object" ? body.payload as Record<string, any> : {};

  if (!allowedKinds.has(kind)) {
    return NextResponse.json({ error: "Unsupported sync event." }, { status: 400 });
  }

  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Supabase service sync is not configured locally." });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const adminSupabase = supabase as any;

    if (kind === "profile") {
      if (!isUuid(payload.id)) {
        return NextResponse.json({ skipped: true });
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          screen_name: cleanString(payload.name, "Reader"),
          real_name: payload.isParent ? cleanString(payload.realName, cleanString(payload.name, "Parent")) : null,
          email: payload.isParent ? cleanString(payload.email) || null : null,
          phone: payload.isParent ? cleanString(payload.phone) || null : null,
          can_add_friends: Boolean(payload.canAddFriends),
          points: Math.max(0, Math.round(Number(payload.points ?? 0))),
          lifetime_points: Math.max(0, Math.round(Number(payload.lifetimePoints ?? payload.points ?? 0))),
          learning_goal: cleanString(payload.learningGoal) || null,
          avatar_style: cleanString(payload.avatarStyle) || null,
          badges: Array.isArray(payload.badges) ? payload.badges.filter((item: unknown) => typeof item === "string") : [],
          favorite_books: Array.isArray(payload.favoriteBooks) ? payload.favoriteBooks.filter((item: unknown) => typeof item === "string") : [],
          reading_now: Array.isArray(payload.readingNow) ? payload.readingNow.filter((item: unknown) => typeof item === "string") : [],
          reading_preferences: payload.readingPreferences ?? null,
          reading_path: cleanReadingPath(payload.readingPath),
          book_access: payload.bookAccess ?? {},
          parent_controls: payload.parentControls ?? {},
          leaderboard_private: Boolean(payload.leaderboardPrivate),
          subscription_tier: ["free", "ad_free", "plus"].includes(payload.subscriptionTier) ? payload.subscriptionTier : "free",
          verified: Boolean(payload.verified),
        })
        .eq("id", payload.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "quiz_result") {
      if (!isUuid(payload.profileId)) {
        return NextResponse.json({ skipped: true });
      }

      const { error } = await supabase.from("quiz_results").insert({
        profile_id: payload.profileId,
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        difficulty: payload.difficulty,
        book_level: payload.bookLevel,
        book_difficulty_rating_id: isUuid(payload.bookDifficultyRatingId) ? payload.bookDifficultyRatingId : null,
        book_difficulty_score: Number.isFinite(Number(payload.bookDifficultyScore))
          ? Math.round(Number(payload.bookDifficultyScore) * 10) / 10
          : null,
        learning_goal: cleanString(payload.learningGoal, "basic_recollection"),
        score: Math.max(0, Math.round(Number(payload.score ?? 0))),
        max_score: Math.max(1, Math.round(Number(payload.maxScore ?? 1))),
        earned_points: Math.max(0, Math.round(Number(payload.earnedPoints ?? 0))),
        quiz_payload: payload.quizPayload ?? null,
        selected_answers: payload.selectedAnswers ?? null,
        created_at: cleanString(payload.date) || new Date().toISOString(),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await updateBookDifficultyStats(supabase, payload);
      await updateQuestionPoolStats(supabase, payload);
    }

    if (kind === "quiz_issue_report") {
      if (!isUuid(payload.profileId)) {
        return NextResponse.json({ skipped: true });
      }

      const insertPayload: Record<string, any> = {
        profile_id: payload.profileId,
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        difficulty: payload.difficulty,
        question: cleanString(payload.question, "Question unavailable"),
        choices: Array.isArray(payload.choices) ? payload.choices : [],
        answer_index: Math.round(Number(payload.answerIndex ?? 0)),
        selected_choice: Math.round(Number(payload.selectedChoice ?? -1)),
        pool_question_id: isUuid(payload.poolQuestionId) ? payload.poolQuestionId : null,
        question_value: payload.questionValue ?? null,
        correction_points_awarded: Boolean(payload.correctionPointsAwarded),
        correction_points: payload.correctionPoints ?? null,
        reason: payload.reason,
        status: payload.status ?? "open",
        parent_note: payload.parentNote ?? null,
        created_at: cleanString(payload.date) || new Date().toISOString(),
      };
      if (isUuid(payload.id)) {
        insertPayload.id = payload.id;
      }

      const { error } = await supabase.from("quiz_issue_reports").upsert(insertPayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (isUuid(insertPayload.pool_question_id)) {
        const { data: pooledQuestion } = await supabase
          .from("book_question_pool")
          .select("report_count")
          .eq("id", insertPayload.pool_question_id)
          .maybeSingle();

        if (pooledQuestion) {
          await supabase
            .from("book_question_pool")
            .update({
              report_count: Number(pooledQuestion.report_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", insertPayload.pool_question_id);
        }
      }
    }

    if (kind === "quiz_issue_report_update") {
      if (!isUuid(payload.id)) {
        return NextResponse.json({ skipped: true });
      }

      const { error } = await supabase
        .from("quiz_issue_reports")
        .update({
          status: payload.status,
          parent_note: payload.parentNote ?? null,
          correction_points_awarded: Boolean(payload.correctionPointsAwarded),
          correction_points: payload.correctionPoints ?? null,
        })
        .eq("id", payload.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "reading_log") {
      if (!isUuid(payload.profileId)) {
        return NextResponse.json({ skipped: true });
      }

      const { error } = await adminSupabase.from("reading_logs").insert({
        profile_id: payload.profileId,
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        minutes: Math.max(0, Math.round(Number(payload.minutes ?? 0))),
        chapters_finished: Math.max(0, Math.round(Number(payload.chaptersFinished ?? 0))),
        access_type: cleanString(payload.accessType, "owned"),
        assisted: Boolean(payload.assisted),
        effort_points: Math.max(0, Math.round(Number(payload.effortPoints ?? 0))),
        created_at: cleanString(payload.date) || new Date().toISOString(),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "prize_redemption") {
      if (!isUuid(payload.profileId)) {
        return NextResponse.json({ skipped: true });
      }

      const insertPayload: Record<string, any> = {
        profile_id: payload.profileId,
        prize_name: cleanString(payload.prizeName, "Prize"),
        points_spent: Math.max(0, Math.round(Number(payload.pointsSpent ?? 0))),
        status: "requested",
        created_at: cleanString(payload.date) || new Date().toISOString(),
      };
      if (isUuid(payload.id)) {
        insertPayload.id = payload.id;
      }
      if (isUuid(payload.prizeId)) {
        insertPayload.prize_id = payload.prizeId;
      }

      const { error } = await adminSupabase.from("prize_redemptions").upsert(insertPayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "prize_add_request") {
      if (!isUuid(payload.childId)) {
        return NextResponse.json({ skipped: true });
      }

      const insertPayload: Record<string, any> = {
        child_profile_id: payload.childId,
        prize_name: cleanString(payload.name, "Prize idea"),
        description: cleanString(payload.description) || null,
        suggested_points: Math.max(10, Math.round(Number(payload.pointsRequired ?? 10))),
        status: "requested",
        created_at: cleanString(payload.requestedAt) || new Date().toISOString(),
      };
      if (isUuid(payload.id)) {
        insertPayload.id = payload.id;
      }

      const { error } = await adminSupabase.from("prize_add_requests").upsert(insertPayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "prize_add_request_update") {
      if (!isUuid(payload.id)) {
        return NextResponse.json({ skipped: true });
      }

      const status = payload.status === "added" ? "approved" : payload.status === "dismissed" ? "dismissed" : "requested";
      const { error } = await adminSupabase
        .from("prize_add_requests")
        .update({ status })
        .eq("id", payload.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "reading_challenge" || kind === "reading_challenge_update") {
      if (!isUuid(payload.id) || !isUuid(payload.fromProfileId) || !isUuid(payload.toProfileId)) {
        return NextResponse.json({ skipped: true });
      }

      const challengePayload = {
        id: payload.id,
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        difficulty: payload.difficulty,
        book_level: payload.bookLevel,
        quiz_title: cleanString(payload.quizTitle, "Friendly challenge"),
        quiz_description: cleanString(payload.quizDescription),
        questions: Array.isArray(payload.questions) ? payload.questions : [],
        from_profile_id: payload.fromProfileId,
        to_profile_id: payload.toProfileId,
        initiator_score: Math.max(0, Math.round(Number(payload.initiatorScore ?? 0))),
        initiator_max_score: Math.max(0, Math.round(Number(payload.initiatorMaxScore ?? 0))),
        initiator_answers: Array.isArray(payload.initiatorAnswers) ? payload.initiatorAnswers : [],
        responder_score: payload.responderScore ?? null,
        responder_max_score: payload.responderMaxScore ?? null,
        responder_answers: payload.responderAnswers ?? null,
        status: payload.status === "completed" ? "completed" : "pending",
        created_at: cleanString(payload.createdAt) || new Date().toISOString(),
        completed_at: cleanString(payload.completedAt) || null,
      };

      const { error } = await adminSupabase.from("reading_challenges").upsert(challengePayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "friend_book_suggestion") {
      if (!isUuid(payload.fromProfileId) || !isUuid(payload.toProfileId)) {
        return NextResponse.json({ skipped: true });
      }

      const insertPayload: Record<string, any> = {
        from_profile_id: payload.fromProfileId,
        to_profile_id: payload.toProfileId,
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        note: cleanString(payload.note) || null,
        status: "sent",
        created_at: cleanString(payload.date) || new Date().toISOString(),
      };
      if (isUuid(payload.id)) {
        insertPayload.id = payload.id;
      }

      const { error } = await adminSupabase.from("friend_book_suggestions").upsert(insertPayload);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "review") {
      if (!isUuid(payload.profileId)) {
        return NextResponse.json({ skipped: true });
      }

      const { error } = await adminSupabase.from("reviews").insert({
        profile_id: payload.profileId,
        profile_name: cleanString(payload.profileName, "Reader"),
        book_title: cleanString(payload.bookTitle, "Unknown book"),
        rating: Math.max(1, Math.min(5, Math.round(Number(payload.rating ?? 1)))),
        review_text: cleanString(payload.reviewText) || null,
        created_at: cleanString(payload.date) || new Date().toISOString(),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "feedback") {
      const { error } = await supabase.from("feedback_entries").insert({
        profile_id: isUuid(payload.profileId) ? payload.profileId : null,
        profile_name: cleanString(payload.profileName) || null,
        page: cleanString(payload.page) || null,
        category: cleanString(payload.category, "General feedback"),
        message: cleanString(payload.message, "No message provided."),
        created_at: cleanString(payload.date) || new Date().toISOString(),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (kind === "telemetry") {
      const { error } = await adminSupabase.from("telemetry_events").insert({
        profile_id: isUuid(payload.profileId) ? payload.profileId : null,
        page: cleanString(payload.source, cleanString(payload.page, "unknown")),
        event_name: cleanString(payload.type, "page_view"),
        metadata: {
          message: cleanString(payload.message),
          status: payload.status ?? null,
        },
        created_at: cleanString(payload.date) || new Date().toISOString(),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync beta data." },
      { status: 500 },
    );
  }
}
