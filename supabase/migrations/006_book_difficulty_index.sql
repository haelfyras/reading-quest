-- Stable Reading Quest book difficulty records.
-- Run this after 001-005.

create table if not exists public.book_difficulty_ratings (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  author text,
  isbn text,
  first_published_year integer,
  ai_base_score numeric(3,1) not null check (ai_base_score >= 1.0 and ai_base_score <= 9.9),
  current_score numeric(3,1) not null check (current_score >= 1.0 and current_score <= 9.9),
  book_level text not null check (book_level in ('beginner', 'intermediate', 'advanced')),
  scoring_factors jsonb not null default '{}',
  ai_model text,
  community_adjustment numeric(3,1) not null default 0 check (community_adjustment >= -1.0 and community_adjustment <= 1.0),
  completed_quiz_count integer not null default 0 check (completed_quiz_count >= 0),
  eligible_attempt_count integer not null default 0 check (eligible_attempt_count >= 0),
  eligible_accuracy_total numeric(8,3) not null default 0 check (eligible_accuracy_total >= 0),
  last_adjusted_attempt_count integer not null default 0 check (last_adjusted_attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quiz_results
add column if not exists book_difficulty_rating_id uuid references public.book_difficulty_ratings(id) on delete set null,
add column if not exists book_difficulty_score numeric(3,1) check (book_difficulty_score >= 1.0 and book_difficulty_score <= 9.9);

create index if not exists book_difficulty_ratings_level_score_idx
on public.book_difficulty_ratings(book_level, current_score);

create index if not exists quiz_results_book_difficulty_rating_idx
on public.quiz_results(book_difficulty_rating_id);

alter table public.book_difficulty_ratings enable row level security;

drop policy if exists "Book difficulty ratings are readable" on public.book_difficulty_ratings;
create policy "Book difficulty ratings are readable" on public.book_difficulty_ratings
for select using (true);
