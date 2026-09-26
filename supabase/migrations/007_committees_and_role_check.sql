-- 007: RBAC Phase 1 — additive schema for the 5-role model (Superadmin/Admin/Member
-- hierarchy + Go Green/RRC committee tags). See the approved plan for the full design;
-- this migration deliberately changes ZERO enforcement — no RLS policy references any
-- of this yet (that's migration 008, a separate, staged cutover). Purely additive and
-- reversible: nothing here can lock anyone out or change what any existing query returns.
--
-- Two things this migration is NOT:
--   - NOT a role rename. org_members.role keeps its existing values ('owner', 'admin',
--     'member') — 8 live organizations and every existing call site already use these
--     three strings. "Superadmin (President)" / "Admin (Vice-President)" are UI-facing
--     labels only (src/lib/roles.ts), mapped onto the same DB values. Renaming the
--     column's actual values would touch every row and every call site for zero
--     functional gain.
--   - NOT an RLS migration. RLS enforcement (real auth.jwt()->>'sub' based policies,
--     the Third-Party-Auth-for-Firebase cutover) is migration 008, applied only after
--     the cutover is verified end-to-end on a staging branch. Applying that before this
--     one exists would be pointless (the policies would reference nothing); applying
--     RLS changes in the SAME migration as schema changes is exactly the kind of
--     big-bang move this project's migration history has deliberately avoided (see
--     docs/BNI_RRC_MIGRATION.md's phased approach).

-- ---------------------------------------------------------------------------
-- org_members.role — add the missing CHECK constraint (was previously enforced
-- client-side only; the DB has always accepted any string in this column).
-- ---------------------------------------------------------------------------
alter table public.org_members
  add constraint org_members_role_check check (role in ('owner', 'admin', 'member'));

-- ---------------------------------------------------------------------------
-- Committee tags — a join table, not boolean columns on org_members. A member can
-- hold zero, one, or both tags, independent of their owner/admin/member role. Adding
-- a third committee later is a one-line CHECK edit here, not a schema change touching
-- every `select *` against org_members.
--
-- The composite FK to org_members(org_id, user_id) (that exact pair is already unique
-- there, per its own `unique_org_user` constraint) means a tag can never exist for a
-- non-member, and leaving an org (org_members row deleted) cascades the tag away for
-- free — no extra cleanup code needed in leaveOrganization()/deleteUserAccount().
-- ---------------------------------------------------------------------------
create table if not exists public.member_committees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id text not null,
  committee text not null check (committee in ('go_green', 'rrc')),
  granted_by text,
  granted_at timestamptz not null default now(),
  unique (org_id, user_id, committee),
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);

create index if not exists member_committees_org_user_idx
on public.member_committees (org_id, user_id);

