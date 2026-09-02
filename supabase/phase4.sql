-- ============================================================
-- Studdy Phase 4: leaderboard, host earnings, bean gifts
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- Requires phase3.sql to have run first (profiles/cafes/blocks).
-- ============================================================

-- ---------- leaderboard: xp lives on the public profile ----------
alter table public.profiles
  add column if not exists xp integer not null default 0
  check (xp >= 0 and xp < 100000000);

-- ---------- host earnings: cumulative hosted minutes on the café ----------
alter table public.cafes
  add column if not exists study_minutes integer not null default 0
  check (study_minutes >= 0);

-- ---------- study_log: "I studied N minutes at your café" ----------
create table if not exists public.study_log (
  id bigint generated always as identity primary key,
  cafe_owner uuid not null references auth.users(id) on delete cascade,
  visitor uuid not null references auth.users(id) on delete cascade,
  minutes int not null check (minutes between 1 and 180),
  created_at timestamptz not null default now(),
  check (cafe_owner <> visitor)
);
alter table public.study_log enable row level security;

drop policy if exists "own study log" on public.study_log;
create policy "own study log"
  on public.study_log for select to authenticated
  using (cafe_owner = auth.uid() or visitor = auth.uid());

-- one entry per session, honestly sized, at most one every 8 minutes
drop policy if exists "log a session" on public.study_log;
create policy "log a session"
  on public.study_log for insert to authenticated
  with check (
    visitor = auth.uid()
    and not exists (
      select 1 from public.study_log g
      where g.visitor = auth.uid()
        and g.created_at > now() - interval '8 minutes'
    )
  );
-- no update/delete: the log is append-only

create index if not exists study_log_owner on public.study_log (cafe_owner, created_at desc);

-- ---------- gifts: one bean each, three a day, one per person per day ----------
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  beans int not null check (beans = 1),
  created_at timestamptz not null default now(),
  check (sender <> recipient)
);
alter table public.gifts enable row level security;

drop policy if exists "own gifts" on public.gifts;
create policy "own gifts"
  on public.gifts for select to authenticated
  using (sender = auth.uid() or recipient = auth.uid());

drop policy if exists "send a gift" on public.gifts;
create policy "send a gift"
  on public.gifts for insert to authenticated
  with check (
    sender = auth.uid()
    and not exists (
      select 1 from public.blocks b
      where (b.owner = recipient and b.blocked = auth.uid())
         or (b.owner = auth.uid() and b.blocked = recipient)
    )
    -- at most 3 gifts a day, and only one per person per day
    and (
      select count(*) from public.gifts g
      where g.sender = auth.uid() and g.created_at > now() - interval '24 hours'
    ) < 3
    and not exists (
      select 1 from public.gifts g
      where g.sender = auth.uid()
        and g.recipient = gifts.recipient
        and g.created_at > now() - interval '24 hours'
    )
  );
-- no update/delete: gifts are given, not taken back

create index if not exists gifts_recipient on public.gifts (recipient, created_at desc);

-- ---------- grants ----------
grant select, insert on public.study_log to authenticated;
grant select, insert on public.gifts to authenticated;
revoke all on public.study_log from anon;
revoke all on public.gifts from anon;
