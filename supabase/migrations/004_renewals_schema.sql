-- 004: bni-rrc migration — Phase 1 of the bni-rrc -> Handychapter migration plan
-- (see docs/BNI_RRC_MIGRATION.md for the full plan this belongs to).
--
-- Ports bni-rrc's entire schema (originally 15 incremental migrations,
-- 001_initial_schema.sql .. 015_member_aliases.sql) into Handychapter's Supabase
-- project, collapsed to their FINAL state and written into a dedicated
-- `renewals` schema rather than `public`.
--
-- WHY A SEPARATE SCHEMA, NOT `public`: bni-rrc has its own table named `members`
-- with entirely different columns (name/industry/sponsor/report_role/is_committee/
-- auth_user_id -- a stable per-person identity record) from Handychapter's
-- EXISTING `public.members` table (org_id/user_id/per-batch PALMS stats/score/
-- traffic_light/batch_name -- a per-import roster snapshot). Applying bni-rrc's
-- migrations against `public` would collide outright. `renewals.members` and
-- `public.members` are different tables in different schemas -- zero collision,
-- fully reversible with `DROP SCHEMA renewals CASCADE` at any point before real
-- data or application code depends on it.
--
-- WHAT WAS DELIBERATELY LEFT OUT vs the original 15 migrations:
--   - Original 003_reset_active_renewal_tasks.sql: a one-off DATA repair
--     (deleted and regenerated open renewal_tasks for bni-rrc's then-existing
--     active cycles). Meaningless against a schema with no rows yet -- this
--     file only ports the SCHEMA. If/when Phase 4 imports bni-rrc's real
--     historical data, review that original migration for whether an
--     equivalent one-time fixup is still needed against the imported rows.
--   - The `do $$ ... $$` block at the end of original 015_member_aliases.sql:
--     a one-off dedup fix for a specific real member name collision
--     ("Kunnal Gupta" vs "Kunal Gupta") in bni-rrc's own data. Same reasoning
--     -- irrelevant until real data exists here.
--   - Every intermediate CHECK-constraint churn (task_type and source_type
--     each had their constraint dropped and re-added 2-3 times across the
--     original migrations as new enum values were added). This file writes
--     the FINAL constraint directly rather than replaying that history.
--
-- RLS: kept as close to bni-rrc's original policies as possible (see the note
-- above the RLS section) rather than inventing a new scheme -- per the
-- migration plan, this schema should inherit whatever Handychapter's own
-- Firebase-auth-vs-Supabase-RLS resolution turns out to be (see
-- 003_enable_rls.sql and docs/SECURITY_REMEDIATION.md), not solve it twice.

create schema if not exists renewals;

-- pgcrypto is almost certainly already enabled in this project (gen_random_uuid()
-- is used throughout the existing public schema), but this is idempotent either way.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Trigger function (schema-scoped copy; does not touch/replace anything the
-- public schema already defines)
-- ---------------------------------------------------------------------------
create or replace function renewals.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core tables (original 001_initial_schema.sql)
-- ---------------------------------------------------------------------------
create table renewals.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  industry text,
  sponsor text,
  report_role text,
  is_committee boolean not null default false,
  member_since date,                 -- added by original 006_member_since.sql
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index members_name_industry_unique
on renewals.members (lower(name), lower(coalesce(industry, '')));

create table renewals.renewal_cycles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  renewal_year integer not null,
  renewal_date date not null,
  status text not null default 'active'
    check (status in ('active', 'renewed', 'dropped')),
  source_membership_status text,
  auto_renewal_enabled boolean not null default false,
  last_followup_date date,
  next_followup_date date,
  online_form_filled boolean not null default false,
  online_form_filled_date date,
  checklist_filled boolean not null default false,
  checklist_filled_date date,
  payment_link_generated boolean not null default false,
  payment_link_generated_date date,
  payment_made boolean not null default false,
  payment_made_date date,
  reported_due_date date,                          -- added by original 010
  is_two_year_renewal boolean not null default false, -- added by original 010
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, renewal_year)
);

create table renewals.renewal_assignments (
  id uuid primary key default gen_random_uuid(),
  renewal_cycle_id uuid not null references renewals.renewal_cycles(id) on delete cascade,
  assignee_member_id uuid not null references renewals.members(id) on delete restrict,
  slot smallint not null check (slot in (1, 2)),
  created_at timestamptz not null default now(),
  unique (renewal_cycle_id, slot),
  unique (renewal_cycle_id, assignee_member_id)
);

