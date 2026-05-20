-- Curated, reusable quiz question pool.
-- Run this after 001-006.

create table if not exists public.book_question_pool (
  id uuid primary key default gen_random_uuid(),
  book_difficulty_rating_id uuid references public.book_difficulty_ratings(id) on delete set null,
  canonical_key text not null,
  book_title text not null,
  author text,
  quiz_difficulty text not null check (quiz_difficulty in ('easy', 'medium', 'hard')),
  question_type text not null check (question_type in (
    'character',
    'setting',
    'object',
    'plot_event',
    'simple_motive',
    'character_motivation',
    'cause_effect',
    'problem_solution',
    'relationship',
    'prediction_inference',
    'theme',
    'symbolism',
    'character_arc',
    'moral_analysis',
    'tone_author_intent',
    'cross_story_connection'
  )),
  book_level text not null check (book_level in ('beginner', 'intermediate', 'advanced')),
  question_key text not null,
  question text not null,
  choices jsonb not null,
  answer_index integer not null check (answer_index >= 0 and answer_index <= 3),
  answer_text text,
  explanation text,
  quality_score numeric(4,2) not null default 0.85 check (quality_score >= 0 and quality_score <= 1),
  question_version integer not null default 1 check (question_version >= 1),
  times_used integer not null default 0 check (times_used >= 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  incorrect_count integer not null default 0 check (incorrect_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  report_count integer not null default 0 check (report_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists book_question_pool_unique_question_idx
on public.book_question_pool(canonical_key, quiz_difficulty, question_type, question_key, question_version);

create index if not exists book_question_pool_select_idx
on public.book_question_pool(canonical_key, quiz_difficulty, active, quality_score desc, times_used asc);

alter table public.book_question_pool enable row level security;

drop policy if exists "Question pool is readable" on public.book_question_pool;
create policy "Question pool is readable" on public.book_question_pool
for select using (true);
