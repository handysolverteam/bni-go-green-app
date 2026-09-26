-- 007d: RBAC -- lock down SECURITY DEFINER functions that the app never calls.
--
-- SECURITY DEFINER functions bypass RLS entirely, and all of these were executable by `anon`
-- (i.e. anyone holding the public anon key shipped in the website bundle), with no check on
-- who is calling. purge_all_bni_chapter_data(org_id) alone lets anyone wipe any chapter.
--
-- Checked before writing this (2026-09-25):
--   - no reference in src/, supabase/functions/, or any other repo code (only docs/PROJECT_HANDOVER.md)
--   - not referenced by any RLS policy or any other function in public/renewals
--   - zero calls to any of them in the API logs over the previous 24h
--   - bni-rrc uses its own Supabase project, so it cannot call these
--
-- service_role (Edge Functions, Dashboard SQL editor) keeps access. Fully reversible:
--   grant execute on function public.<name>(<args>) to anon, authenticated;
--
-- APPLIED to oleckbfrkpmoikpkjcpa on 2026-09-25 via the Supabase MCP server, with user approval.

revoke execute on function public.purge_all_bni_chapter_data(uuid) from public, anon, authenticated;
revoke execute on function public.save_single_bni_member(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_org_summary(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_chapter_ai_context(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_org_ids() from public, anon, authenticated;
revoke execute on function public.check_admin_setup() from public, anon, authenticated;
revoke execute on function public.verify_admin_password(text) from public, anon, authenticated;
revoke execute on function public.get_app_defaults() from public, anon, authenticated;