-- task_type constraint is the FINAL set (original had only 6 values;
-- 'payment_due' was added by original 002_active_workflow_tasks.sql)
create table renewals.renewal_tasks (
  id uuid primary key default gen_random_uuid(),
  renewal_cycle_id uuid not null references renewals.renewal_cycles(id) on delete cascade,
  task_type text not null check (
    task_type in (
      'mc_discussion',
      'member_discussion',
      'monthly_review',
      'renewal_push',
      'docs_collection',
      'payment_due',
      'critical_deadline'
    )
  ),
  due_date date not null,
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index renewal_tasks_one_open_per_type
on renewals.renewal_tasks (renewal_cycle_id, task_type)
where status = 'open';

-- source_type constraint is the FINAL set (grew across original 008/012/013/014)
create table renewals.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  report_date date,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  error_message text,
  source_type text not null default 'unknown'
    check (
      source_type in (
        'unknown',
        'membership_dues_xls',
        'traffic_lights_pdf',
        'traffic_lights_xlsx',
        'palms_chapter_summary',
        'membership_length_pdf',
        'chapter_sponsor_report',
        'chapter_member_training_report'
      )
    ),
  source_chapter_name text,
  source_report_from date,
  source_report_to date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index import_batches_source_window_idx
on renewals.import_batches (source_type, source_chapter_name, source_report_from, source_report_to);

create trigger members_set_updated_at
before update on renewals.members
for each row execute function renewals.set_updated_at();

create trigger renewal_cycles_set_updated_at
before update on renewals.renewal_cycles
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_traffic_lights (original 004, extended by 009's report-window columns)
-- ---------------------------------------------------------------------------
create table renewals.member_traffic_lights (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  report_month date not null,
  score integer not null check (score >= 0 and score <= 100),
  color text not null check (color in ('green', 'yellow', 'red', 'grey')),
  present_count integer not null default 0,
  absent_count integer not null default 0,
  late_count integer not null default 0,
  medical_count integer not null default 0,
  substitute_count integer not null default 0,
  referrals_given integer not null default 0,
  referrals_received integer not null default 0,
  visitors integer not null default 0,
  testimonials integer not null default 0,
  tyfcb numeric,
  trainings integer not null default 0,
  week_count integer not null default 0,
  report_window_start date,   -- added by original 009
  report_window_end date,     -- added by original 009
  import_batch_id uuid references renewals.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, report_month)
);

create index member_traffic_lights_member_month_idx
on renewals.member_traffic_lights (member_id, report_month desc);

create index member_traffic_lights_report_window_idx
on renewals.member_traffic_lights (member_id, report_window_end desc, report_month desc);

create trigger member_traffic_lights_set_updated_at
before update on renewals.member_traffic_lights
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_palms_snapshots (original 005)
-- ---------------------------------------------------------------------------
create table renewals.member_palms_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  chapter_name text not null,
  report_from date not null,
  report_to date not null,
  run_at timestamptz,
  present_count integer not null default 0,
  absent_count integer not null default 0,
  late_count integer not null default 0,
  medical_count integer not null default 0,
  substitute_count integer not null default 0,
  referrals_given_inside integer not null default 0,
  referrals_given_outside integer not null default 0,
  referrals_received_inside integer not null default 0,
  referrals_received_outside integer not null default 0,
  visitors integer not null default 0,
  one_to_ones numeric not null default 0,
  tyfcb numeric,
  ceu integer not null default 0,
  trainings integer not null default 0,
  import_batch_id uuid references renewals.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, chapter_name, report_from, report_to)
);

create index member_palms_snapshots_member_report_to_idx
on renewals.member_palms_snapshots (member_id, report_to desc);

create trigger member_palms_snapshots_set_updated_at
before update on renewals.member_palms_snapshots
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- chapter_roles / member_past_roles (original 007)
-- NOTE: these are a free-form catalog of historical BNI leadership titles for
-- bio/achievements display -- NOT an authorization-role concept. Do not
-- confuse with Handychapter's own owner/admin/member RBAC in public.org_members.
-- ---------------------------------------------------------------------------
create table renewals.chapter_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table renewals.member_past_roles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  role_id uuid not null references renewals.chapter_roles(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, role_id)
);

create index member_past_roles_member_display_order_idx
on renewals.member_past_roles (member_id, display_order asc, created_at asc);

create trigger chapter_roles_set_updated_at
before update on renewals.chapter_roles
for each row execute function renewals.set_updated_at();

create trigger member_past_roles_set_updated_at
before update on renewals.member_past_roles
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_sponsor_achievements (original 011)
-- ---------------------------------------------------------------------------
create table renewals.member_sponsor_achievements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  sponsored_first_name text not null,
  sponsored_last_name text not null default '',
  sponsored_full_name text not null,
  sponsored_region text,
  sponsored_chapter text not null default '',
  application_date date not null,
  import_batch_id uuid references renewals.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, sponsored_full_name, application_date, sponsored_chapter)
);

create index member_sponsor_achievements_member_application_idx
on renewals.member_sponsor_achievements (member_id, application_date desc);

create trigger member_sponsor_achievements_set_updated_at
before update on renewals.member_sponsor_achievements
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_training_achievements (original 013)
-- ---------------------------------------------------------------------------
create table renewals.member_training_achievements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  chapter_name text not null default '',
  region_name text,
  event_date date not null,
  event_type text not null,
  role text,
  join_date date,
  induction_date date,
  import_batch_id uuid references renewals.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, chapter_name, event_date, event_type)
);

create index member_training_achievements_member_event_idx
on renewals.member_training_achievements (member_id, event_date desc);

