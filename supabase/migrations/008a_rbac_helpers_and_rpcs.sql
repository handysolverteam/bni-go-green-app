-- 008a: RBAC -- additive helpers and RPCs that the RLS cutover (008b) and the updated client
-- depend on. Changes nothing for existing callers: no policy uses these yet, and the two new
-- RPCs are only called by the updated frontend. Safe to apply before 008b.
--
-- Identity rules (see the approved RBAC plan):
--   - caller identity is auth.jwt()->>'sub' (Firebase UID), never auth.uid() (uuid cast throws)
--   - caller email counts only when Firebase says it is verified (Google sign-in)
--   - Member self-match is the Firebase-verified phone_number claim, last 10 digits
--
-- APPLIED to oleckbfrkpmoikpkjcpa on 2026-09-25. Verified with simulated Firebase claims in a
-- rolled-back transaction: phone10 normalisation, verified-email gating, join_org_by_code (bad
-- code -> error, real code -> joins as 'member' with the caller's own uid), and
-- get_import_file_data returning nothing to a plain member.

-- Last 10 digits of a phone number, or null if it has fewer. Immutable so it can back an index.
create or replace function public.phone10(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(d) = 10 then d end
  from (select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) as d) s;
$$;

create index if not exists members_org_phone10_idx on public.members (org_id, public.phone10(phone));

-- Verified email only (the app signs in with Google or phone, so email_verified is Google's word).
create or replace function public.caller_email()
returns text
language sql
stable
set search_path = ''
as $$
  select case when (auth.jwt() ->> 'email_verified')::boolean then lower(auth.jwt() ->> 'email') end;
$$;

create or replace function public.caller_phone10()
returns text
language sql
stable
set search_path = ''
as $$
  select public.phone10(auth.jwt() ->> 'phone_number');
$$;

-- Orgs where the caller sees the whole roster: Admin/Superadmin, or the go_green committee.
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
  where user_id = (auth.jwt() ->> 'sub') and committee = 'go_green';
$$;

-- Orgs with a membership row matching the caller's verified email (Firebase UID changed,
-- e.g. phone -> Google). Lets fetchUserOrganization() find and re-attach that row.
create or replace function public.caller_email_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members
  where public.caller_email() is not null and lower(user_email) = public.caller_email();
$$;

-- Full Renewals access: Admin/Superadmin of any org, or the rrc committee (renewals.* has no
-- org_id, so this cannot be narrowed to one chapter yet -- known gap, see the plan).
create or replace function renewals.caller_has_full_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where user_id = (auth.jwt() ->> 'sub') and role in ('owner', 'admin')
  ) or exists (
    select 1 from public.member_committees
    where user_id = (auth.jwt() ->> 'sub') and committee = 'rrc'
  );
$$;

-- Invite-code join. Replaces the client's "select organizations by code" + "insert org_members",
-- which cannot work under RLS (a non-member must not be able to read arbitrary organizations).
-- Always joins as a plain member, as the caller themselves.
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

  select * into v_member from public.org_members where org_id = v_org.id and user_id = v_uid;
  if not found then
    insert into public.org_members (org_id, user_id, user_email, role)
    values (v_org.id, v_uid, coalesce(public.caller_email(), ''), 'member')
    returning * into v_member;
  end if;

  return jsonb_build_object('org', to_jsonb(v_org), 'member', to_jsonb(v_member));
end;
$$;

-- The stored upload is the whole roster, so only full-roster callers may download it.
create or replace function public.get_import_file_data(p_log_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.file_data from public.import_logs l
  where l.id = p_log_id and l.org_id in (select public.caller_full_roster_org_ids());
$$;

revoke all on function public.caller_phone10() from public, anon;
revoke all on function public.caller_full_roster_org_ids() from public, anon;
revoke all on function public.caller_email_org_ids() from public, anon;
revoke all on function renewals.caller_has_full_access() from public, anon;
revoke all on function public.join_org_by_code(text) from public, anon;
revoke all on function public.get_import_file_data(uuid) from public, anon;
grant execute on function public.caller_phone10() to authenticated;
grant execute on function public.caller_full_roster_org_ids() to authenticated;
grant execute on function public.caller_email_org_ids() to authenticated;
grant execute on function renewals.caller_has_full_access() to authenticated;
grant execute on function public.join_org_by_code(text) to authenticated;
grant execute on function public.get_import_file_data(uuid) to authenticated;
