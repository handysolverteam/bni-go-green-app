-- Tracks accounts that have gone through deleteUserAccount(), so the invite-link
-- auto-join flow (App.tsx) can distinguish "brand new invitee" from "just deleted
-- their account, using an old saved link" -- something the app has no other way to
-- tell apart, since deletion removes the profile/org_members rows that would
-- otherwise carry that history.
--
-- Deliberately NOT a blocklist: it doesn't prevent rejoining (a former member should
-- still be able to rejoin a chapter they're legitimately invited back to) -- it only
-- gates whether the app asks for an explicit confirmation first, instead of silently
-- auto-joining with zero friction the way a first-time invite link does.
--
-- APPLIED to the live Handychapter project (oleckbfrkpmoikpkjcpa) on 2026-09-23 via
-- the Supabase MCP server, alongside the deleteUserAccount() hardening in
-- src/services/supabaseService.ts and the rejoin-confirmation UI in App.tsx.
create table if not exists public.deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  last_user_id text,
  full_name text,
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_accounts_email_idx
on public.deleted_accounts (lower(email));

alter table public.deleted_accounts enable row level security;

-- Matches the same permissive posture every other public.* table currently has
-- (anon key + no real Supabase session for Firebase-authenticated users -- see
-- docs/SECURITY_REMEDIATION.md). A stricter policy on just this one table would be
-- security theater, not real protection, given the rest of the schema is already open.
create policy "Public access deleted_accounts" on public.deleted_accounts
for all using (true) with check (true);