-- RLS enabled now (so it's never accidentally left open), but with the SAME permissive
-- posture every other public.* table currently has — real policies land in migration
-- 008 alongside everything else, not piecemeal per-table.
alter table public.member_committees enable row level security;
create policy "Public access member_committees" on public.member_committees
for all using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Reconciling the new RRC committee tag with renewals.members.is_committee (added by
-- migration 004, dormant ever since — nothing populates it or auth_user_id).
--
-- auth_user_id (uuid, references auth.users) CANNOT hold a Firebase UID: Supabase's
-- Third-Party Auth for Firebase (the planned RLS mechanism) never writes Firebase
-- identities into auth.users — that table belongs solely to Supabase's own native
-- GoTrue auth. A new, separate column is required; auth_user_id is left in place,
-- untouched (harmless, optional cleanup later, not required now).
-- ---------------------------------------------------------------------------
alter table renewals.members add column if not exists firebase_uid text;

create index if not exists renewals_members_firebase_uid_idx
on renewals.members (firebase_uid);

-- ---------------------------------------------------------------------------
-- RLS helper functions for the eventual migration 008 cutover — created now (harmless
-- until a policy actually calls one) so 008 is a smaller, easier-to-review diff.
--
-- IMPORTANT: these use auth.jwt() ->> 'sub' (text), NOT auth.uid(). auth.uid() casts
-- the JWT sub claim to uuid, and Firebase UIDs are 28-character base62 strings, not
-- UUID-formatted — that cast throws "invalid input syntax for type uuid", it does not
-- return null. Every policy in this project referencing the caller's identity must use
-- these functions (or the same pattern directly), never auth.uid(). This corrects the
-- exact mistake the never-applied 003_enable_rls.sql made (it used auth.uid()::text
-- throughout, written before this project settled on Firebase as the permanent sole
-- identity provider).
-- ---------------------------------------------------------------------------
create or replace function public.caller_uid()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() ->> 'sub';
$$;

create or replace function public.caller_email()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() ->> 'email';
$$;

create or replace function public.caller_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members where user_id = (auth.jwt() ->> 'sub');
$$;

create or replace function public.caller_admin_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.org_members
  where user_id = (auth.jwt() ->> 'sub') and role in ('owner', 'admin');
$$;

create or replace function public.caller_is_owner(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (auth.jwt() ->> 'sub') and role = 'owner'
  );
$$;

create or replace function public.caller_committee_org_ids(p_committee text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.member_committees
  where user_id = (auth.jwt() ->> 'sub') and committee = p_committee;
$$;

revoke all on function public.caller_uid() from public, anon;
revoke all on function public.caller_email() from public, anon;
revoke all on function public.caller_org_ids() from public, anon;
revoke all on function public.caller_admin_org_ids() from public, anon;
revoke all on function public.caller_is_owner(uuid) from public, anon;
revoke all on function public.caller_committee_org_ids(text) from public, anon;
grant execute on function public.caller_uid() to authenticated;
grant execute on function public.caller_email() to authenticated;
grant execute on function public.caller_org_ids() to authenticated;
grant execute on function public.caller_admin_org_ids() to authenticated;
grant execute on function public.caller_is_owner(uuid) to authenticated;
grant execute on function public.caller_committee_org_ids(text) to authenticated;

-- renewals.* equivalents (for migration 008's renewals.* policy rewrite)
create or replace function renewals.caller_is_committee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from renewals.members m
    where m.is_committee = true
      and m.firebase_uid = (auth.jwt() ->> 'sub')
  );
$$;

create or replace function renewals.caller_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from renewals.members where firebase_uid = (auth.jwt() ->> 'sub') limit 1;
$$;

revoke all on function renewals.caller_is_committee() from public, anon;
revoke all on function renewals.caller_member_id() from public, anon;
grant execute on function renewals.caller_is_committee() to authenticated;
grant execute on function renewals.caller_member_id() to authenticated;

-- ---------------------------------------------------------------------------
-- NOT included in this migration, deliberately — do these as separate, reviewed steps:
--   - The public.members bulk-stamped user_id cleanup (dry-run SELECT first, reviewed
--     with the user, before any UPDATE — see the approved plan's "prerequisite data
--     cleanup" section). Touches real roster rows; does not belong bundled into a
--     schema-only migration.
--   - Populating renewals.members.firebase_uid / is_committee for any real RRC grant —
--     that's the sync-committee-tag Edge Function (Phase 3), not a migration.
--   - Any actual RLS policy change (migration 008, after the Third-Party Auth cutover
--     is verified on a staging branch).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED to the live Handychapter project (oleckbfrkpmoikpkjcpa) on 2026-09-24 via
-- the Supabase MCP server, in two parts: this migration, then a follow-up
-- (007b_lock_caller_helpers_search_path) adding `set search_path = ''` to
-- caller_uid()/caller_email() — the post-apply security advisor scan flagged these
-- two as the only new "mutable search_path" findings introduced by this migration
-- (every other advisory hit pre-dates it). Folded into this file so it matches what's
-- actually live. Phase 0's audit (see docs/BNI_RRC_MIGRATION.md-style tracking, or the
-- conversation log) also ran the bulk-stamped user_id dry-run here — found 5
-- organizations with one user_id spread across 79-237 roster rows each, a real data
-- defect requiring explicit user sign-off before the cleanup UPDATE runs (not part of
-- this migration; see the plan's "prerequisite data cleanup" step).
-- ---------------------------------------------------------------------------
