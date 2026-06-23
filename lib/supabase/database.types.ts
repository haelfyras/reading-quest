export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          beta_local_id: string | null;
          account_type: "parent" | "child";
          screen_name: string;
          real_name: string | null;
          email: string | null;
          phone: string | null;
          child_password_hash: string | null;
          profile_code: string | null;
          can_add_friends: boolean;
          points: number;
          lifetime_points: number;
          learning_goal: string | null;
          avatar_style: string | null;
          badges: string[];
          favorite_books: string[];
          reading_now: string[];
          reading_preferences: Json | null;
          reading_path: "explorer" | "genre_adventurer" | "skill_builder";
          book_access: Json;
          parent_controls: Json;
          leaderboard_private: boolean;
          subscription_tier: "free" | "ad_free" | "plus";
          verified: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          account_type: "parent" | "child";
          screen_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      parent_child_links: {
        Row: {
          parent_profile_id: string;
          child_profile_id: string;
          status: "pending" | "verified" | "rejected" | "expired";
          created_at: string;
          verified_at: string | null;
        };
        Insert: Database["public"]["Tables"]["parent_child_links"]["Row"];
        Update: Partial<Database["public"]["Tables"]["parent_child_links"]["Row"]>;
        Relationships: [];
      };
      book_difficulty_ratings: {
        Row: {
          id: string;
          canonical_key: string;
          title: string;
          author: string | null;
          isbn: string | null;
          first_published_year: number | null;
          ai_base_score: number;
          current_score: number;
          book_level: "beginner" | "intermediate" | "advanced";
          scoring_factors: Json;
          ai_model: string | null;
          community_adjustment: number;
          completed_quiz_count: number;
          eligible_attempt_count: number;
          eligible_accuracy_total: number;
          last_adjusted_attempt_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["book_difficulty_ratings"]["Row"]> & {
          canonical_key: string;
          title: string;
          ai_base_score: number;
          current_score: number;
          book_level: "beginner" | "intermediate" | "advanced";
        };
        Update: Partial<Database["public"]["Tables"]["book_difficulty_ratings"]["Row"]>;
        Relationships: [];
      };
      quiz_results: {
        Row: {
          id: string;
          profile_id: string;
          book_title: string;
          difficulty: "easy" | "medium" | "hard";
          book_level: "beginner" | "intermediate" | "advanced";
          book_difficulty_rating_id: string | null;
          book_difficulty_score: number | null;
          learning_goal: string;
          score: number;
          max_score: number;
          earned_points: number;
          quiz_payload: Json | null;
          selected_answers: Json | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_results"]["Row"]> & {
          profile_id: string;
          book_title: string;
          difficulty: "easy" | "medium" | "hard";
          book_level: "beginner" | "intermediate" | "advanced";
          learning_goal: string;
          score: number;
          max_score: number;
        };
        Update: Partial<Database["public"]["Tables"]["quiz_results"]["Row"]>;
        Relationships: [];
      };
      book_question_pool: {
        Row: {
          id: string;
          book_difficulty_rating_id: string | null;
          canonical_key: string;
          book_title: string;
          author: string | null;
          quiz_difficulty: "easy" | "medium" | "hard";
          question_type: string;
          book_level: "beginner" | "intermediate" | "advanced";
          question_key: string;
          question: string;
          choices: Json;
          answer_index: number;
          answer_text: string | null;
          explanation: string | null;
          quality_score: number;
          question_version: number;
          times_used: number;
          correct_count: number;
          incorrect_count: number;
          skipped_count: number;
          report_count: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["book_question_pool"]["Row"]> & {
          canonical_key: string;
          book_title: string;
          quiz_difficulty: "easy" | "medium" | "hard";
          question_type: string;
          book_level: "beginner" | "intermediate" | "advanced";
          question_key: string;
          question: string;
          choices: Json;
          answer_index: number;
        };
        Update: Partial<Database["public"]["Tables"]["book_question_pool"]["Row"]>;
        Relationships: [];
      };
      book_fact_sheets: {
        Row: {
          id: string;
          canonical_key: string;
          title: string;
          author: string | null;
          isbn: string | null;
          fact_version: number;
          status: "ready" | "low_confidence" | "needs_review";
          source_confidence: number;
          facts: Json;
          source_names: string[];
          source_urls: string[];
          source_notes: string[];
          ai_model: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["book_fact_sheets"]["Row"]> & {
          canonical_key: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["book_fact_sheets"]["Row"]>;
        Relationships: [];
      };
      quiz_issue_reports: {
        Row: {
          id: string;
          profile_id: string;
          book_title: string;
          difficulty: "easy" | "medium" | "hard";
          question: string;
          choices: Json;
          answer_index: number;
          selected_choice: number;
          pool_question_id: string | null;
          question_value: number | null;
          correction_points_awarded: boolean;
          correction_points: number | null;
          reason: "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book";
          status: "open" | "accepted" | "dismissed";
          parent_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["quiz_issue_reports"]["Row"]> & {
          profile_id: string;
          book_title: string;
          difficulty: "easy" | "medium" | "hard";
          question: string;
          answer_index: number;
          selected_choice: number;
          reason: "impossible" | "wrong_answer" | "too_hard" | "spoiler" | "not_from_book";
        };
        Update: Partial<Database["public"]["Tables"]["quiz_issue_reports"]["Row"]>;
        Relationships: [];
      };
      feedback_entries: {
        Row: {
          id: string;
          profile_id: string | null;
          profile_name: string | null;
          page: string | null;
          category: string | null;
          message: string;
          sentiment: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["feedback_entries"]["Row"]> & {
          message: string;
        };
        Update: Partial<Database["public"]["Tables"]["feedback_entries"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
