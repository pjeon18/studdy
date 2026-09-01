-- Studdy: security hardening patch (run AFTER schema.sql, safe to re-run).
-- Addresses Supabase's anonymous-sign-in advisory:
--   * policies scoped explicitly to the `authenticated` role (anonymous
--     users use it too, but auth.uid() still confines them to their row;
--     signed-out visitors match no policy at all)
--   * explicit revoke from `anon` (signed-out) — belt and braces
--   * a hard size cap on the save document so abusive rows can't bloat
--     the database

-- replace the v1 policies with role-scoped ones
drop policy if exists "own save: read"   on public.saves;
drop policy if exists "own save: insert" on public.saves;
drop policy if exists "own save: update" on public.saves;

create policy "own save: read"   on public.saves for select to authenticated using (auth.uid() = user_id);
create policy "own save: insert" on public.saves for insert to authenticated with check (auth.uid() = user_id);
create policy "own save: update" on public.saves for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- no delete policy on purpose: rows are removed by the auth.users cascade only

-- signed-out visitors get nothing, explicitly
-- newer Supabase projects don't auto-grant table privileges: RLS gates rows,
-- but the role still needs the base grants (no delete — cascade only)
grant select, insert, update on table public.saves to authenticated;
revoke all on table public.saves from anon;

-- cap the document at 2MB (the client stays under 1.5MB on its own)
alter table public.saves drop constraint if exists saves_doc_size;
alter table public.saves add constraint saves_doc_size check (pg_column_size(doc) < 2097152);
