-- 002: Add profiles.email and backfill it.
--
-- Run this FIRST, before switching authentication to Supabase (migration 003).
--
-- Why: profiles is keyed on user_id, which held Firebase UIDs. Moving to Supabase Auth
-- changes every user's id, and profiles had no email column to re-link them by --
-- fetchUserProfile() queried `profiles.email` and `profiles.id`, neither of which existed,
-- so that recovery path silently failed on every call.
--
-- org_members.user_email is the only place the address is currently stored, so it is the
-- backfill source.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill from the membership rows
UPDATE public.profiles p
SET    email = m.user_email
FROM   public.org_members m
WHERE  m.user_id = p.user_id
  AND  p.email IS NULL
  AND  m.user_email IS NOT NULL
  AND  m.user_email <> '';

-- One profile per address, so the email lookup can use .maybeSingle() safely
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_key
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;

-- Verify before continuing: any row still NULL cannot be auto-relinked after the auth
-- switch, and that user will have to complete onboarding again.
--   SELECT user_id, full_name FROM public.profiles WHERE email IS NULL;
