-- Rollback for 008b_rls_cutover.sql: restores the exact pre-cutover state (wide-open policies,
-- unchecked RPCs, file_data readable, outreach_templates RLS off). Policy text generated from
-- pg_policies on 2026-09-25, immediately before 008b was written. 008a is left in place (it is
-- additive and harmless).

begin;

-- New policies out
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where (schemaname = 'public' or schemaname = 'renewals') and policyname like 'rbac %'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

drop trigger if exists guard_org_member_update on public.org_members;
drop trigger if exists guard_member_update on public.members;
drop function if exists public.guard_org_member_update();
drop function if exists public.guard_member_update();

-- Wrappers out, originals back under their real names
drop function if exists public.save_user_profile(text, text, text, text, text, text, boolean);
drop function if exists public.import_bni_report(uuid, text, text, text, text, jsonb);
drop function if exists public.delete_bni_report_batch(uuid, text, text);
drop function if exists public.batch_update_member_details(uuid, jsonb);
drop function if exists public.query_chapter_ai(uuid, text);
drop function if exists public.create_bni_organization(text, text, text, text, text, text);

alter function public.save_user_profile_unchecked(text, text, text, text, text, text, boolean) rename to save_user_profile;
alter function public.import_bni_report_unchecked(uuid, text, text, text, text, jsonb) rename to import_bni_report;
alter function public.delete_bni_report_batch_unchecked(uuid, text, text) rename to delete_bni_report_batch;
alter function public.batch_update_member_details_unchecked(uuid, jsonb) rename to batch_update_member_details;
alter function public.query_chapter_ai_unchecked(uuid, text) rename to query_chapter_ai;
alter function public.create_bni_organization_unchecked(text, text, text, text, text, text) rename to create_bni_organization;

grant execute on function public.save_user_profile(text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.import_bni_report(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.delete_bni_report_batch(uuid, text, text) to anon, authenticated;
grant execute on function public.batch_update_member_details(uuid, jsonb) to anon, authenticated;
grant execute on function public.query_chapter_ai(uuid, text) to anon, authenticated;
grant execute on function public.create_bni_organization(text, text, text, text, text, text) to anon, authenticated;

grant select on public.import_logs to anon, authenticated;
alter table public.outreach_templates disable row level security;

-- Original policies
create policy "Allow users to delete their org chat history" on public.ai_chat_history as PERMISSIVE for DELETE to public using (true);
create policy "Allow users to insert into org chat history" on public.ai_chat_history as PERMISSIVE for INSERT to public with check (true);
create policy "Allow users to read their org chat history" on public.ai_chat_history as PERMISSIVE for SELECT to public using (true);
create policy "authenticated ai chat delete" on public.ai_chat_messages as PERMISSIVE for DELETE to authenticated using (true);
create policy "authenticated ai chat read" on public.ai_chat_messages as PERMISSIVE for SELECT to authenticated using (true);
create policy "authenticated ai chat write" on public.ai_chat_messages as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Public full access settings" on public.chapter_settings as PERMISSIVE for ALL to public using (true);
create policy p_open_chapter_settings on public.chapter_settings as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Allow all access to companion_requests" on public.companion_requests as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access deleted_accounts" on public.deleted_accounts as PERMISSIVE for ALL to public using (true) with check (true);
create policy p_open_import_logs on public.import_logs as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access member_committees" on public.member_committees as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access members" on public.members as PERMISSIVE for ALL to public using (true);
create policy "Public full access members" on public.members as PERMISSIVE for ALL to public using (true);
create policy p_open_members on public.members as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access org_members" on public.org_members as PERMISSIVE for ALL to public using (true);
create policy p_open_org_members on public.org_members as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access organizations" on public.organizations as PERMISSIVE for ALL to public using (true);
create policy p_open_organizations on public.organizations as PERMISSIVE for ALL to public using (true) with check (true);
create policy p_orgs on public.organizations as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access outreach_logs" on public.outreach_logs as PERMISSIVE for ALL to public using (true);
create policy "Public full access logs" on public.outreach_logs as PERMISSIVE for ALL to public using (true);
create policy p_open_outreach_logs on public.outreach_logs as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Public access profiles" on public.profiles as PERMISSIVE for ALL to public using (true);
create policy p_open_profiles on public.profiles as PERMISSIVE for ALL to public using (true) with check (true);
create policy "Allow all access to user_sessions" on public.user_sessions as PERMISSIVE for ALL to public using (true) with check (true);
create policy "authenticated chapter roles read" on renewals.chapter_roles as PERMISSIVE for SELECT to authenticated using (true);
create policy "authenticated chapter roles write" on renewals.chapter_roles as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated import read" on renewals.import_batches as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee import write" on renewals.import_batches as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated member aliases read" on renewals.member_aliases as PERMISSIVE for SELECT to authenticated using (true);
create policy "authenticated member aliases write" on renewals.member_aliases as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated palms snapshots read" on renewals.member_palms_snapshots as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee palms snapshots write" on renewals.member_palms_snapshots as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated member past roles read" on renewals.member_past_roles as PERMISSIVE for SELECT to authenticated using (true);
create policy "authenticated member past roles write" on renewals.member_past_roles as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "authenticated sponsor achievements read" on renewals.member_sponsor_achievements as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee sponsor achievements write" on renewals.member_sponsor_achievements as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated traffic lights read" on renewals.member_traffic_lights as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee traffic lights write" on renewals.member_traffic_lights as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated training achievements read" on renewals.member_training_achievements as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee training achievements write" on renewals.member_training_achievements as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated members read" on renewals.members as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee members write" on renewals.members as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated assignment read" on renewals.renewal_assignments as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee assignment write" on renewals.renewal_assignments as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated renewal read" on renewals.renewal_cycles as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee renewal write" on renewals.renewal_cycles as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));
create policy "authenticated task read" on renewals.renewal_tasks as PERMISSIVE for SELECT to authenticated using (true);
create policy "committee task write" on renewals.renewal_tasks as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true))))) with check ((EXISTS ( SELECT 1 FROM renewals.members m WHERE ((m.auth_user_id = auth.uid()) AND (m.is_committee = true)))));

commit;

notify pgrst, 'reload schema';
