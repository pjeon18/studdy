-- ============================================================
-- Studdy Phase 5: server-authoritative economy (Build Plan 2 · T1)
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- Requires phase3.sql + phase4.sql to have run first.
--
-- What changes:
--   · focus xp is now granted by the SERVER from witnessed session
--     heartbeats — a devtools user cannot mint leaderboard xp
--   · profiles.xp and cafes.study_minutes become server-written only
--     (column-scoped grants; the client loses UPDATE/INSERT on them)
--   · study_log rows are written by the server at session end with
--     verified minutes (direct client inserts are revoked)
--   · beans stay client-side on purpose: they're private convenience
--     currency, never ranked — the leaderboard and café stars are
--     what must be trustworthy
-- ============================================================

-- ---------- sessions: server-witnessed focus time ----------
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  place uuid,                              -- a real café owner's uid, or null (home / dream café)
  started_at timestamptz not null default now(),
  last_beat timestamptz not null default now(),
  seconds int not null default 0 check (seconds >= 0),          -- verified focused seconds
  credited_min int not null default 0 check (credited_min >= 0),-- minutes already granted as xp
  closed boolean not null default false
);
alter table public.sessions enable row level security;

-- you may read your own receipts; all writes go through the functions below
drop policy if exists "own sessions" on public.sessions;
create policy "own sessions"
  on public.sessions for select to authenticated
  using (user_id = auth.uid());

grant select on public.sessions to authenticated;
revoke insert, update, delete on public.sessions from authenticated;
revoke all on public.sessions from anon;

create index if not exists sessions_user_recent on public.sessions (user_id, started_at desc);

-- ---------- settle: pay the host from verified seconds ----------
-- Shared by session_end and session_begin (which sweeps sessions left open
-- by a closed tab, so hosts still get credit for uncleanly-ended visits).
create or replace function public._settle_session(s public.sessions)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  m int;
begin
  update public.sessions set closed = true where id = s.id and not closed;
  m := least(s.seconds / 60, 180);
  if s.place is not null and s.place <> s.user_id and m >= 1 then
    begin
      insert into public.study_log (cafe_owner, visitor, minutes)
      values (s.place, s.user_id, m);
      update public.cafes
         set study_minutes = least(study_minutes + m, 100000000)
       where user_id = s.place;
    exception when others then
      null; -- host account gone mid-session: the visit just goes unpaid
    end;
  end if;
end $$;
revoke execute on function public._settle_session(public.sessions) from public, anon, authenticated;

-- ---------- session_begin(place) → session id ----------
create or replace function public.session_begin(p_place uuid default null)
returns bigint
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s public.sessions;
  sid bigint;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  -- sweep anything left open (crash / closed tab): settle, don't discard
  for s in select * from public.sessions where user_id = auth.uid() and not closed loop
    perform public._settle_session(s);
  end loop;
  -- the place must be a real café whose owner hasn't blocked you
  if p_place is not null and (
    not exists (select 1 from public.cafes c where c.user_id = p_place)
    or exists (select 1 from public.blocks b where b.owner = p_place and b.blocked = auth.uid())
  ) then
    p_place := null;
  end if;
  insert into public.sessions (user_id, place) values (auth.uid(), p_place)
  returning id into sid;
  return sid;
end $$;

-- ---------- session_beat(id) → total credited minutes ----------
-- Called ~once a minute while seated. Accrual is bounded by the wall
-- clock: a beat is worth the real gap since the last one, capped at 90s,
-- and beats under 20s apart earn nothing — hammering the endpoint cannot
-- outrun time. One session tops out at 6 verified hours, one rolling day
-- at 16. xp is granted here at the same 10/min the client shows.
create or replace function public.session_beat(p_id bigint)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s record;
  gap int;
  total_sec int;
  day_sec int;
  new_min int;
begin
  if auth.uid() is null then return -1; end if;
  select * into s from public.sessions
   where id = p_id and user_id = auth.uid() and not closed
   for update;
  if not found then return -1; end if;

  gap := extract(epoch from (now() - s.last_beat))::int;
  if gap < 20 then
    return s.credited_min;
  end if;

  total_sec := least(s.seconds + least(gap, 90), 21600); -- 6h/session

  select coalesce(sum(seconds), 0) into day_sec from public.sessions
   where user_id = auth.uid()
     and started_at > now() - interval '24 hours'
     and id <> p_id;
  if day_sec + total_sec > 57600 then                    -- 16h/day
    total_sec := greatest(least(total_sec, 57600 - day_sec), s.seconds);
  end if;

  new_min := greatest((total_sec / 60) - s.credited_min, 0);

  update public.sessions
     set last_beat = now(),
         seconds = total_sec,
         credited_min = s.credited_min + new_min
   where id = p_id;

  if new_min > 0 then
    update public.profiles
       set xp = least(xp + new_min * 10, 99999999)
     where user_id = auth.uid();
  end if;

  return s.credited_min + new_min;
end $$;

-- ---------- session_end(id) → verified minutes ----------
create or replace function public.session_end(p_id bigint)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s public.sessions;
begin
  if auth.uid() is null then return -1; end if;
  select * into s from public.sessions
   where id = p_id and user_id = auth.uid() and not closed
   for update;
  if not found then return -1; end if;
  perform public._settle_session(s);
  return s.seconds / 60;
end $$;

revoke execute on function public.session_begin(uuid) from public, anon;
revoke execute on function public.session_beat(bigint) from public, anon;
revoke execute on function public.session_end(bigint) from public, anon;
grant execute on function public.session_begin(uuid) to authenticated;
grant execute on function public.session_beat(bigint) to authenticated;
grant execute on function public.session_end(bigint) to authenticated;

-- ---------- lock the ranked columns to the server ----------
-- profiles.xp: only session_beat writes it now
revoke insert, update on public.profiles from authenticated;
grant update (handle, name, avatar, updated_at) on public.profiles to authenticated;
grant insert (user_id, handle, name, avatar, updated_at) on public.profiles to authenticated;

-- cafes.study_minutes: only _settle_session writes it now
revoke insert, update on public.cafes from authenticated;
grant update (open, doc, updated_at) on public.cafes to authenticated;
grant insert (user_id, open, doc, updated_at) on public.cafes to authenticated;

-- study_log: rows now come from _settle_session with verified minutes
revoke insert on public.study_log from authenticated;
