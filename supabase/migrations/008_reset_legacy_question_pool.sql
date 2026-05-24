-- Reset generated quiz question pools from the pre-cumulative quiz model.
-- This preserves user accounts, quiz results, reports, prizes, and book difficulty ratings.

do $$
begin
  if to_regclass('public.book_question_pool') is not null then
    delete from public.book_question_pool;
  end if;
end $$;
