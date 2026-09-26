-- 008b: RBAC RLS cutover -- replaces every wide-open policy with the real per-role rules.
--
-- DO NOT APPLY until the frontend that sends Firebase ID tokens + calls join_org_by_code /
-- get_import_file_data is deployed to production. Rollback: 008b_rollback.sql.
--
-- Phase 5 (2026-09-25): applied inside a transaction on production and ROLLED BACK, with a
-- 7-persona battery (Superadmin, Admin, Member+GoGreen, Member+RRC, Member+both, plain Member
-- matched by verified phone, outsider from another chapter) plus anon, against real chapters
-- (238 / 237 roster rows): 115/115 checks as expected. Rollback verified (policies, functions,
-- data unchanged). A Supabase branch was not usable: migration history starts at 004, so a
-- branch cannot rebuild the hand-created base tables.
-- 2026-09-26: phone sign-in turned off, so plain-Member self-match moved to Admin-set links
-- (members.user_id). Re-tested the same way: unlinked Member sees 0; can't link themselves;
-- Go Green can't set links; Admin link -> Member sees exactly those rows and nobody else's;
-- re-importing the batch keeps the link and stamps no uploader id. 10/10, rolled back clean.
--
-- Roles (org_members.role): owner = Superadmin (President), admin = Admin (Vice-President),
-- member = Member. Committee tags (member_committees): go_green, rrc.
--
--   full roster   = Admin/Superadmin or go_green   -> caller_full_roster_org_ids()
--   admin         = Admin/Superadmin               -> caller_admin_org_ids()
--   member of org = any role                       -> caller_org_ids()
--   self (roster) = members.user_id = caller (Admin-linked; survives re-imports), or
--                   phone10(members.phone) = caller_phone10() if phone sign-in is re-enabled
--
-- Everything is granted `to authenticated` only; anon (signed out) gets nothing.
-- service_role (Edge Functions, SQL editor) bypasses RLS and the guard triggers.

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop every existing policy on the tables this migration owns. Dynamic so nothing
--    stale survives (several tables had 2-3 duplicate `using (true)` policies).
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'organizations', 'org_members', 'member_committees', 'profiles', 'members', 'import_logs',
      'outreach_templates', 'outreach_logs', 'ai_chat_history', 'deleted_accounts',
      'ai_chat_messages', 'chapter_settings', 'companion_requests', 'user_sessions')
    or schemaname = 'renewals'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Was RLS-disabled entirely (anyone with the anon key could read/write every template).
alter table public.outreach_templates enable row level security;

-- ---------------------------------------------------------------------------
-- 2. organizations
-- ---------------------------------------------------------------------------
create policy "rbac org read" on public.organizations for select to authenticated
  using (id in (select public.caller_org_ids()) or id in (select public.caller_email_org_ids()));
create policy "rbac org admin update" on public.organizations for update to authenticated
  using (id in (select public.caller_admin_org_ids()))
  with check (id in (select public.caller_admin_org_ids()));
-- No insert/delete: create_bni_organization is the only way in.

-- ---------------------------------------------------------------------------
-- 3. org_members (+ guard trigger below for role / owner rules)
-- ---------------------------------------------------------------------------
create policy "rbac membership read" on public.org_members for select to authenticated
  using (
    org_id in (select public.caller_org_ids())
    or user_id = public.caller_uid()
    or (public.caller_email() is not null and lower(user_email) = public.caller_email())
  );
create policy "rbac membership update" on public.org_members for update to authenticated
  using (
    org_id in (select public.caller_admin_org_ids())
    or (public.caller_email() is not null and lower(user_email) = public.caller_email())
  )
  with check (
    org_id in (select public.caller_admin_org_ids())
    or (user_id = public.caller_uid() and lower(user_email) = public.caller_email())
  );
create policy "rbac membership delete" on public.org_members for delete to authenticated
  using (
    user_id = public.caller_uid()
    or (public.caller_email() is not null and lower(user_email) = public.caller_email())
    or (org_id in (select public.caller_admin_org_ids()) and role <> 'owner')
  );
-- No insert: create_bni_organization / join_org_by_code only.