create trigger member_training_achievements_set_updated_at
before update on renewals.member_training_achievements
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_aliases (original 015 -- schema only; the one-off dedup data-fix
-- block from the original file is deliberately not replayed here, see the
-- file header)
-- ---------------------------------------------------------------------------
create table renewals.member_aliases (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references renewals.members(id) on delete cascade,
  alias_name text not null,
  normalized_alias_name text not null,
  source text not null default 'manual'
    check (source in ('manual', 'rename', 'import_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, normalized_alias_name)
);

create index member_aliases_normalized_alias_name_idx
on renewals.member_aliases (normalized_alias_name);

create trigger member_aliases_set_updated_at
before update on renewals.member_aliases
for each row execute function renewals.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Kept intentionally identical in INTENT to bni-rrc's original policies: read
-- open to any authenticated user, writes gated on a `renewals.members` row
-- where auth_user_id = auth.uid() and is_committee = true.
--
-- IMPORTANT, carried over from bni-rrc as a known fact, not a new problem:
-- in bni-rrc itself, NOTHING ever populates auth_user_id or checks
-- is_committee -- every API route there uses the service-role key, which
-- bypasses RLS entirely. These policies were effectively dead code there too.
-- Under Handychapter, auth.uid() additionally won't resolve for
-- Firebase-authenticated users at all (same issue documented in
-- 003_enable_rls.sql / docs/SECURITY_REMEDIATION.md). Do not treat this as
-- solved -- it inherits whichever resolution that document lands on. Until
-- then, anything writing here should go through a Supabase Edge Function
-- using the service-role key (per the approved migration plan, Phase 2),
-- exactly like bni-rrc's own API routes already did.
-- ---------------------------------------------------------------------------
alter table renewals.members enable row level security;
alter table renewals.renewal_cycles enable row level security;
alter table renewals.renewal_assignments enable row level security;
alter table renewals.renewal_tasks enable row level security;
alter table renewals.import_batches enable row level security;
alter table renewals.member_traffic_lights enable row level security;
alter table renewals.member_palms_snapshots enable row level security;
alter table renewals.chapter_roles enable row level security;
alter table renewals.member_past_roles enable row level security;
alter table renewals.member_sponsor_achievements enable row level security;
alter table renewals.member_training_achievements enable row level security;
alter table renewals.member_aliases enable row level security;

create policy "authenticated members read" on renewals.members
  for select to authenticated using (true);
create policy "committee members write" on renewals.members
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated renewal read" on renewals.renewal_cycles
  for select to authenticated using (true);
create policy "committee renewal write" on renewals.renewal_cycles
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated assignment read" on renewals.renewal_assignments
  for select to authenticated using (true);
create policy "committee assignment write" on renewals.renewal_assignments
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated task read" on renewals.renewal_tasks
  for select to authenticated using (true);
create policy "committee task write" on renewals.renewal_tasks
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated import read" on renewals.import_batches
  for select to authenticated using (true);
create policy "committee import write" on renewals.import_batches
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated traffic lights read" on renewals.member_traffic_lights
  for select to authenticated using (true);
create policy "committee traffic lights write" on renewals.member_traffic_lights
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated palms snapshots read" on renewals.member_palms_snapshots
  for select to authenticated using (true);
create policy "committee palms snapshots write" on renewals.member_palms_snapshots
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

-- chapter_roles / member_past_roles: open read+write to any authenticated
-- user in the original too (not committee-gated) -- carried over as-is.
create policy "authenticated chapter roles read" on renewals.chapter_roles
  for select to authenticated using (true);
create policy "authenticated chapter roles write" on renewals.chapter_roles
  for all to authenticated using (true) with check (true);

create policy "authenticated member past roles read" on renewals.member_past_roles
  for select to authenticated using (true);
create policy "authenticated member past roles write" on renewals.member_past_roles
  for all to authenticated using (true) with check (true);

create policy "authenticated sponsor achievements read" on renewals.member_sponsor_achievements
  for select to authenticated using (true);
create policy "committee sponsor achievements write" on renewals.member_sponsor_achievements
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

create policy "authenticated training achievements read" on renewals.member_training_achievements
  for select to authenticated using (true);
create policy "committee training achievements write" on renewals.member_training_achievements
  for all to authenticated
  using (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true))
  with check (exists (select 1 from renewals.members m where m.auth_user_id = auth.uid() and m.is_committee = true));

-- member_aliases: open read+write in the original too -- carried over as-is.
create policy "authenticated member aliases read" on renewals.member_aliases
  for select to authenticated using (true);
create policy "authenticated member aliases write" on renewals.member_aliases
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- IMPORTANT — this migration is NOT applied automatically.
-- Review it, then apply via the Supabase Dashboard SQL editor or
-- `supabase db push`, exactly like 002/003 before it. Verify afterward with:
--   select table_name from information_schema.tables where table_schema = 'renewals';
-- and confirm 12 tables are listed, then:
--   DROP SCHEMA renewals CASCADE;
-- as a rollback drill in a branch/preview project BEFORE relying on it as a
-- real rollback path against the live project.
-- ---------------------------------------------------------------------------
