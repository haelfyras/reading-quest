-- Verified book fact sheets used to ground Medium and Hard quiz generation.
-- Run after 009.

create table if not exists public.book_fact_sheets (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null unique,
  title text not null,
  author text,
  isbn text,
  fact_version integer not null default 1 check (fact_version >= 1),
  status text not null default 'needs_review' check (status in ('ready', 'low_confidence', 'needs_review')),
  source_confidence numeric(4,2) not null default 0 check (source_confidence >= 0 and source_confidence <= 1),
  facts jsonb not null default '{}'::jsonb,
  source_names text[] not null default '{}',
  source_urls text[] not null default '{}',
  source_notes text[] not null default '{}',
  ai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists book_fact_sheets_status_idx
on public.book_fact_sheets(status, source_confidence desc, updated_at desc);

alter table public.book_fact_sheets enable row level security;

drop policy if exists "Book fact sheets are readable" on public.book_fact_sheets;
create policy "Book fact sheets are readable" on public.book_fact_sheets
for select using (true);

drop trigger if exists touch_book_fact_sheets_updated_at on public.book_fact_sheets;
create trigger touch_book_fact_sheets_updated_at
before update on public.book_fact_sheets
for each row execute function public.touch_updated_at();
