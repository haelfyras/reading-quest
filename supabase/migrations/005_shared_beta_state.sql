-- Shared beta state used by cross-device profiles, prize menus, and reading paths.
-- Run this after 001-004.

alter table public.profiles
add column if not exists reading_path text not null default 'explorer'
check (reading_path in ('explorer', 'genre_adventurer', 'skill_builder'));

alter table public.prizes
add column if not exists beta_local_id text,
add column if not exists description text,
add column if not exists icon text;

create index if not exists prizes_child_active_idx
on public.prizes(child_profile_id, active, points);

create unique index if not exists prizes_child_beta_local_unique_idx
on public.prizes(child_profile_id, beta_local_id)
where beta_local_id is not null;

create index if not exists prize_add_requests_child_status_idx
on public.prize_add_requests(child_profile_id, status, created_at desc);

alter table public.prize_add_requests
add column if not exists description text;

create index if not exists reading_challenges_to_status_idx
on public.reading_challenges(to_profile_id, status, created_at desc);

create index if not exists friend_book_suggestions_to_created_idx
on public.friend_book_suggestions(to_profile_id, created_at desc);
