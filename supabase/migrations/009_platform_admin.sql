-- 009: Platform Admin -- a role above every chapter's Superadmin, for one person (or a small,
-- explicitly-granted set) who can act on ANY organization, not just their own. Deliberately a
-- hole in the per-chapter isolation 008b enforces: granting it is a real decision, so it is
-- SQL-only, never exposed as an RPC. See the approved plan's Phase 6 follow-up (2026-09-26).
--
-- Design: rather than special-case every policy, is_platform_admin() is folded into the three
-- "which orgs can this caller act on" helpers. Every policy and checked RPC already built on
-- top of them (organizations, org_members, members, import_logs, templates, ai_chat,
-- import_bni_report, delete_bni_report_batch, batch_update_member_details, query_chapter_ai,
-- get_import_file_data) grants a Platform Admin access to every org automatically, with no
-- per-policy changes. Only the two direct, non-helper-routed checks (the org_members trigger's
-- role-change gate, and caller_is_owner) needed a explicit bypass.

create table if not exists public.platform_admins (
  user_id text primary key,
  granted_by text,
  granted_at timestamptz not null default now(),
  note text
);

alter table public.platform_admins enable row level security;
-- No policies: unreadable and unwritable via the API, by anyone, including the admins listed in
-- it. Membership is managed by SQL only (this migration, or a follow-up one) -- see plan note.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = public.caller_uid());
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- Widened to include every org for a Platform Admin. `where public.is_platform_admin()`
-- contributes zero rows when false, so this is a no-op for everyone else.
create or replace function public.caller_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members where user_id = (auth.jwt() ->> 'sub')
  union
  select id from public.organizations where public.is_platform_admin();
$$;

create or replace function public.caller_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members
  where user_id = (auth.jwt() ->> 'sub') and role in ('owner', 'admin')
  union
  select id from public.organizations where public.is_platform_admin();
$$;

create or replace function public.caller_full_roster_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members
  where user_id = (auth.jwt() ->> 'sub') and role in ('owner', 'admin')
  union
  select org_id from public.member_committees
  where user_id = (auth.jwt() ->> 'sub') and committee = 'go_green'
  union
  select id from public.organizations where public.is_platform_admin();
$$;

create or replace function public.caller_is_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (auth.jwt() ->> 'sub') and role = 'owner'
  );
$$;

create or replace function renewals.caller_has_full_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.org_members
    where user_id = (auth.jwt() ->> 'sub') and role in ('owner', 'admin')
  ) or exists (
    select 1 from public.member_committees
    where user_id = (auth.jwt() ->> 'sub') and committee = 'rrc'
  );
$$;

-- The one check in 008b that queries org_members directly instead of going through a helper
-- (so a Platform Admin with no membership row in the target org would otherwise be refused).
create or replace function public.guard_org_member_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := public.caller_uid();
begin
  if v_uid is null or public.is_platform_admin() then
    return new;
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

  if new.user_id is distinct from old.user_id then
    if not (new.user_id = v_uid and public.caller_email() is not null and lower(old.user_email) = public.caller_email()) then
      raise exception 'A membership cannot be reassigned to another account.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Lets a Platform Admin add someone to any organization directly, without an invite code, and
-- at any role (including handing out Superadmin outright -- ordinary org_members insert stays
-- blocked for everyone else; this is the only INSERT path besides create_bni_organization /
-- join_org_by_code).
create or replace function public.admin_add_org_member(p_org_id uuid, p_user_id text, p_user_email text, p_role text default 'member')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.org_members;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin only.' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'role must be owner, admin or member.' using errcode = '22023';
  end if;

  insert into public.org_members (org_id, user_id, user_email, role)
  values (p_org_id, p_user_id, coalesce(p_user_email, ''), p_role)
  on conflict (org_id, user_id) do update set role = excluded.role, user_email = excluded.user_email
  returning * into v_member;

  return to_jsonb(v_member);
end;
$$;

revoke all on function public.admin_add_org_member(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_add_org_member(uuid, text, text, text) to authenticated;

-- Seed grant (2026-09-26, user-directed): monis.handysolver@gmail.com, verified against both
-- public.org_members and a live Firebase accounts:lookup before this migration was written.
insert into public.platform_admins (user_id, granted_by, note)
values ('m3MO3ChVb1PRnmrrwIDA1UpwWr23', 'migration_009', 'monis.handysolver@gmail.com -- initial grant')
on conflict (user_id) do nothing;
