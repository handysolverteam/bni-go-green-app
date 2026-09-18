-- 005: Scheduled trigger for renewal-task generation (Phase 4 of the
-- bni-rrc -> Handychapter migration, see docs/BNI_RRC_MIGRATION.md).
--
-- This is the first scheduled job in this Supabase project. It calls the
-- generate-renewal-tasks Edge Function (supabase/functions/generate-renewal-tasks)
-- once a day via pg_cron + pg_net, the standard Supabase pattern for
-- cron-triggered Edge Function calls.
--
-- IMPORTANT — this migration is NOT applied automatically, same as 002/003/004.
-- Prerequisites before applying:
--   1. supabase/functions/generate-renewal-tasks must already be deployed
--      (supabase functions deploy generate-renewal-tasks).
--   2. The project's anon key must be stored in Supabase Vault under the name
--      'project_anon_key' (see step below) -- NOT pasted directly into this
--      file, so it never ends up in git history. Vault-based secret storage
--      is Supabase's own documented pattern for this exact case.
--   3. A monitoring plan: this is the project's first scheduled job. After
--      applying, check Database > Cron in the Supabase Dashboard for run
--      history, and the generate-renewal-tasks function's own Invocations
--      log, to confirm it's actually firing and succeeding -- a silently
--      failing cron job is worse than no automation, since it creates a
--      false sense of coverage. No alerting is wired up here; that is a
--      separate decision for whoever owns this project's on-call posture.
--
-- To store the anon key in Vault (run once, via the Supabase Dashboard SQL
-- editor -- not from this migration file, so the real key value is never
-- committed to the repo):
--   select vault.create_secret('<your VITE_SUPABASE_ANON_KEY value>', 'project_anon_key');

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Replace with your project's actual functions URL before applying --
-- this project's ref is oleckbfrkpmoikpkjcpa (see .env / docs), but this is
-- written as a placeholder rather than assumed-correct hardcoded value since
-- the schema/scheduling has never been applied or tested against the live
-- project in this session.
select cron.schedule(
  'generate-renewal-tasks-daily',
  '0 3 * * *', -- 03:00 UTC daily -- adjust to the chapter's actual timezone/cadence
  $$
  select net.http_post(
    url := 'https://oleckbfrkpmoikpkjcpa.supabase.co/functions/v1/generate-renewal-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect scheduled jobs:      select * from cron.job;
-- To inspect run history:         select * from cron.job_run_details order by start_time desc limit 20;
-- To remove this schedule:        select cron.unschedule('generate-renewal-tasks-daily');
