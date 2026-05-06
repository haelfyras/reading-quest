-- Child accounts use unique screen names without email addresses.
-- Run this in Supabase SQL Editor after 001 and 002.

alter table public.profiles
add column if not exists child_password_hash text;

create unique index if not exists profiles_child_screen_name_unique_idx
on public.profiles (lower(screen_name))
where account_type = 'child';

create unique index if not exists profiles_parent_email_unique_idx
on public.profiles (lower(email))
where account_type = 'parent' and email is not null;
