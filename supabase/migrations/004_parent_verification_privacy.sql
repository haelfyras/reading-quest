-- Parent-child verification should not require a child's real name.

alter table public.parent_verification_requests
alter column child_first_name drop not null;
