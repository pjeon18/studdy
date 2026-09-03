-- ============================================================
-- Studdy Phase 6: study clubs (Build Plan 2 · T4)
-- Run the whole file in the Supabase SQL editor. Safe to re-run.
-- Requires phase3–5 to have run first.
--
-- Clubs are five-seat clans for level-10+ players: one shared
-- clubhouse room every member can furnish (last-write-wins doc),
-- a pooled treasury that pays for its furniture, and a +10% xp
-- warmth bonus while a clubmate is studying. All writes go through
-- security-definer functions; membership is one club per person.
-- ============================================================

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null
    check (handle ~ '^[a-z0-9][a-z0-9_-]{2,19}$'),
  name text not null check (char_length(name) between 1 and 24),
  creator uuid not null references auth.users(id) on delete cascade,
  doc jsonb not null default '{}'::jsonb check (pg_column_size(doc) < 262144), -- 256KB
  treasury int not null default 0 check (treasury >= 0 and treasury < 10000000),
  study_minutes int not null default 0 check (study_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clubs enable row level security;

create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'member')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id),
  unique (user_id) -- one club per person
);
alter table public.club_members enable row level security;

-- clubs and their rosters are public inside the game (names/handles are
-- chosen display data; the doc is furniture)
drop policy if exists "clubs are readable" on public.clubs;
create policy "clubs are readable"
  on public.clubs for select to authenticated using (true);
drop policy if exists "rosters are readable" on public.club_members;
create policy "rosters are readable"
  on public.club_members for select to authenticated using (true);

grant select on public.clubs to authenticated;
grant select on public.club_members to authenticated;
revoke insert, update, delete on public.clubs from authenticated;
revoke insert, update, delete on public.club_members from authenticated;
revoke all on public.clubs from anon;
revoke all on public.club_members from anon;

create index if not exists club_members_user on public.club_members (user_id);

-- level 10 = 2700 xp (levelCost(n) = 100 + (n-1)*50, summed 1..9)
create or replace function public._club_level_ok()
returns boolean
language sql security definer set search_path = public, pg_temp
as $$
  select coalesce((select xp from public.profiles where user_id = auth.uid()), 0) >= 2700
$$;
revoke execute on function public._club_level_ok() from public, anon, authenticated;

-- ---------- club_create(handle, name) → club id ----------
create or replace function public.club_create(p_handle text, p_name text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public._club_level_ok() then raise exception 'level 10 required'; end if;
  if exists (select 1 from public.club_members where user_id = auth.uid()) then
    raise exception 'already in a club';
  end if;
  insert into public.clubs (handle, name, creator)
  values (lower(p_handle), p_name, auth.uid())
  returning id into cid;
  insert into public.club_members (club_id, user_id, role) values (cid, auth.uid(), 'leader');
  return cid;
end $$;

-- ---------- club_join(handle) → club id ----------
create or replace function public.club_join(p_handle text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public._club_level_ok() then raise exception 'level 10 required'; end if;
  if exists (select 1 from public.club_members where user_id = auth.uid()) then
    raise exception 'already in a club';
  end if;
  select * into c from public.clubs where handle = lower(p_handle) for update;
  if not found then raise exception 'no such club'; end if;
  if (select count(*) from public.club_members m where m.club_id = c.id) >= 5 then
    raise exception 'club is full';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.owner = c.creator and b.blocked = auth.uid())
       or (b.owner = auth.uid() and b.blocked = c.creator)
  ) then
    raise exception 'no such club'; -- blocks are absolute and invisible
  end if;
  insert into public.club_members (club_id, user_id) values (c.id, auth.uid());
  return c.id;
end $$;

-- ---------- club_leave() ----------
create or replace function public.club_leave()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  m record;
  heir uuid;
