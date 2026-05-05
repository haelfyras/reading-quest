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
      };
      quiz_results: {
        Row: {
          id: string;
          profile_id: string;
          book_title: string;
          difficulty: "easy" | "medium" | "hard";
          book_level: "beginner" | "intermediate" | "advanced";
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
      };
    };
  };
};
