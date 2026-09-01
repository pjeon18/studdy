-- ============================================================
-- Studdy Phase 3: the real social loop
-- profiles (handle + display name) · cafes (visitable rooms)
-- friends (requests) · guest_notes (cross-user guestbook) · blocks
--
-- Run the whole file in the Supabase SQL editor.
-- Same posture as saves: RLS on everything, policies scoped
-- `to authenticated`, anon revoked, explicit grants (new projects
-- don't auto-grant), size caps on every user-supplied blob.
-- ============================================================

-- ---------- profiles: who a user is, publicly ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null
    check (handle ~ '^[a-z0-9][a-z0-9_-]{2,19}$'),
  name text not null check (char_length(name) between 1 and 20),
  avatar jsonb not null default '{}'::jsonb
    check (pg_column_size(avatar) < 2048),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- profiles are public inside the game (names/handles are chosen display
-- data, never emails) — that's what makes the directory + friends work
create policy "profiles are readable"
  on public.profiles for select to authenticated
  using (true);
create policy "own profile insert"
  on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy "own profile update"
  on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- no delete policy: profiles die with the account (cascade)

-- ---------- cafes: the visitable room document ----------
create table if not exists public.cafes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  open boolean not null default true,
  doc jsonb not null check (pg_column_size(doc) < 524288), -- 512KB
  updated_at timestamptz not null default now()
);
alter table public.cafes enable row level security;

-- open cafés are visitable by anyone signed in — unless the owner
-- blocked you. closed cafés are visible only to their owner.
create policy "open cafes are visitable"
  on public.cafes for select to authenticated
  using (
    user_id = auth.uid()
    or (
      open
      and not exists (
        select 1 from public.blocks b
        where b.owner = cafes.user_id and b.blocked = auth.uid()
      )
    )
  );
create policy "own cafe insert"
  on public.cafes for insert to authenticated
  with check (user_id = auth.uid());
create policy "own cafe update"
  on public.cafes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists cafes_open_recent
  on public.cafes (updated_at desc) where open;

-- ---------- blocks: absolute, owner-scoped ----------
create table if not exists public.blocks (
  owner uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, blocked),
  check (owner <> blocked)
);
alter table public.blocks enable row level security;

create policy "own blocks select"
  on public.blocks for select to authenticated
  using (owner = auth.uid());
create policy "own blocks insert"
  on public.blocks for insert to authenticated
  with check (owner = auth.uid());
create policy "own blocks delete"
  on public.blocks for delete to authenticated
  using (owner = auth.uid());

-- ---------- friends: requests + accepted, one row per pair ----------
create table if not exists public.friends (
  id bigint generated always as identity primary key,
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
alter table public.friends enable row level security;

create policy "own friendships select"
  on public.friends for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- you can ask — politely: pending only, not if either side blocked the
-- other, no duplicate pair in either direction, at most 20 open asks
create policy "send friend request"
  on public.friends for insert to authenticated
  with check (
    requester = auth.uid()
    and status = 'pending'
    and not exists (
      select 1 from public.blocks b
      where (b.owner = addressee and b.blocked = auth.uid())
         or (b.owner = auth.uid() and b.blocked = addressee)
    )
    and not exists (
      select 1 from public.friends f
      where f.requester = friends.addressee and f.addressee = auth.uid()
    )
    and (
      select count(*) from public.friends f
      where f.requester = auth.uid() and f.status = 'pending'
    ) < 20
  );

-- only the person asked can accept, and accept is the only edit
create policy "accept friend request"
  on public.friends for update to authenticated
  using (addressee = auth.uid() and status = 'pending')
  with check (addressee = auth.uid() and status = 'accepted');

-- either side can decline / unfriend
create policy "end friendship"
  on public.friends for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

create index if not exists friends_addressee on public.friends (addressee, status);

-- ---------- guest_notes: hand-drawn notes left at real cafés ----------
create table if not exists public.guest_notes (
  id bigint generated always as identity primary key,
  cafe_owner uuid not null references auth.users(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 20),
  art text not null check (
    art like 'data:image/png;base64,%' and char_length(art) < 80000
  ),
  created_at timestamptz not null default now(),
  check (cafe_owner <> author)
);
alter table public.guest_notes enable row level security;

-- your received notes are yours; authors can see what they left
create policy "read own guestbook"
  on public.guest_notes for select to authenticated
  using (cafe_owner = auth.uid() or author = auth.uid());

-- leaving a note requires: it's really you, their café is open with the
-- guestbook enabled, you're not blocked, your signed name matches your
-- profile, and you haven't signed this same book in the last 5 minutes
create policy "leave a note"
  on public.guest_notes for insert to authenticated
  with check (
    author = auth.uid()
    and exists (
      select 1 from public.cafes c
      where c.user_id = cafe_owner
        and c.open
        and coalesce((c.doc -> 'info' ->> 'guestbook')::boolean, false)
    )
    and not exists (
      select 1 from public.blocks b
      where b.owner = cafe_owner and b.blocked = auth.uid()
    )
    and author_name = (select p.name from public.profiles p where p.user_id = auth.uid())
    and not exists (
      select 1 from public.guest_notes g
      where g.cafe_owner = guest_notes.cafe_owner
        and g.author = auth.uid()
        and g.created_at > now() - interval '5 minutes'
    )
  );

-- moderation: the owner can remove anything from their book;
-- authors can take back their own note
create policy "moderate own guestbook"
  on public.guest_notes for delete to authenticated
  using (cafe_owner = auth.uid() or author = auth.uid());

create index if not exists guest_notes_owner on public.guest_notes (cafe_owner, created_at desc);

-- ---------- grants (new projects grant nothing by default) ----------
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.cafes to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, delete on public.friends to authenticated;
grant update (status) on public.friends to authenticated; -- accept flips status, nothing else
grant select, insert, delete on public.guest_notes to authenticated;

revoke all on public.profiles from anon;
revoke all on public.cafes from anon;
revoke all on public.blocks from anon;
revoke all on public.friends from anon;
revoke all on public.guest_notes from anon;
