-- 015: Traffic Lights import history.
--
-- One row per import (and per removal) of a weekly BNI report: which file, which week, how many rows, who and
-- when, and whether it replaced an earlier import of the same week. Append-only: members of the chapter can read it,
-- Admin/Superadmin can add to it, nobody can edit or delete a row (it goes away only with its chapter).
--
-- Run AFTER 014. Imports done before this migration are backfilled below: one row per week and report type, using
-- the import time and uploader that 014 already stored. Their file name was never saved, so it stays empty.

create table if not exists public.traffic_import_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  action text not null default 'import' check (action in ('import', 'remove')),
  -- 'both' only for a removal (a removed week loses its PALMS and its Sponsor rows together).
  kind text not null check (kind in ('palms', 'sponsor', 'both')),
  week_from date not null,
  week_to date not null,
  meeting_date date not null,
  filename text,
  rows_imported int not null default 0,
  -- This import replaced a week that was already imported.
  replaced boolean not null default false,
  imported_by text,
  imported_by_name text,
  imported_at timestamptz not null default now()
);

create index if not exists traffic_import_log_org_time_idx
  on public.traffic_import_log (org_id, imported_at desc);

alter table public.traffic_import_log enable row level security;

revoke all on public.traffic_import_log from anon;
grant select, insert on public.traffic_import_log to authenticated;

create policy "traffic log read" on public.traffic_import_log for select to authenticated
  using (org_id in (select public.caller_org_ids()));
create policy "traffic log insert" on public.traffic_import_log for insert to authenticated
  with check (org_id in (select public.caller_admin_org_ids()));

-- Backfill: the weeks imported before this table existed (skipped if a week already has a history row).
insert into public.traffic_import_log (org_id, action, kind, week_from, week_to, meeting_date, filename, rows_imported, replaced, imported_by, imported_at)
select p.org_id, 'import', 'palms', p.week_from, p.week_to, min(p.meeting_date), null, count(*)::int, false,
       (array_agg(p.imported_by order by p.created_at))[1], min(p.created_at)
from public.traffic_palms_weeks p
where not exists (
  select 1 from public.traffic_import_log l
  where l.org_id = p.org_id and l.kind = 'palms' and l.week_from = p.week_from and l.week_to = p.week_to
)
group by p.org_id, p.week_from, p.week_to;

insert into public.traffic_import_log (org_id, action, kind, week_from, week_to, meeting_date, filename, rows_imported, replaced, imported_by, imported_at)
select s.org_id, 'import', 'sponsor', s.week_from, s.week_to, min(s.meeting_date), null,
       count(*) filter (where s.sponsor_name <> '' and s.sponsored_name <> '')::int, false,
       (array_agg(s.imported_by order by s.created_at))[1], min(s.created_at)
from public.traffic_sponsor_weeks s
where not exists (
  select 1 from public.traffic_import_log l
  where l.org_id = s.org_id and l.kind = 'sponsor' and l.week_from = s.week_from and l.week_to = s.week_to
)
group by s.org_id, s.week_from, s.week_to;
