-- 007c: RBAC prep -- public.save_user_profile existed as two overloads (7 and 8 args). The client
-- sends the 7 named args, which matched both, so PostgREST returned PGRST203 ("could not choose
-- the best candidate function") on every call and the client silently fell back to a direct
-- profiles upsert. Kept the 7-arg version: it matches the client exactly, and unlike the 8-arg
-- one it does not blank an existing avatar_url/bio when they aren't passed.
--
-- Both overloads are SECURITY DEFINER (bypass RLS) and write whatever p_user_id they are given.
-- Migration 008 must add `p_user_id = public.caller_uid()` to the kept function, or it becomes a
-- way around the self-only profiles policy. Not added here: production still calls it with the
-- anon key until the Firebase-token client ships, so the check would break every profile save.
--
-- APPLIED to oleckbfrkpmoikpkjcpa on 2026-09-25 via the Supabase MCP server.

drop function if exists public.save_user_profile(text, text, text, text, text, text, text, boolean);

alter function public.save_user_profile(text, text, text, text, text, text, boolean) set search_path = '';
