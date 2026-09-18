# bni-rrc → Handychapter: Real Historical Data Import

Part of Phase 4 of the bni-rrc migration (`docs/BNI_RRC_MIGRATION.md`). This
step moves bni-rrc's **actual** production data — real members, real renewal
cycles, real task history — into Handychapter's `renewals` schema. Everything
before this point in the migration was code; this is the first step that
touches real chapter data, and it is **one-time and largely irreversible**
once anything downstream depends on it (though `DROP SCHEMA renewals CASCADE`
remains available as a full rollback up until that point).

This was written, not executed. No credentials to either Supabase project
(`oleckbfrkpmoikpkjcpa` / Handychapter, or bni-rrc's own project ref
`lvijvkqvruygdesgxvch`) are available in the session that wrote this —
running this is the user's own action, with their own access.

## Before starting — hard prerequisites

1. `supabase/migrations/004_renewals_schema.sql` applied to Handychapter's
   project and verified (`select table_name from information_schema.tables
   where table_schema = 'renewals';` returns 12 tables).
2. All 13 Edge Functions under `supabase/functions/` deployed and each one
   manually exercised at least once against a **test** file/payload — not
   just `deno check`-clean, actually invoked.
3. The Phase 3 Renewals UI clicked through in a real browser against that
   test data, confirming the Kanban board, task inbox, and member detail
   modal render correctly and the write actions (task complete/cancel,
   cycle status) actually persist.
4. A Supabase **branch or preview database** available to dry-run this
   import against before touching the production `oleckbfrkpmoikpkjcpa`
   project. Do not skip this — this is the point in the whole migration
   with the least room for a "just fix it after" recovery.

If any of the above isn't true yet, stop here and go do that first.

## What's being moved

bni-rrc's own Postgres tables (already faithfully carried into
`renewals.*` by migration 004, same shape, same names) — in dependency
order:

1. `chapter_roles` (no dependencies)
2. `members` (references `auth.users` optionally via `auth_user_id` — leave
   `null`, since nothing in bni-rrc ever populated it either)
3. `member_past_roles` (references `members`, `chapter_roles`)
4. `member_aliases` (references `members`)
5. `renewal_cycles` (references `members`)
6. `renewal_assignments` (references `renewal_cycles`, `members`)
7. `renewal_tasks` (references `renewal_cycles`)
8. `import_batches` (no FK dependencies, but logically referenced by the
   `import_batch_id` columns below)
9. `member_traffic_lights` (references `members`, optionally `import_batches`)
10. `member_palms_snapshots` (references `members`, optionally `import_batches`)
11. `member_sponsor_achievements` (references `members`, optionally `import_batches`)
12. `member_training_achievements` (references `members`, optionally `import_batches`)

Import in that order or foreign keys will reject the insert.

## Two ways to actually move the bytes

**Option A — `pg_dump` / `pg_restore` (recommended if you have direct
Postgres connection strings for both projects, e.g. `SUPABASE_DB_URL` from
bni-rrc's own `.env`):**

```bash
# 1. Dump bni-rrc's data only (no schema — Handychapter's 004 already defines it)
pg_dump "$BNI_RRC_DB_URL" \
  --data-only \
  --schema=public \
  --table=public.chapter_roles --table=public.members \
  --table=public.member_past_roles --table=public.member_aliases \
  --table=public.renewal_cycles --table=public.renewal_assignments \
  --table=public.renewal_tasks --table=public.import_batches \
  --table=public.member_traffic_lights --table=public.member_palms_snapshots \
  --table=public.member_sponsor_achievements --table=public.member_training_achievements \
  > bni_rrc_data.sql

# 2. Rewrite the schema qualifier: bni-rrc's dump says "public.members" etc.,
#    Handychapter's tables are "renewals.members". A dump taken with
#    --schema=public still emits unqualified "INSERT INTO members" in most
#    pg_dump versions when there's only one schema involved -- check the
#    output before relying on this substitution:
sed -i 's/INSERT INTO public\./INSERT INTO renewals./g; s/INSERT INTO members/INSERT INTO renewals.members/; ' bni_rrc_data.sql
#    (Verify the sed result matches your actual dump's exact INSERT syntax
#    before running it against anything -- pg_dump's output format varies
#    by version and by --column-inserts / --inserts flags.)

# 3. Restore into a Supabase BRANCH database first
psql "$HANDYCHAPTER_BRANCH_DB_URL" -f bni_rrc_data.sql

# 4. Verify row counts match bni-rrc's source before touching production
```

**Option B — CSV export/import via each project's Supabase Dashboard Table
Editor**, if direct `pg_dump` access isn't available. Export each of the 12
tables from bni-rrc's dashboard, then use the Dashboard's "Import data from
CSV" on the matching `renewals.*` table in Handychapter's project (in the
same dependency order above). More manual, but needs no CLI/connection
string, and each table can be spot-checked before moving to the next.

## Verification (do this against the branch DB, not production, first)

- Row counts per table match bni-rrc's source exactly.
- Spot-check 3-5 members' `renewal_cycles` and `renewal_tasks` render
  correctly in the Phase 3 Kanban board and match what bni-rrc's own UI
  shows for the same members.
- `renewal_assignments` slot uniqueness constraint
  (`unique (renewal_cycle_id, slot)`) didn't reject any rows silently —
  check `pg_restore`/`psql` output for constraint-violation warnings, not
  just the exit code.
- `member_id` foreign keys all resolved — a common failure mode is
  `members` rows failing to insert first (e.g. the
  `members_name_industry_unique` index rejecting a near-duplicate) and
  every dependent table then silently having nothing to reference.

## Rollback path

Before this step depends on anything downstream (i.e., before real users
are actively working renewal cycles through the new UI): `DROP SCHEMA
renewals CASCADE;` removes everything from this migration and the import
cleanly, verified once against a branch database per the original Phase 1
plan. After real usage begins, this stops being a real rollback option —
plan accordingly.

## Explicitly out of scope here

- Running this directly against `oleckbfrkpmoikpkjcpa` (Handychapter
  production) as the first attempt. Branch/preview first, always.
- Populating `members.auth_user_id` — bni-rrc never did this either; leave
  it `null` unless a separate decision is made to actually link chapter
  members to Handychapter user accounts (a bigger, separate feature, not
  assumed here).
- Automating this import as a repeatable script. It's one-time by design;
  a script that could be re-run risks silently duplicating data if run
  twice, which is a worse failure mode than a manual, checked process for
  something this consequential.
