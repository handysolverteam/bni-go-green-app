-- 013: Platform Admin "delete organization" -- implemented as a reversible archive, not a
-- physical delete. A chapter carries its whole roster, import history, templates and chat
-- sessions; a mis-clicked hard delete would be unrecoverable without a database restore, so
-- the row stays and `archived_at` hides it instead. A real hard delete, if ever wanted, should
-- be a separate deliberate step on top of this.

alter table public.organizations
  add column if not exists archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- Archive / restore. Platform-Admin only, enforced here rather than in the UI, and
-- audit-logged (platform_admin_audit_log.org_id has no FK to organizations on purpose, so
-- the record outlives whatever happens to the chapter).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_organization_archived(p_org_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform Admin access required.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = p_org_id;
  if not found then
    return jsonb_build_object('error', 'That chapter no longer exists.');
  end if;

  update public.organizations
     set archived_at = case when p_archived then now() else null end
   where id = p_org_id;

  perform public.log_platform_admin_action(
    p_org_id,
    case when p_archived then 'organization_archived' else 'organization_restored' end,
    jsonb_build_object(
      'name', coalesce(v_org.chapter_name, v_org.name),
      'code', v_org.code
    )
  );

  return jsonb_build_object('ok', true, 'archived', p_archived);
end;
$$;

revoke all on function public.admin_set_organization_archived(uuid, boolean) from public, anon;
grant execute on function public.admin_set_organization_archived(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- An archived chapter must stop accepting new members, otherwise a "deleted" chapter is still
-- reachable by anyone holding its 6-digit code. Same body as 008a otherwise -- only the
-- archived check below is new.
-- ---------------------------------------------------------------------------
create or replace function public.join_org_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := public.caller_uid();
  v_org public.organizations;
  v_member public.org_members;
begin
  if v_uid is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;

  select * into v_org from public.organizations where code = trim(coalesce(p_code, ''));
  if not found then
    return jsonb_build_object('error', 'Invalid 6-digit organization code. Please check and try again.');
  end if;

  if v_org.archived_at is not null then
    return jsonb_build_object('error', 'That chapter has been removed and can no longer be joined.');
  end if;

  select * into v_member from public.org_members where org_id = v_org.id and user_id = v_uid;
  if not found then
    insert into public.org_members (org_id, user_id, user_email, role)
    values (v_org.id, v_uid, coalesce(public.caller_email(), ''), 'member')
    returning * into v_member;
  end if;

  return jsonb_build_object('org', to_jsonb(v_org), 'member', to_jsonb(v_member));
end;
$$;

revoke all on function public.join_org_by_code(text) from public, anon;
grant execute on function public.join_org_by_code(text) to authenticated;
