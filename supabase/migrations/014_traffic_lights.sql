-- 014: Traffic Lights -- week-wise BNI chapter reports, saved per chapter (organization).
--
-- Two BNI exports are imported ONE WEEK at a time (Admin/Superadmin only):
--   * Chapter Summary PALMS Report  -> traffic_palms_weeks   (one row per member per imported week)
--   * Chapter Sponsor Report        -> traffic_sponsor_weeks (one row per sponsored person)
-- The Traffic Lights screen adds the weeks of the window it shows (last 6 months, all weeks, one week or a
-- custom range) and scores them with BNI's 100-point rules (src/lib/trafficLights/*).
--
-- Access (same helpers as the rest of the app, see 003 / 008b):
--   read   = any member of the chapter           -> caller_org_ids()
--   write  = Admin / Superadmin of the chapter    -> caller_admin_org_ids()
-- Everything is granted to `authenticated` only; signed-out (anon) gets nothing.
-- A re-import of the same week replaces that week's rows (the client deletes then inserts).

create table if not exists public.traffic_palms_weeks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- The report's own From:/To: dates, and the Wednesday meeting inside them (used to place the week in a window).
  week_from date not null,
  week_to date not null,
  meeting_date date not null,
  member_name text not null,
  p int not null default 0,
  a int not null default 0,
  l int not null default 0,
  m int not null default 0,
  s int not null default 0,
  rgi int not null default 0,
  rgo int not null default 0,
  rri int not null default 0,
  rro int not null default 0,
  visitors int not null default 0,
  one_to_ones int not null default 0,
  tyfcb numeric not null default 0,
  ceu numeric not null default 0,
  t int not null default 0,
  imported_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists traffic_palms_weeks_uq
  on public.traffic_palms_weeks (org_id, week_from, week_to, lower(member_name));
create index if not exists traffic_palms_weeks_meeting_idx
  on public.traffic_palms_weeks (org_id, meeting_date);

create table if not exists public.traffic_sponsor_weeks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  week_from date not null,
  week_to date not null,
  meeting_date date not null,
  -- Empty sponsor_name / sponsored_name = "this week's Sponsor Report was imported and nobody was sponsored".
  sponsor_name text not null,
  sponsored_name text not null,
  sponsored_chapter text,
  sponsored_region text,
  application_date date,
  imported_by text,
  created_at timestamptz not null default now()
);

create index if not exists traffic_sponsor_weeks_week_idx
  on public.traffic_sponsor_weeks (org_id, week_from, week_to);

alter table public.traffic_palms_weeks enable row level security;
alter table public.traffic_sponsor_weeks enable row level security;

revoke all on public.traffic_palms_weeks from anon;
revoke all on public.traffic_sponsor_weeks from anon;
grant select, insert, update, delete on public.traffic_palms_weeks to authenticated;
grant select, insert, update, delete on public.traffic_sponsor_weeks to authenticated;

create policy "traffic palms read" on public.traffic_palms_weeks for select to authenticated
  using (org_id in (select public.caller_org_ids()));
create policy "traffic palms insert" on public.traffic_palms_weeks for insert to authenticated
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "traffic palms update" on public.traffic_palms_weeks for update to authenticated
  using (org_id in (select public.caller_admin_org_ids()))
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "traffic palms delete" on public.traffic_palms_weeks for delete to authenticated
  using (org_id in (select public.caller_admin_org_ids()));

create policy "traffic sponsor read" on public.traffic_sponsor_weeks for select to authenticated
  using (org_id in (select public.caller_org_ids()));
create policy "traffic sponsor insert" on public.traffic_sponsor_weeks for insert to authenticated
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "traffic sponsor update" on public.traffic_sponsor_weeks for update to authenticated
  using (org_id in (select public.caller_admin_org_ids()))
  with check (org_id in (select public.caller_admin_org_ids()));
create policy "traffic sponsor delete" on public.traffic_sponsor_weeks for delete to authenticated
  using (org_id in (select public.caller_admin_org_ids()));
