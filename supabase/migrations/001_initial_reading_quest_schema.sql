-- Reading Quest Supabase foundation
-- Run this in Supabase SQL Editor for the first database setup.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  beta_local_id text unique,
  account_type text not null check (account_type in ('parent', 'child')),
  screen_name text not null,
  real_name text,
  email text,
  phone text,
  profile_code text unique,
  can_add_friends boolean not null default false,
  points integer not null default 0 check (points >= 0),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  learning_goal text,
  avatar_style text,
  badges text[] not null default '{}',
  favorite_books text[] not null default '{}',
  reading_now text[] not null default '{}',
  reading_preferences jsonb,
  book_access jsonb not null default '{}',
  parent_controls jsonb not null default '{
    "prizeApprovalRequired": true,
    "allowQuizRetakes": true,
    "maxGoalDifficulty": "hard",
    "requireAiQuizReview": false,
    "allowLocationLookup": false,
    "testingLevel": "basic_recollection"
  }',
  leaderboard_private boolean not null default false,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'ad_free', 'plus')),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parent_child_links (
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'verified' check (status in ('pending', 'verified', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  primary key (parent_profile_id, child_profile_id),
  check (parent_profile_id <> child_profile_id)
);

create table if not exists public.parent_verification_requests (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  child_profile_id uuid references public.profiles(id) on delete cascade,
  child_screen_name text not null,
  child_first_name text not null,
  status text not null default 'child_pending' check (status in ('child_pending', 'code_pending', 'verified', 'expired', 'rejected')),
  code_hash text,
  parent_code_entered boolean not null default false,
  child_code_entered boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  book_level text not null check (book_level in ('beginner', 'intermediate', 'advanced')),
  learning_goal text not null,
  score integer not null check (score >= 0),
  max_score integer not null check (max_score > 0),
  earned_points integer not null default 0 check (earned_points >= 0),
  quiz_payload jsonb,
  selected_answers jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_issue_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question text not null,
  choices jsonb not null default '[]',
  answer_index integer not null,
  selected_choice integer not null,
  question_value integer,
  correction_points_awarded boolean not null default false,
  correction_points integer,
  reason text not null check (reason in ('impossible', 'wrong_answer', 'too_hard', 'spoiler', 'not_from_book')),
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed')),
  parent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  book_title text not null,
  minutes integer not null default 0 check (minutes >= 0),
  chapters_finished integer not null default 0 check (chapters_finished >= 0),
  access_type text not null default 'owned' check (access_type in ('owned', 'library', 'audiobook', 'ebook', 'read_aloud', 'borrowed')),
  assisted boolean not null default false,
  effort_points integer not null default 0 check (effort_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid references public.profiles(id) on delete cascade,
  child_profile_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  points integer not null check (points >= 0),
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prize_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prize_id uuid references public.prizes(id) on delete set null,
  prize_name text not null,
  points_spent integer not null check (points_spent >= 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'redeemed', 'dismissed')),
  claimed_count integer not null default 1 check (claimed_count >= 0),
  parent_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prize_add_requests (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.profiles(id) on delete cascade,
  parent_profile_id uuid references public.profiles(id) on delete cascade,
  prize_name text not null,
  suggested_points integer check (suggested_points >= 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  profile_name text not null,
  book_title text not null,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.friendships (
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  friend_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'verified' check (status in ('pending', 'verified', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (requester_profile_id, friend_profile_id),
  check (requester_profile_id <> friend_profile_id)
);

create table if not exists public.friend_book_suggestions (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  book_title text not null,
  note text,
  status text not null default 'sent' check (status in ('sent', 'seen', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.reading_challenges (
  id uuid primary key default gen_random_uuid(),
  book_title text not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  book_level text not null check (book_level in ('beginner', 'intermediate', 'advanced')),
  quiz_title text not null,
  quiz_description text,
  questions jsonb not null,
  from_profile_id uuid not null references public.profiles(id) on delete cascade,
  to_profile_id uuid not null references public.profiles(id) on delete cascade,
  initiator_score integer not null,
  initiator_max_score integer not null,
  initiator_answers jsonb not null default '[]',
  responder_score integer,
  responder_max_score integer,
  responder_answers jsonb,
  status text not null default 'pending' check (status in ('pending', 'completed', 'dismissed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  profile_name text,
  page text,
  category text,
  message text not null,
  sentiment text,
  created_at timestamptz not null default now()
);

create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  page text not null,
  event_name text not null default 'page_view',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_profile_code_idx on public.profiles(profile_code);
create index if not exists parent_child_links_parent_idx on public.parent_child_links(parent_profile_id);
create index if not exists parent_child_links_child_idx on public.parent_child_links(child_profile_id);
create index if not exists quiz_results_profile_created_idx on public.quiz_results(profile_id, created_at desc);
create index if not exists quiz_results_book_idx on public.quiz_results(lower(book_title));
create index if not exists quiz_issue_reports_status_idx on public.quiz_issue_reports(status, created_at desc);
create index if not exists reading_logs_profile_created_idx on public.reading_logs(profile_id, created_at desc);
create index if not exists prize_redemptions_profile_created_idx on public.prize_redemptions(profile_id, created_at desc);
create index if not exists telemetry_events_page_created_idx on public.telemetry_events(page, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_parent_verification_requests_updated_at on public.parent_verification_requests;
create trigger touch_parent_verification_requests_updated_at
before update on public.parent_verification_requests
for each row execute function public.touch_updated_at();

drop trigger if exists touch_quiz_issue_reports_updated_at on public.quiz_issue_reports;
create trigger touch_quiz_issue_reports_updated_at
before update on public.quiz_issue_reports
for each row execute function public.touch_updated_at();

drop trigger if exists touch_prizes_updated_at on public.prizes;
create trigger touch_prizes_updated_at
before update on public.prizes
for each row execute function public.touch_updated_at();

drop trigger if exists touch_prize_redemptions_updated_at on public.prize_redemptions;
create trigger touch_prize_redemptions_updated_at
before update on public.prize_redemptions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_prize_add_requests_updated_at on public.prize_add_requests;
create trigger touch_prize_add_requests_updated_at
before update on public.prize_add_requests
for each row execute function public.touch_updated_at();

create or replace function public.is_profile_owner(profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = profile_id and auth_user_id = auth.uid()
  );
$$;

create or replace function public.can_access_profile(profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_profile_owner(profile_id)
    or exists (
      select 1
      from public.parent_child_links pcl
      join public.profiles parent on parent.id = pcl.parent_profile_id
      where pcl.child_profile_id = profile_id
        and pcl.status = 'verified'
        and parent.auth_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.parent_child_links pcl
      join public.profiles child on child.id = pcl.child_profile_id
      where pcl.parent_profile_id = profile_id
        and pcl.status = 'verified'
        and child.auth_user_id = auth.uid()
    );
$$;

alter table public.profiles enable row level security;
alter table public.parent_child_links enable row level security;
alter table public.parent_verification_requests enable row level security;
alter table public.quiz_results enable row level security;
alter table public.quiz_issue_reports enable row level security;
alter table public.reading_logs enable row level security;
alter table public.prizes enable row level security;
alter table public.prize_redemptions enable row level security;
alter table public.prize_add_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_book_suggestions enable row level security;
alter table public.reading_challenges enable row level security;
alter table public.feedback_entries enable row level security;
alter table public.telemetry_events enable row level security;

create policy "Profiles are visible to owners and verified family" on public.profiles
for select using (public.can_access_profile(id));

create policy "Parents can create their own profile" on public.profiles
for insert with check (auth.uid() is not null and (auth_user_id = auth.uid() or auth_user_id is null));

create policy "Owners and verified parents can update profiles" on public.profiles
for update using (public.can_access_profile(id))
with check (public.can_access_profile(id));

create policy "Family links visible to linked family" on public.parent_child_links
for select using (public.can_access_profile(parent_profile_id) or public.can_access_profile(child_profile_id));

create policy "Parents can manage family links" on public.parent_child_links
for all using (public.is_profile_owner(parent_profile_id))
with check (public.is_profile_owner(parent_profile_id));

create policy "Parent verification visible to family" on public.parent_verification_requests
for select using (public.can_access_profile(parent_profile_id) or public.can_access_profile(child_profile_id));

create policy "Parents can create verification requests" on public.parent_verification_requests
for insert with check (public.is_profile_owner(parent_profile_id));

create policy "Family can update verification requests" on public.parent_verification_requests
for update using (public.can_access_profile(parent_profile_id) or public.can_access_profile(child_profile_id))
with check (public.can_access_profile(parent_profile_id) or public.can_access_profile(child_profile_id));

create policy "Quiz results visible to profile family" on public.quiz_results
for select using (public.can_access_profile(profile_id));

create policy "Quiz results insertable by profile family" on public.quiz_results
for insert with check (public.can_access_profile(profile_id));

create policy "Quiz reports visible to profile family" on public.quiz_issue_reports
for select using (public.can_access_profile(profile_id));

create policy "Quiz reports insertable by profile family" on public.quiz_issue_reports
for insert with check (public.can_access_profile(profile_id));

create policy "Quiz reports updatable by profile family" on public.quiz_issue_reports
for update using (public.can_access_profile(profile_id))
with check (public.can_access_profile(profile_id));

create policy "Reading logs visible to profile family" on public.reading_logs
for select using (public.can_access_profile(profile_id));

create policy "Reading logs insertable by profile family" on public.reading_logs
for insert with check (public.can_access_profile(profile_id));

create policy "Prizes visible to assigned family" on public.prizes
for select using (
  parent_profile_id is null
  or public.can_access_profile(parent_profile_id)
  or public.can_access_profile(child_profile_id)
);

create policy "Parents can manage prizes" on public.prizes
for all using (parent_profile_id is null or public.is_profile_owner(parent_profile_id))
with check (parent_profile_id is null or public.is_profile_owner(parent_profile_id));

create policy "Prize redemptions visible to profile family" on public.prize_redemptions
for select using (public.can_access_profile(profile_id));

create policy "Prize redemptions insertable by profile family" on public.prize_redemptions
for insert with check (public.can_access_profile(profile_id));

create policy "Prize redemptions updatable by profile family" on public.prize_redemptions
for update using (public.can_access_profile(profile_id))
with check (public.can_access_profile(profile_id));

create policy "Prize requests visible to family" on public.prize_add_requests
for select using (public.can_access_profile(child_profile_id) or public.can_access_profile(parent_profile_id));

create policy "Prize requests insertable by child family" on public.prize_add_requests
for insert with check (public.can_access_profile(child_profile_id));

create policy "Prize requests updatable by family" on public.prize_add_requests
for update using (public.can_access_profile(child_profile_id) or public.can_access_profile(parent_profile_id))
with check (public.can_access_profile(child_profile_id) or public.can_access_profile(parent_profile_id));

create policy "Reviews are readable by authenticated users" on public.reviews
for select using (auth.uid() is not null);

create policy "Reviews insertable by profile family" on public.reviews
for insert with check (public.can_access_profile(profile_id));

create policy "Friendships visible to members" on public.friendships
for select using (public.can_access_profile(requester_profile_id) or public.can_access_profile(friend_profile_id));

create policy "Friendships insertable by requester" on public.friendships
for insert with check (public.can_access_profile(requester_profile_id));

create policy "Friend suggestions visible to sender or receiver" on public.friend_book_suggestions
for select using (public.can_access_profile(from_profile_id) or public.can_access_profile(to_profile_id));

create policy "Friend suggestions insertable by sender" on public.friend_book_suggestions
for insert with check (public.can_access_profile(from_profile_id));

create policy "Challenges visible to participants" on public.reading_challenges
for select using (public.can_access_profile(from_profile_id) or public.can_access_profile(to_profile_id));

create policy "Challenges insertable by initiator" on public.reading_challenges
for insert with check (public.can_access_profile(from_profile_id));

create policy "Challenges updatable by participants" on public.reading_challenges
for update using (public.can_access_profile(from_profile_id) or public.can_access_profile(to_profile_id))
with check (public.can_access_profile(from_profile_id) or public.can_access_profile(to_profile_id));

create policy "Feedback insertable by users" on public.feedback_entries
for insert with check (profile_id is null or public.can_access_profile(profile_id));

create policy "Feedback visible to submitting family" on public.feedback_entries
for select using (profile_id is not null and public.can_access_profile(profile_id));

create policy "Telemetry insertable by users" on public.telemetry_events
for insert with check (profile_id is null or public.can_access_profile(profile_id));

create policy "Telemetry visible to submitting family" on public.telemetry_events
for select using (profile_id is not null and public.can_access_profile(profile_id));