begin
  select * into m from public.club_members where user_id = auth.uid();
  if not found then return; end if;
  delete from public.club_members where user_id = auth.uid();
  if m.role = 'leader' then
    select user_id into heir from public.club_members
     where club_id = m.club_id order by created_at asc limit 1;
    if heir is null then
      delete from public.clubs where id = m.club_id;
    else
      update public.club_members set role = 'leader'
       where club_id = m.club_id and user_id = heir;
      update public.clubs set creator = heir where id = m.club_id;
    end if;
  end if;
end $$;

-- ---------- club_kick(user) — leader only ----------
create or replace function public.club_kick(p_user uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  my record;
begin
  select * into my from public.club_members where user_id = auth.uid();
  if not found or my.role <> 'leader' or p_user = auth.uid() then return; end if;
  delete from public.club_members where club_id = my.club_id and user_id = p_user;
end $$;

-- ---------- club_donate(beans) ----------
-- Beans are client-side convenience currency, so the donation amount is
-- honor-side; the treasury only buys shared furniture (cosmetic, unranked).
create or replace function public.club_donate(p_beans int)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  my record;
  t int;
begin
  select * into my from public.club_members where user_id = auth.uid();
  if not found or p_beans < 1 or p_beans > 5000 then return -1; end if;
  update public.clubs set treasury = least(treasury + p_beans, 9999999), updated_at = now()
   where id = my.club_id
  returning treasury into t;
  return t;
end $$;

-- ---------- club_spend(cost) → remaining treasury, or -1 if it can't pay ----------
create or replace function public.club_spend(p_cost int)
returns int
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  my record;
  t int;
begin
  select * into my from public.club_members where user_id = auth.uid();
  if not found or p_cost < 0 or p_cost > 100000 then return -1; end if;
  update public.clubs set treasury = treasury - p_cost, updated_at = now()
   where id = my.club_id and treasury >= p_cost
  returning treasury into t;
  if t is null then return -1; end if;
  return t;
end $$;

-- ---------- club_save_doc(doc) — the shared room, last write wins ----------
create or replace function public.club_save_doc(p_doc jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  my record;
begin
  select * into my from public.club_members where user_id = auth.uid();
  if not found then return; end if;
  if pg_column_size(p_doc) >= 262144 then return; end if;
  update public.clubs set doc = p_doc, updated_at = now() where id = my.club_id;
end $$;

revoke execute on function public.club_create(text, text) from public, anon;
revoke execute on function public.club_join(text) from public, anon;
revoke execute on function public.club_leave() from public, anon;
revoke execute on function public.club_kick(uuid) from public, anon;
revoke execute on function public.club_donate(int) from public, anon;
revoke execute on function public.club_spend(int) from public, anon;
revoke execute on function public.club_save_doc(jsonb) from public, anon;
grant execute on function public.club_create(text, text) to authenticated;
grant execute on function public.club_join(text) to authenticated;
grant execute on function public.club_leave() to authenticated;
grant execute on function public.club_kick(uuid) to authenticated;
grant execute on function public.club_donate(int) to authenticated;
grant execute on function public.club_spend(int) to authenticated;
grant execute on function public.club_save_doc(jsonb) to authenticated;

-- ---------- the club warmth bonus: +10% xp while a clubmate studies ----------
-- Same signature as phase 5's session_beat; this REPLACES it. The bonus is
-- server-verified: another member of your club must have a live session
-- (a heartbeat in the last 3 minutes).
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
  xp_gain int;
  warm boolean := false;
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
    select exists (
      select 1
        from public.club_members me
        join public.club_members mate on mate.club_id = me.club_id and mate.user_id <> me.user_id
        join public.sessions ms on ms.user_id = mate.user_id
       where me.user_id = auth.uid()
         and not ms.closed
         and ms.last_beat > now() - interval '3 minutes'
    ) into warm;
    xp_gain := new_min * 10 + case when warm then new_min else 0 end; -- +10%
    update public.profiles
       set xp = least(xp + xp_gain, 99999999)
     where user_id = auth.uid();
  end if;

  return s.credited_min + new_min;
end $$;
