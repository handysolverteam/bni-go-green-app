# bni-rrc → Handychapter Migration

## Context

`bni-rrc` (`E:/Work/bni-rrc`, Supabase project "BNI RRC", ref
`lvijvkqvruygdesgxvch`) is a **membership renewal workflow CRM** — a kanban
tracking each BNI chapter member's annual/biennial renewal through stages (MC
discussion → payment → renewed/dropped), with follow-up tasks, checklists,
and assignments. PALMS/traffic-light/TYFCB data is imported as **read-only
context** for that workflow (parsed straight from BNI's own PDF/XLSX
reports) — bni-rrc never computes a score itself, unlike Handychapter's own
100-point scoring engine.

Two things worth stating plainly since they weren't obvious going in:
- **bni-rrc has no Expo/React Native/native layer anywhere.** It's a pure
  Next.js 16 (App Router) web app built as an installable PWA.
- **bni-rrc has no authentication at all.** No login, no session, no
  middleware. Every API route uses the Supabase **service-role key**
  directly, bypassing RLS entirely. `members.auth_user_id` / `is_committee`
  exist in the schema and are referenced by RLS policies, but nothing in the
  app ever populates or checks them — vestigial.

**Decisions made (with the user, evidence-backed) before starting:**
1. **Data layer: consolidate** bni-rrc's schema into Handychapter's existing
   Supabase project (`oleckbfrkpmoikpkjcpa`), not a separate DB.
2. **Server logic → Supabase Edge Functions** (Handychapter already has one,
   `delete-user`) — not a new Node/Vercel backend, not client-side, since the
   import logic needs the service-role key.

## Schema collision — why everything lives in a `renewals` schema, not `public`

bni-rrc has a table named `members` with entirely different columns (name,
industry, sponsor, report_role, is_committee, auth_user_id — a stable
per-person identity record) from Handychapter's own `public.members` table
(org_id, user_id, per-batch PALMS stats, score, traffic_light, batch_name —
a per-import roster snapshot). Applying bni-rrc's migrations against `public`
would collide outright. `renewals.members` and `public.members` are
different tables in different schemas — zero collision, fully reversible
with `DROP SCHEMA renewals CASCADE` at any point before real data depends on
it.

## Phase 1 — done (isolated, additive, reversible)

- [x] `supabase/migrations/004_renewals_schema.sql` — all 15 of bni-rrc's
      original migrations (`001_initial_schema.sql`..`015_member_aliases.sql`),
      collapsed to their final state and schema-qualified into `renewals.*`.
      **Not yet applied** — review it, then apply via the Supabase Dashboard
      SQL editor or `supabase db push`, same as `002`/`003` before it.
- [x] `package.json` name field cleaned up (trailing whitespace).
- [x] `src/lib/renewals/` — ported business logic. **Deliberately excludes**
      10 files that write to the database via the service-role key
      (`data.ts`, `database-import.ts`, `import-coverage.ts`,
      `member-aliases.ts`, `palms-database-import.ts`,
      `sponsor-database-import.ts`, `task-inbox.ts`, `tasks.ts`,
      `traffic-light-import.ts`, `training-database-import.ts`) — those
      belong in Phase 2 as Edge Functions, never in the client bundle, since
      a service-role key can never ship to a browser.
- [x] `src/lib/renewals/__tests__/` — the corresponding Vitest suite (22 of
      the original 29 test files; skipped the 5 testing the excluded
      DB-writing files, `schema.test.ts` which asserts against bni-rrc's own
      raw migration file text, and `backfill-two-year-renewals.test.ts`
      which tests a script that also uses the service client).
- [x] `vitest` added as a devDependency, `npm test` script added.

**Verify Phase 1:**
```bash
npm test              # all ported tests should pass
npx tsc --noEmit       # whole project, including the new files, typechecks
npm run build          # production build still succeeds
```
Then, against the live Supabase project: apply `004_renewals_schema.sql`,
confirm with
`select table_name from information_schema.tables where table_schema = 'renewals';`
(expect 12 tables), and test the rollback path (`DROP SCHEMA renewals CASCADE`)
once in a branch/preview project before trusting it as a real rollback.

## Phase 2 — not started (new, standalone Edge Functions)

Port the 10 excluded DB-writing files as Supabase Edge Functions (Deno, not
Node). Order: membership-dues import first (simplest, no PDF dependency),
then palms/palms-lifetime/sponsors/trainings, then traffic-lights last within
this batch — `pdf-parse` is an npm/Node package; Deno can often import npm
packages via `npm:` specifiers, but this needs explicit verification, not an
assumption it "just works." Then the renewal-task-generation logic, callable
manually before anything is scheduled.

## Phase 3 — not started (new, additive UI surface)

New "Renewals" tab in Handychapter's Sidebar/hash-router. Read-only views
first (kanban, member detail, task inbox) as new client components. Original
bni-rrc components use Tailwind v4 (CSS-first, no config file) —
Handychapter is Tailwind v3.4.17 with a heavily customized JS config (the
navy palette work) — translate class by class per component, not a blind
copy. Write actions (checklist toggles, task status, stage/assignment
updates) once reads are verified.

## Phase 4 — not started (security posture, scheduling, real data)

- RLS decision for the `renewals` schema: do not invent a bespoke scheme —
  apply whatever `docs/SECURITY_REMEDIATION.md` eventually lands on for the
  rest of the database (same Firebase-auth-vs-`auth.uid()` blocker already
  documented there and in `003_enable_rls.sql`).
- Scheduled trigger for renewal-task generation (Supabase Scheduled Edge
  Functions or `pg_cron`) — first scheduled job in this project; needs a
  monitoring plan.
- Real data import from bni-rrc's actual historical data, if carrying over
  existing renewal-cycle history is intended — one-time, largely
  irreversible. Dry-run against a Supabase branch/preview database first.
- Decommission bni-rrc's separate app/project — only after everything above
  is verified working end-to-end inside Handychapter. Last step, on purpose.

## Reference

Full comparison (package.json/deps, folder structure, config, env vars,
routing, API surface, feature classification) was worked out in the planning
session that produced this file — see git history / conversation log for the
complete table-by-table breakdown if a fact here needs re-deriving.
