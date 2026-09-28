-- 010: Platform Admin audit log -- who did what across a chapter they don't personally belong
-- to. Logged server-side (not from the client) so it can't be skipped or bypassed by a screen
-- that forgets to call it. Covers the two actions that are uniquely a Platform Admin's to take:
-- changing a role in org_members, and adding someone to an org directly (admin_add_org_member).
-- Ordinary roster/report edits are NOT logged here -- those are normal admin work whichever
-- chapter they happen in; this table is about identity and access control specifically.
--
-- Read access: any Platform Admin (there is currently one; the table supports more). Writes are
-- internal only, via log_platform_admin_action(), never exposed directly.

create table if not exists public.platform_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_uid text not null,
  org_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_log_created_at_idx on public.platform_admin_audit_log (created_at desc);

alter table public.platform_admin_audit_log enable row level security;

create policy "platform admin audit read" on public.platform_admin_audit_log for select to authenticated
  using (public.is_platform_admin());

create or replace function public.log_platform_admin_action(p_org_id uuid, p_action text, p_detail jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_admin_audit_log (actor_uid, org_id, action, detail)
  values (public.caller_uid(), p_org_id, p_action, p_detail);
$$;

revoke all on function public.log_platform_admin_action(uuid, text, jsonb) from public, anon, authenticated;

-- org_members role/user_id changes: log every one a Platform Admin makes (whether or not they
-- also happen to hold a real membership in that org -- simpler and never under-logs).
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
    return new;
  end if;

  if public.is_platform_admin() then
    if new.role is distinct from old.role or new.user_id is distinct from old.user_id then
      perform public.log_platform_admin_action(old.org_id, 'org_member_update', jsonb_build_object(
        'org_member_id', old.id, 'target_user_id', old.user_id,
        'role_before', old.role, 'role_after', new.role,
        'user_id_before', old.user_id, 'user_id_after', new.user_id
      ));
    end if;
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

-- admin_add_org_member: every successful call is definitionally a Platform Admin action
-- (the function itself already requires is_platform_admin() to run at all).
create or replace function public.admin_add_org_member(p_org_id uuid, p_user_id text, p_user_email text, p_role text default 'member')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.org_members;
  v_existed boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin only.' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'member') then
    raise exception 'role must be owner, admin or member.' using errcode = '22023';
  end if;

  select exists (select 1 from public.org_members where org_id = p_org_id and user_id = p_user_id) into v_existed;

  insert into public.org_members (org_id, user_id, user_email, role)
  values (p_org_id, p_user_id, coalesce(p_user_email, ''), p_role)
  on conflict (org_id, user_id) do update set role = excluded.role, user_email = excluded.user_email
  returning * into v_member;

  perform public.log_platform_admin_action(p_org_id, 'org_member_added', jsonb_build_object(
    'target_user_id', p_user_id, 'target_user_email', p_user_email, 'role', p_role, 'was_reroled', v_existed
  ));

  return to_jsonb(v_member);
end;
$$;
