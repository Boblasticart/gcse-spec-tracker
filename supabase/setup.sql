-- GCSE Spec Tracker: run this once in Supabase (SQL Editor > New query > paste > Run).
-- It is safe to run again; it won't delete anything.

-- One table holds everything the tracker saves. Each row is one saved item:
--   path  e.g. 'progress/phy', 'a/s-bio-1', 'daily/2026-11-07-phy'
--   data  the item itself, as JSON
create table if not exists public.tracker_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  path       text        not null check (char_length(path) between 1 and 300),
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);

-- Keep updated_at current on every change.
create or replace function public.tracker_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tracker_docs_touch on public.tracker_docs;
create trigger tracker_docs_touch before update on public.tracker_docs
  for each row execute function public.tracker_touch();

-- Row-level security: each signed-in person can only see and change their own rows.
alter table public.tracker_docs enable row level security;

drop policy if exists "own rows: read"   on public.tracker_docs;
drop policy if exists "own rows: add"    on public.tracker_docs;
drop policy if exists "own rows: change" on public.tracker_docs;
drop policy if exists "own rows: delete" on public.tracker_docs;

create policy "own rows: read"   on public.tracker_docs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own rows: add"    on public.tracker_docs for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "own rows: change" on public.tracker_docs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own rows: delete" on public.tracker_docs for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Signed-out visitors get nothing.
revoke all on public.tracker_docs from anon;
grant select, insert, update, delete on public.tracker_docs to authenticated;