create or replace function public.guard_org_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := public.caller_uid();
begin
  if v_uid is null then
    return new; -- service_role / SQL editor
  end if;

  if new.org_id is distinct from old.org_id then
    raise exception 'A membership cannot be moved to another chapter.' using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = v_uid and role in ('owner', 'admin')
    ) then
      raise exception 'Only Admins and Superadmins can change roles.' using errcode = '42501';
    end if;
    if (old.role = 'owner' or new.role = 'owner') and not public.caller_is_owner(old.org_id) then
      raise exception 'Only the Superadmin can hand over the Superadmin role.' using errcode = '42501';
    end if;
  end if;

  -- The only allowed user_id change is re-attaching your own verified-email row (UID changed).
  if new.user_id is distinct from old.user_id then
    if not (new.user_id = v_uid and public.caller_email() is not null and lower(old.user_email) = public.caller_email()) then
      raise exception 'A membership cannot be reassigned to another account.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_org_member_update on public.org_members;
create trigger guard_org_member_update before update on public.org_members
  for each row execute function public.guard_org_member_update();

-- ---------------------------------------------------------------------------
-- 4. member_committees: read within your orgs; writes only via sync-committee-tag (service_role)
-- ---------------------------------------------------------------------------
create policy "rbac committee read" on public.member_committees for select to authenticated
  using (org_id in (select public.caller_org_ids()));

-- ---------------------------------------------------------------------------
-- 5. profiles: read yourself + chapter-mates; write only yourself
-- ---------------------------------------------------------------------------
create policy "rbac profile read" on public.profiles for select to authenticated
  using (
    user_id = public.caller_uid()
    or user_id in (select om.user_id from public.org_members om where om.org_id in (select public.caller_org_ids()))
  );
create policy "rbac profile insert" on public.profiles for insert to authenticated
  with check (user_id = public.caller_uid());
create policy "rbac profile update" on public.profiles for update to authenticated
  using (user_id = public.caller_uid()) with check (user_id = public.caller_uid());
create policy "rbac profile delete" on public.profiles for delete to authenticated
  using (user_id = public.caller_uid());

-- ---------------------------------------------------------------------------
-- 6. members (roster + PALMS scores)
--    read:   full roster, or your own rows by verified phone
--    update: full roster (Go Green limited to nudge fields by the trigger below)
--    insert/delete: Admin/Superadmin
-- ---------------------------------------------------------------------------
-- Self rows: linked by an Admin to the caller's account (members.user_id -- set via the roster
-- edit window; Go Green's trigger forbids changing it), or matched by Firebase-verified phone
-- (only applies if phone sign-in is re-enabled).
create policy "rbac roster read" on public.members for select to authenticated
  using (
    org_id in (select public.caller_full_roster_org_ids())
    or (
      org_id in (select public.caller_org_ids())
      and (
        user_id = public.caller_uid()
        or (public.caller_phone10() is not null and public.phone10(phone) = public.caller_phone10())
      )
    )
  );
