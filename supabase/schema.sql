-- Studdy: accounts + cloud saves (Phase 1) — canonical schema.
-- Fresh projects: run this once in the SQL editor.
-- Projects that ran the earlier v1: run harden.sql instead.

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now(),
  constraint saves_doc_size check (pg_column_size(doc) < 2097152)
);

alter table public.saves enable row level security;

create policy "own save: read"   on public.saves for select to authenticated using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert to authenticated with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- no delete policy on purpose: rows are removed by the auth.users cascade only

-- newer Supabase projects don't auto-grant table privileges: RLS gates rows,
-- but the role still needs the base grants (no delete — cascade only)
grant select, insert, update on table public.saves to authenticated;
revoke all on table public.saves from anon;
