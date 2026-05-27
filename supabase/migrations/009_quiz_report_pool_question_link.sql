-- Link quiz issue reports back to reusable question pool rows for admin QA.

alter table public.quiz_issue_reports
add column if not exists pool_question_id uuid references public.book_question_pool(id) on delete set null;

create index if not exists quiz_issue_reports_pool_question_idx
on public.quiz_issue_reports(pool_question_id);