create policy "rbac roster update" on public.members for update to authenticated
  using (org_id in (select public.caller_full_roster_org_ids()))
  with check (org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac roster insert" on public.members for insert to authenticated
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "rbac roster delete" on public.members for delete to authenticated
  using (org_id in (select public.caller_admin_org_ids()));

create or replace function public.guard_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.caller_uid() is null or old.org_id in (select public.caller_admin_org_ids()) then
    return new; -- service_role, or an Admin/Superadmin of this chapter
  end if;

  -- Go Green: nudge fields only (phone, join date, outreach status in raw_data), never scores.
  if (to_jsonb(new) - array['phone', 'join_date', 'raw_data', 'updated_at'])
     is distinct from (to_jsonb(old) - array['phone', 'join_date', 'raw_data', 'updated_at']) then
    raise exception 'Go Green can only update phone, join date and outreach status.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_member_update on public.members;
create trigger guard_member_update before update on public.members
  for each row execute function public.guard_member_update();

-- ---------------------------------------------------------------------------
-- 7. import_logs: batch metadata readable by the chapter; the stored upload (file_data = the
--    whole roster) is column-hidden and served by get_import_file_data() to full-roster callers.
-- ---------------------------------------------------------------------------
revoke select on public.import_logs from anon, authenticated;
grant select (id, org_id, user_id, filename, file_name, batch_name, total_records, green_count,
              amber_count, red_count, grey_count, avg_score, created_at)
  on public.import_logs to authenticated;

create policy "rbac import log read" on public.import_logs for select to authenticated
  using (org_id in (select public.caller_org_ids()));
create policy "rbac import log insert" on public.import_logs for insert to authenticated
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "rbac import log update" on public.import_logs for update to authenticated
  using (org_id in (select public.caller_admin_org_ids()))
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "rbac import log delete" on public.import_logs for delete to authenticated
  using (org_id in (select public.caller_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- 8. outreach_templates: chapter + global defaults readable; edits by full-roster roles
-- ---------------------------------------------------------------------------
create policy "rbac template read" on public.outreach_templates for select to authenticated
  using (org_id is null or org_id in (select public.caller_org_ids()));
create policy "rbac template insert" on public.outreach_templates for insert to authenticated
  with check (org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac template update" on public.outreach_templates for update to authenticated
  using (org_id in (select public.caller_full_roster_org_ids()))
  with check (org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac template delete" on public.outreach_templates for delete to authenticated
  using (org_id in (select public.caller_full_roster_org_ids()));

-- ---------------------------------------------------------------------------
-- 9. outreach_logs: your own; full-roster roles also see the chapter's
-- ---------------------------------------------------------------------------
create policy "rbac outreach read" on public.outreach_logs for select to authenticated
  using (user_id = public.caller_uid() or org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac outreach insert" on public.outreach_logs for insert to authenticated
  with check (user_id = public.caller_uid() and (org_id is null or org_id in (select public.caller_org_ids())));
create policy "rbac outreach delete" on public.outreach_logs for delete to authenticated
  using (user_id = public.caller_uid());

-- ---------------------------------------------------------------------------
-- 10. ai_chat_history: chapter-shared chat over roster data -> full-roster roles only
-- ---------------------------------------------------------------------------
create policy "rbac ai chat read" on public.ai_chat_history for select to authenticated
  using (org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac ai chat insert" on public.ai_chat_history for insert to authenticated
  with check (org_id in (select public.caller_full_roster_org_ids()));
create policy "rbac ai chat delete" on public.ai_chat_history for delete to authenticated
  using (org_id in (select public.caller_full_roster_org_ids()));

-- ---------------------------------------------------------------------------
-- 11. deleted_accounts: only your own verified email
-- ---------------------------------------------------------------------------
create policy "rbac deleted account read" on public.deleted_accounts for select to authenticated
  using (public.caller_email() is not null and lower(email) = public.caller_email());
create policy "rbac deleted account insert" on public.deleted_accounts for insert to authenticated
  with check (last_user_id = public.caller_uid() and lower(email) = public.caller_email());

-- ai_chat_messages, chapter_settings, companion_requests, user_sessions: unused by the app
-- (no code refs, zero traffic) -> no policies = no client access.

-- ---------------------------------------------------------------------------
-- 12. renewals.*: only Edge Functions (service_role) touch these today. Direct reads are
--     limited to full Renewals access; no direct writes. Replaces migration 004's policies,
--     which used auth.uid() (throws on Firebase UIDs) and allowed any authenticated read.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'chapter_roles', 'import_batches', 'member_aliases', 'member_palms_snapshots', 'member_past_roles',
    'member_sponsor_achievements', 'member_traffic_lights', 'member_training_achievements', 'members',
    'renewal_assignments', 'renewal_cycles', 'renewal_tasks']
  loop
    if to_regclass('renewals.' || t) is not null then
      execute format(
        'create policy "rbac renewals read" on renewals.%I for select to authenticated using (renewals.caller_has_full_access())', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 13. SECURITY DEFINER RPCs the app calls: they bypass RLS, so each gets a checked wrapper
--     with the same signature; the original body is kept as *_unchecked (no client access).
-- ---------------------------------------------------------------------------
alter function public.save_user_profile(text, text, text, text, text, text, boolean) rename to save_user_profile_unchecked;
alter function public.import_bni_report(uuid, text, text, text, text, jsonb) rename to import_bni_report_unchecked;
alter function public.delete_bni_report_batch(uuid, text, text) rename to delete_bni_report_batch_unchecked;
alter function public.batch_update_member_details(uuid, jsonb) rename to batch_update_member_details_unchecked;
alter function public.query_chapter_ai(uuid, text) rename to query_chapter_ai_unchecked;
alter function public.create_bni_organization(text, text, text, text, text, text) rename to create_bni_organization_unchecked;

alter function public.import_bni_report_unchecked(uuid, text, text, text, text, jsonb) set search_path = '';
alter function public.delete_bni_report_batch_unchecked(uuid, text, text) set search_path = '';
alter function public.batch_update_member_details_unchecked(uuid, jsonb) set search_path = '';
alter function public.query_chapter_ai_unchecked(uuid, text) set search_path = '';
alter function public.create_bni_organization_unchecked(text, text, text, text, text, text) set search_path = '';

revoke all on function public.save_user_profile_unchecked(text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.import_bni_report_unchecked(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_bni_report_batch_unchecked(uuid, text, text) from public, anon, authenticated;
revoke all on function public.batch_update_member_details_unchecked(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.query_chapter_ai_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function public.create_bni_organization_unchecked(text, text, text, text, text, text) from public, anon, authenticated;

create function public.save_user_profile(
  p_user_id text, p_full_name text default '', p_phone text default '', p_chapter_role text default '',
  p_business_category text default '', p_avatar_url text default '', p_is_profile_completed boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_user_id is distinct from public.caller_uid() then
    raise exception 'You can only save your own profile.' using errcode = '42501';
  end if;
  return public.save_user_profile_unchecked(p_user_id, p_full_name, p_phone, p_chapter_role,
    p_business_category, p_avatar_url, p_is_profile_completed);
end;
$$;

create function public.import_bni_report(
  p_org_id uuid, p_user_id text, p_batch_name text, p_file_name text, p_file_data text, p_members jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_links jsonb;
begin
  if not coalesce(p_org_id in (select public.caller_admin_org_ids()), false) then
    raise exception 'Only Admins and Superadmins can import reports.' using errcode = '42501';
  end if;

  -- Admin-set account links (name -> user_id), captured before the batch's rows are deleted
  -- and re-applied to the fresh rows, so a re-import never drops a member's link.
  select coalesce(jsonb_object_agg(k, uid), '{}'::jsonb) into v_links
  from (
    select distinct on (lower(trim(name))) lower(trim(name)) as k, user_id as uid
    from public.members
    where org_id = p_org_id and user_id is not null and trim(coalesce(name, '')) <> ''
    order by lower(trim(name)), updated_at desc nulls last
  ) s;

  -- Rows are no longer stamped with the uploader's id (the old bulk-stamp bug).
  v_result := public.import_bni_report_unchecked(p_org_id, null, p_batch_name, p_file_name, p_file_data, p_members);

  update public.members m set user_id = v_links ->> lower(trim(m.name))
  where m.org_id = p_org_id and m.batch_name = p_batch_name and m.user_id is null
    and v_links ? lower(trim(m.name));

  update public.import_logs set user_id = public.caller_uid() where id = (v_result ->> 'log_id')::uuid;
  return v_result;
end;
$$;

create function public.delete_bni_report_batch(p_org_id uuid, p_batch_name text, p_log_id text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(p_org_id in (select public.caller_admin_org_ids()), false) then
    raise exception 'Only Admins and Superadmins can delete reports.' using errcode = '42501';
  end if;
  -- The original deletes `import_logs where id = p_log_id` without an org check.
  if coalesce(p_log_id, '') <> '' and not exists (
    select 1 from public.import_logs where id::text = p_log_id and org_id = p_org_id
  ) then
    raise exception 'That report does not belong to this chapter.' using errcode = '42501';
  end if;
  return public.delete_bni_report_batch_unchecked(p_org_id, p_batch_name, p_log_id);
end;
$$;

create function public.batch_update_member_details(p_org_id uuid, p_updates jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(p_org_id in (select public.caller_admin_org_ids()), false) then
    raise exception 'Only Admins and Superadmins can bulk-update the roster.' using errcode = '42501';
  end if;
  return public.batch_update_member_details_unchecked(p_org_id, p_updates);
end;
$$;

create function public.query_chapter_ai(p_org_id uuid, p_query text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(p_org_id in (select public.caller_full_roster_org_ids()), false) then
    raise exception 'Chapter AI is available to Admins, Superadmins and the Go Green committee.' using errcode = '42501';
  end if;
  return public.query_chapter_ai_unchecked(p_org_id, p_query);
end;
$$;

create function public.create_bni_organization(
  p_name text, p_chapter_name text, p_city text, p_user_id text, p_user_email text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if public.caller_uid() is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  -- p_user_id / p_user_email are ignored: the creator (Superadmin) is always the caller.
  return public.create_bni_organization_unchecked(p_name, p_chapter_name, p_city,
    public.caller_uid(), coalesce(public.caller_email(), ''), p_code);
end;
$$;

revoke all on function public.save_user_profile(text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.import_bni_report(uuid, text, text, text, text, jsonb) from public, anon;
revoke all on function public.delete_bni_report_batch(uuid, text, text) from public, anon;
revoke all on function public.batch_update_member_details(uuid, jsonb) from public, anon;
revoke all on function public.query_chapter_ai(uuid, text) from public, anon;
revoke all on function public.create_bni_organization(text, text, text, text, text, text) from public, anon;
grant execute on function public.save_user_profile(text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.import_bni_report(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.delete_bni_report_batch(uuid, text, text) to authenticated;
grant execute on function public.batch_update_member_details(uuid, jsonb) to authenticated;
grant execute on function public.query_chapter_ai(uuid, text) to authenticated;
grant execute on function public.create_bni_organization(text, text, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
