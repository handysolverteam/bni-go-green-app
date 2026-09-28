-- 011: RPCs backing the Platform Admin UI's "Platform Admins" tab. platform_admins itself has
-- zero RLS policies (see migration 009's comment) -- deliberately, since direct table access
-- would mean any bug in a future client-side check could silently expose grant/revoke to the
-- wrong role. These three functions are the only door in, each re-checking is_platform_admin()
-- itself and logging through the same audit trail as migration 010.
--
-- User search and audit-log reads need no new RPC: a Platform Admin can already read
-- org_members/organizations directly (caller_org_ids() includes every org for them) and
-- platform_admin_audit_log directly (its own is_platform_admin() policy) -- both from 009/010.

create or replace function public.admin_list_platform_admins()
returns table(user_id text, email text, full_name text, granted_by text, granted_at timestamptz, note text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin only.' using errcode = '42501';
  end if;

  return query
    select
      pa.user_id,
      (select om.user_email from public.org_members om where om.user_id = pa.user_id order by om.created_at desc limit 1),
      (select p.full_name from public.profiles p where p.user_id = pa.user_id),
      pa.granted_by,
      pa.granted_at,
      pa.note
    from public.platform_admins pa
    order by pa.granted_at asc;
end;
$$;

create or replace function public.admin_grant_platform_admin(p_user_id text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin only.' using errcode = '42501';
  end if;
  if coalesce(trim(p_user_id), '') = '' then
    raise exception 'user_id is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.org_members where user_id = p_user_id) then
    raise exception 'That account has never signed in to Handychapter.' using errcode = '22023';
  end if;

  insert into public.platform_admins (user_id, granted_by, note)
  values (p_user_id, public.caller_uid(), p_note)
  on conflict (user_id) do update set note = excluded.note;

  perform public.log_platform_admin_action(null, 'platform_admin_granted', jsonb_build_object('target_user_id', p_user_id, 'note', p_note));
end;
$$;

create or replace function public.admin_revoke_platform_admin(p_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin only.' using errcode = '42501';
  end if;

  select count(*) into v_count from public.platform_admins;
  if v_count <= 1 then
    raise exception 'Cannot remove the last Platform Admin -- grant someone else first.' using errcode = '42501';
  end if;

  delete from public.platform_admins where user_id = p_user_id;
  perform public.log_platform_admin_action(null, 'platform_admin_revoked', jsonb_build_object('target_user_id', p_user_id));
end;
$$;

revoke all on function public.admin_list_platform_admins() from public, anon;
revoke all on function public.admin_grant_platform_admin(text, text) from public, anon;
revoke all on function public.admin_revoke_platform_admin(text) from public, anon;
grant execute on function public.admin_list_platform_admins() to authenticated;
grant execute on function public.admin_grant_platform_admin(text, text) to authenticated;
grant execute on function public.admin_revoke_platform_admin(text) to authenticated;
