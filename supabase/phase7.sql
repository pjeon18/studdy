-- ============================================================
-- Studdy Phase 7: launch hygiene (Build Plan 2 · T8)
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
--
--   · reports: a safety valve on profile cards — players can flag
--     someone; ONLY the dashboard (service role) can read them
--   · site_stats: a privacy-respecting visit counter — one integer
--     per day, no identifiers, nothing else
-- ============================================================

-- ---------- reports ----------
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users(id) on delete cascade,
  reported uuid not null references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (reporter <> reported)
);
alter table public.reports enable row level security;

-- players file them; nobody but the dashboard reads them
drop policy if exists "file a report" on public.reports;
create policy "file a report"
  on public.reports for insert to authenticated
  with check (
    reporter = auth.uid()
    -- gentle rate limits: 5 reports a day, one per person per day
    and (
      select count(*) from public.reports r
      where r.reporter = auth.uid() and r.created_at > now() - interval '24 hours'
    ) < 5
    and not exists (
      select 1 from public.reports r
      where r.reporter = auth.uid()
        and r.reported = reports.reported
        and r.created_at > now() - interval '24 hours'
    )
  );
-- no select/update/delete policies: append-only, reviewed in the dashboard

grant insert on public.reports to authenticated;
revoke select, update, delete on public.reports from authenticated;
revoke all on public.reports from anon;

-- ---------- site_stats: the tiny counter ----------
create table if not exists public.site_stats (
  day date primary key,
  visits int not null default 0
);
alter table public.site_stats enable row level security;
-- no policies at all: only visit_ping() (definer) touches it,
-- and only the dashboard reads it
revoke all on public.site_stats from authenticated, anon;

create or replace function public.visit_ping()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.site_stats (day, visits) values (current_date, 1)
  on conflict (day) do update set visits = site_stats.visits + 1;
end $$;
revoke execute on function public.visit_ping() from public, anon;
grant execute on function public.visit_ping() to authenticated;
