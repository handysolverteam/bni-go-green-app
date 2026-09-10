-- 003: Replace the permissive policies with real per-user Row Level Security.
--
-- PREREQUISITES — do not run this before both are true, or you will lock out every user:
--   1. Migration 002 applied (profiles.email backfilled)
--   2. The app is deployed with Supabase-only auth, so auth.uid() actually resolves
--
-- Apply to a Supabase *branch / staging* database first and run the checklist in
-- PROJECT_HANDOVER.md section 9 against it.
--
-- Context: every table previously carried `FOR ALL USING (true)`. RLS was enabled but the
-- policy permitted everything, so the public anon key could read all 787 members, all 12
-- profiles, and all 8 organizations with their join codes, with no login at all.

-- ---------------------------------------------------------------------------
-- Drop the permissive policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public full access organizations" ON public.organizations;
DROP POLICY IF EXISTS "Public full access org_members"   ON public.org_members;
DROP POLICY IF EXISTS "Public full access profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Public full access members"       ON public.members;
DROP POLICY IF EXISTS "Public full access outreach_logs" ON public.outreach_logs;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the lookup itself is not filtered by the policies that call it,
-- which would otherwise recurse. Locked to an empty search_path.
CREATE OR REPLACE FUNCTION public.caller_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid()::text;
$$;

CREATE OR REPLACE FUNCTION public.caller_admin_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid()::text AND role IN ('owner', 'admin');
$$;

REVOKE ALL ON FUNCTION public.caller_org_ids()       FROM public, anon;
REVOKE ALL ON FUNCTION public.caller_admin_org_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.caller_org_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_admin_org_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- members — chapter-scoped
-- ---------------------------------------------------------------------------
CREATE POLICY "members_org_read" ON public.members
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.caller_org_ids()));

CREATE POLICY "members_admin_write" ON public.members
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.caller_admin_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE POLICY "orgs_member_read" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.caller_org_ids()));

CREATE POLICY "orgs_admin_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id IN (SELECT public.caller_admin_org_ids()))
  WITH CHECK (id IN (SELECT public.caller_admin_org_ids()));

CREATE POLICY "orgs_create" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

-- Joining by 6-digit code needs to resolve a chapter the user is not yet a member of.
-- Keep that lookup on the server so the codes are not enumerable: see the
-- join_organization_by_code RPC below rather than granting a broad SELECT.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_self_write" ON public.profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "profiles_chaptermate_read" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    user_id IN (
      SELECT user_id FROM public.org_members
      WHERE org_id IN (SELECT public.caller_org_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------------
CREATE POLICY "org_members_read" ON public.org_members
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.caller_org_ids()));

CREATE POLICY "org_members_admin_write" ON public.org_members
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.caller_admin_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_admin_org_ids()));

-- A member may remove only their own membership (the Leave Chapter feature)
CREATE POLICY "org_members_self_leave" ON public.org_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- outreach_logs — private to the sender
-- ---------------------------------------------------------------------------
CREATE POLICY "outreach_logs_self" ON public.outreach_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Tables that had RLS switched off entirely
-- ---------------------------------------------------------------------------
ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_org_scoped" ON public.outreach_templates
  FOR ALL TO authenticated
  USING (org_id IS NULL OR org_id IN (SELECT public.caller_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_org_ids()));

ALTER TABLE public.ai_chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_org_scoped" ON public.ai_chat_history
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.caller_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_org_ids()));

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_logs_org_read" ON public.import_logs
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.caller_org_ids()));

CREATE POLICY "import_logs_admin_write" ON public.import_logs
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.caller_admin_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_admin_org_ids()));

-- ---------------------------------------------------------------------------
-- Joining by code, without making chapter codes enumerable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_organization_by_code(p_code TEXT)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org public.organizations;
  v_uid TEXT := auth.uid()::text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE code = trim(p_code);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid organization code';
  END IF;

  INSERT INTO public.org_members (org_id, user_id, user_email, role)
  VALUES (v_org.id, v_uid, auth.jwt() ->> 'email', 'member')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN v_org;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_organization_by_code(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verify: this must return ZERO rows when run with the anon key
--   SELECT * FROM public.members LIMIT 1;
-- ---------------------------------------------------------------------------
