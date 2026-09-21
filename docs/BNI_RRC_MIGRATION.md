# bni-rrc → Handychapter Migration

## Live deployment status (as of 2026-09-16)

**The `renewals` schema is now genuinely live on the production
Handychapter project** (`oleckbfrkpmoikpkjcpa`) — applied via the Supabase
MCP server once the user connected it (`.mcp.json` already had it
configured; needed a one-time `/mcp` OAuth authorization in an interactive
session, which unblocked direct database/project access that this session
didn't have for most of the migration). This is the first point in the
whole migration where something was actually verified end-to-end against
real infrastructure, not just compiled.

What that unblocked, in order:
1. Applied `004_renewals_schema.sql` (all 12 tables, RLS, triggers).
2. Found and fixed a second bug the schema alone didn't reveal: `CREATE
   SCHEMA` does not make a schema usable by `anon`/`authenticated`/
   `service_role`, or routable via PostgREST's REST API — both need
   explicit `GRANT`s and adding the schema to `pgrst.db_schemas`. This is
   the actual cause of the "Invalid schema: renewals" error the user hit;
   folded back into `004_renewals_schema.sql` itself (not left as a
   separate undocumented follow-up) so re-running the file from scratch
   doesn't reproduce the same bug.
3. Fixed a `NOTIFY pgrst, 'reload config'` vs `NOTIFY pgrst, 'reload
   schema'` mixup (config and schema-cache reloads are different PostgREST
   channels) that briefly produced a third, different error ("Could not
   find the table... in the schema cache") after the grants were already
   correct.
4. Hardened `renewals.set_updated_at()`'s `search_path` — the one new
   finding the post-migration security-advisor scan turned up that was
   actually introduced by this migration (everything else it flagged
   pre-dates this work — see the standing finding below).
5. **Verified the full write path for real**, not assumed: POSTed a
   synthetic membership-dues report straight at the live
   `import-membership-dues` function, confirmed via SQL that a real member
   + renewal cycle landed correctly, then deleted that test data.
6. Confirmed all four read endpoints (`renewals-dashboard` × 3 actions,
   `renewals-task-inbox`, `renewals-palms-coverage`) return `200` against
   the live project.

**A standing finding, not introduced by this work, surfaced because the
security-advisor scan runs project-wide:** `public.outreach_templates` has
RLS **disabled entirely** — fully exposed to the anon key, any row
readable or writable by anyone with it. Per the advisor tool's own
instructions, this is surfaced here rather than silently fixed (enabling
RLS with no policies would block all access to that table, which needs a
deliberate policy decision, not a blind toggle):
```sql
ALTER TABLE "public"."outreach_templates" ENABLE ROW LEVEL SECURITY;
```
This needs its own policies to actually be useful (not just this one
statement) — worth a separate pass, unrelated to the renewals migration.

### PALMS coverage panel never refreshed after an upload (fixed 2026-09-18)

`PalmsCoveragePanel` (in `RenewalImportView.tsx`) fetched
`renewals-palms-coverage` once on mount (`useEffect(..., [])`) and never
again — after uploading a monthly PALMS file, the "Uploaded" / "Missing"
lists stayed exactly as they were at page load until a full reload. Fixed
by adding a `refreshKey` prop, bumped by `RenewalImportView` after every
successful import (all 6 forms, not just the PALMS ones — harmless to
over-refresh), with the panel's fetch effect keyed on it. Also added a
loading indicator during refetch, previously silent.

The underlying coverage **logic** itself was already correct — verified
live, not assumed: inserted a throwaway test member, built two synthetic
monthly PALMS `.xls` files for January and March 2026 (deliberately
skipping February), uploaded both through the real `import-palms`
function, and confirmed `renewals-palms-coverage` correctly listed both
uploaded months and flagged `2026-02-01` as the missing gap. (One dead end
on the way: the first two attempts at the synthetic fixture failed with
"Invalid numeric value: To:" — a bug in the *test fixture's* column-index
layout colliding with the real data row's columns, not in the parser
itself; fixed by giving the metadata rows explicit `ss:Index` values well
clear of the 16-column data range.) All test data deleted afterward —
`renewals.*` is back to zero rows.

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

## Phase 2 — done (new, standalone Edge Functions)

All 10 files originally excluded from Phase 1 (service-role-writing or
service-role-reading) are now ported as Supabase Edge Functions, using only
Handychapter's own Supabase project (`oleckbfrkpmoikpkjcpa`) — never
bni-rrc's separate project/credentials.

**`supabase/functions/_shared/renewals/`** — Deno-compatible shared code,
adapted from bni-rrc's originals by threading an explicit `supabase` client
through instead of a module-level `getServiceSupabase()` singleton, and
schema-qualifying every table into `renewals.*`:
- Parsers (direct ports, pure, no adaptation needed): `import-parser.ts`,
  `palms-import.ts`, `sponsor-import.ts`, `training-import.ts`,
  `traffic-lights.ts`.
- Business logic (direct ports): `stage.ts`, `urgency.ts`, `task-types.ts`,
  `task-inbox-model.ts`, `achievements.ts`, `sponsor-achievements.ts`,
  `training-achievements.ts`, `traffic-light-history.ts`,
  `performance-averages.ts`, `palms-window.ts` (extracted from bni-rrc's
  larger `palms-monthly-performance.ts` — only the window-math functions
  these Edge Functions need), `notifications.ts` (stub, same as upstream).
- DB orchestration (adapted): `member-aliases.ts`, `database-import.ts`
  (membership-dues), `palms-database-import.ts`, `sponsor-database-import.ts`,
  `training-database-import.ts`, `traffic-light-import.ts`,
  `import-coverage.ts`, `task-inbox.ts`, `tasks.ts`, `data.ts`.

**Edge Functions** (11 total, `delete-user` plus 10 new):
- `import-membership-dues`, `import-palms`, `import-palms-lifetime`,
  `import-sponsors`, `import-trainings`, `import-traffic-lights` — file
  uploads, mirror bni-rrc's original API routes 1:1.
- `renewals-dashboard` — read-only, consolidates bni-rrc's `data.ts` (4
  functions called directly from Next.js server components there, not
  separate routes) behind one function with an `?action=` selector
  (`cycles` / `achievements` / `committee` / `member-detail`).
- `renewals-palms-coverage`, `renewals-task-inbox` — read-only, one bni-rrc
  helper each with no prior route of its own.
- `generate-renewal-tasks` — the renewal-task-generation logic. Callable
  manually; **nothing calls this on a schedule** — wiring an actual
  schedule (Supabase Scheduled Edge Functions or `pg_cron`) is Phase 4,
  deliberately deferred (first scheduled job in this project, needs a
  monitoring plan first).

All 11 functions require a valid Handychapter session JWT (same bearer-token
check as the original `delete-user`). Fine-grained authorization (e.g.
restricting importers to committee/owner roles) is intentionally **not**
decided here — see Phase 4.

**The one real open risk, resolved with actual verification, not
assumption:** `import-traffic-lights` needs to extract text from an
uploaded PDF and parse XLSX — bni-rrc's own code did this via `pdf-parse`
configured with a physical `node_modules/pdfjs-dist/.../pdf.worker.mjs` file
path (`process.cwd()` + `pathToFileURL`), which is Node-filesystem-specific
and doesn't exist in a deployed Edge Function. Rather than assume `npm:`
specifiers "just work" (the risk flagged when this plan was first written),
this was tested directly in this session: installed Deno locally, ran
`npm:pdf-parse@2.4.5` against both a synthetic minimal PDF and an invalid
buffer (confirmed real text extraction, no worker setup needed — it just
works differently than in Node) and `npm:xlsx@0.18.5` against a
write-then-read round trip. Both confirmed working under real Deno
execution. The full parsers (`parseTrafficLightPdfScoreReport`,
`parseTrafficLightXlsxReport`) were then smoke-tested against synthetic
report-shaped input end-to-end, not just type-checked.

**Verified so far:** `deno check` against all 11 functions (clean) plus a
runtime smoke test (`deno run`, not just type-check) of the traffic-lights
parsers against synthetic PDF/XLSX input. The Vite app's own `npm test`
(93 passed, 7 skipped), `tsc --noEmit`, and `npm run build` are all still
clean — confirms this phase touched zero existing application files.

**Not verified:** deploying or invoking any of these against a live
database, or against a *real* BNI PDF/XLSX export (only synthetic test
input was used for traffic-lights) — this session has no
`supabase login` / project-link access. Before trusting any of these,
`supabase functions deploy <name>` and test against real report files,
especially `import-traffic-lights`.

## Phase 3 — read-only UI done; a real client/server auth gap was found and fixed here

New "Renewals" tab added to Handychapter's Sidebar/hash-router (`renewals` in
`NavigationTab`), rendering `RenewalsTab` — purely additive changes to
`src/App.tsx` and `src/components/Sidebar.tsx` (new import + one nav entry +
one render branch each; verified via `git diff`, nothing existing removed).

**A real architectural problem surfaced while building this, not assumed
away:** every Phase 2 Edge Function required a Supabase session JWT (mirrored
from the existing `delete-user` function). But Handychapter's client never
establishes a Supabase Auth session for Firebase-authenticated users — it
talks to Supabase purely via the anon key. `delete-user` gets away with this
because it's only called as a fallback for the rare Supabase-native accounts;
a UI calling these functions on every page load would 401 for nearly
everyone. Raised to the user directly rather than guessed past; decision was
to drop the bearer-token check from all 10 Phase 2 functions, matching the
same anon-key-plus-permissive-RLS posture the rest of Handychapter already
runs under (`docs/SECURITY_REMEDIATION.md`) rather than inventing a stricter
rule only this feature would enforce. `delete-user` itself was left
untouched. Real authorization for these functions is still an open Phase 4
decision.

**What's built (read-only, per the approved plan — write actions deferred):**
- `src/services/renewalsService.ts` / `renewalsTypes.ts` — thin client
  wrapper. GET-only functions (`renewals-dashboard`, `renewals-task-inbox`,
  `renewals-palms-coverage`) are called via plain `fetch` (Supabase's own
  `supabase.functions.invoke()` always POSTs); the upload/mutation functions
  use `supabase.functions.invoke()`.
- `src/components/renewals/` — `RenewalsTab` (container, Kanban/Task-Inbox
  toggle), `RenewalKanbanBoard`, `RenewalMemberCard`, `RenewalTaskInbox`,
  `RenewalMemberDetailModal`, `TrafficLightBadge`. Reuses the already-ported,
  already-tested pure logic from `src/lib/renewals/*` directly (stage
  grouping, urgency, task-inbox sorting, date formatting) rather than
  reimplementing it.
- Deliberately **not** a class-by-class port of bni-rrc's Tailwind v4
  components — rebuilt idiomatically against Handychapter's own existing
  design language (glass-panel cards, `slate-900/60` + `white/10` borders,
  emerald/amber/rose accents, `UniversalModal`) rather than translating
  bni-rrc's `var(--accent)`/`var(--line)` CSS-variable classes one by one,
  which the original Phase 3 plan allowed for ("translate... not a blind
  copy") given how much of that visual language Handychapter had already
  redesigned this session (the navy-palette work).
- Write actions (task complete/cancel, cycle status change, checklist
  toggles) intentionally **not** wired up — bni-rrc's originals also assumed
  a `PATCH /api/tasks/[id]`-style endpoint that was never in the Phase 2 Edge
  Function scope; adding real writes needs its own pass once reads are
  confirmed working against live data.

**Verified:** `tsc --noEmit` (clean), `npm test` (93 passed, unaffected),
`npm run build` (clean, same pre-existing CSS warning as always), `git diff`
confirming the two touched files are purely additive, and the dev server
boots without errors.

**Not verified — say so plainly:** no visual/browser testing was done (no
browser tool available in this session) and no live data exists to render —
the `renewals` schema is still not applied to the database, none of the
Edge Functions are deployed, and nothing has been imported. The UI has
therefore never actually rendered real (or even empty-state) data; only its
code compiles and typechecks cleanly. Before trusting this, apply
`004_renewals_schema.sql`, deploy the Edge Functions, import at least one
membership-dues report, and click through the tab in a real browser.

### Write actions (added after the read-only views above)

Two more Edge Functions, ported the same way as the other 10 (faithful port
+ explicit `supabase` client + `renewals` schema qualification + no
caller-auth check):
- `update-renewal-task` — task status (open/completed/cancelled). Mirrors
  bni-rrc's `app/api/tasks/[id]/route.ts` PATCH, including its side effect
  (marking a cycle `renewed` when its `payment_due` task completes, via the
  ported `task-status.ts`). The `[id]` dynamic route segment becomes a body
  field (`{ id, status }`) since Edge Functions have no path-based routing.
- `update-renewal-cycle` — cycle status/follow-up dates/checklist/assignments.
  Mirrors `app/api/renewal-cycles/[id]/route.ts` PATCH in full (via the
  already-ported `checklist.ts`), though the UI below only calls it for
  `status` so far — the checklist/assignment fields have no UI wired to them
  yet, ported because the marginal cost was near zero.

**Wired into the UI:**
- `RenewalTaskInbox` — Complete/Cancel buttons per task, with a per-task
  pending spinner; calls `update-renewal-task` then silently refetches (no
  full-page loading flash) via `RenewalsTab`'s `loadData(false)`.
- `RenewalMemberDetailModal` — a status `<select>` (active/renewed/dropped)
  next to the member header; calls `update-renewal-cycle`, updates local
  state optimistically-adjacent (after the call resolves, not before), shows
  a toast, and tells `RenewalsTab` to refetch (a status change can move the
  member to a different Kanban column).

**Verified:** `deno check` on all 13 Edge Functions (11 from Phase 2 + these
2), `tsc --noEmit`, `npm test` (93 passed, unaffected), `npm run build` — all
clean.

**Not verified:** same gap as above — no live schema/deployed functions/real
data, so these write paths have never actually executed against a database,
only compiled.

### Import UI — the missing piece that made the whole feature inert

The user deployed the 12 renewals functions and hit `renewals-dashboard`
live: a 500. Root cause, confirmed by probing the live endpoint directly
from this session (`curl`, not guessed): the actual Postgres error (almost
certainly "schema renewals does not exist" — migration 004 still isn't
applied) was being swallowed. Every Edge Function's outer catch block did
`err instanceof Error ? err.message : "generic fallback"`, but
`@supabase/supabase-js` throws `PostgrestError` as a **plain object**, not
an `Error` instance — so every database error was silently replaced with a
useless generic message. Fixed with a new
`_shared/renewals/error-message.ts` (`extractErrorMessage`, checks for a
`.message` string on any object, not just real Errors) applied across all
11 renewals functions (`delete-user` and `import-traffic-lights` untouched
— the latter already had its own equivalent `formatImportError`).

Separately, and more substantively: even once the schema is applied, the
Renewals feature had **no way to get any real data in**. Phase 3 built
read views (Kanban, task inbox, member detail) and narrow status-change
writes, but bni-rrc's actual data-entry surface — the Import page — was
never ported. Without it, every fresh deployment's Kanban board and task
inbox are permanently empty; there's no UI path to ever populate them. This
is now fixed:

- `src/components/renewals/RenewalImportView.tsx` (new) — all 6 import
  forms from bni-rrc's `components/ImportForm.tsx`, rebuilt in
  Handychapter's dark theme: membership dues, traffic lights (PDF/XLSX +
  optional month), sponsors, trainings, and PALMS monthly/lifetime
  (multi-file drag-drop with the same client-side pre-validation bni-rrc
  had — parses each file locally via the already-ported
  `palms-import.ts`/`palms-monthly-performance.ts` before upload, so a
  monthly file queued into the lifetime uploader is caught before hitting
  the network). Plus the PALMS monthly-coverage panel.
- Wired into `RenewalsTab` as a third "Import" view, alongside Kanban and
  Task Inbox — reachable and rendered independent of whether cycles/tasks
  loaded successfully, since a fresh install has none yet by definition.
  The empty-state message now points here instead of vaguely mentioning
  "the renewals Edge Functions."
- `renewalsService.ts` / `renewalsTypes.ts` — added `PalmsBatchImportResult`
  typing for the two PALMS batch-import calls (previously `unknown`).

This is the change that actually closes the loop the user asked for:
Handychapter's own Supabase project can now be the place real chapter data
gets **posted**, not just displayed — completing the "all bni-rrc features
merged" bar for the UI surface, independent of whether bni-rrc's specific
historical rows ever get carried over (a separate, optional decision — see
the data-import runbook below).

**Verified:** `tsc --noEmit`, `npm test` (93 passed), `npm run build`, and
`deno check` on all 13 functions — all clean.

**Not verified:** still no live schema applied in this session (confirmed
via the live 500 itself) and no browser testing possible — the import forms
have never actually uploaded a real file end-to-end. Apply
`004_renewals_schema.sql`, redeploy the 11 functions (config.toml's
`verify_jwt = false` + the error-message fix), then try one real file
through the Import tab.

## Phase 4 — started: RLS decision resolved, scheduling drafted; data import and decommissioning correctly not attempted

### RLS decision — already correct, nothing new needed

Checked what `004_renewals_schema.sql` (written back in Phase 1) actually
did, rather than assuming it needed new work: it already enables RLS on
every `renewals.*` table, with every policy scoped `to authenticated` only
— reads open to any real Supabase session, writes gated on
`renewals.members.is_committee` via `auth.uid()`. **No policy targets
`anon`.** With RLS enabled and no `anon`-scoped policy, direct anon-key
table access is denied by default — Postgres/RLS's own safe default, not
something added here.

Net effect: this is already consistent with the rest of Handychapter's
current interim posture, for the same reason `003_enable_rls.sql` is still
unapplied — `auth.uid()` doesn't resolve for Firebase-authenticated users,
so the `to authenticated` policies are currently dormant either way, same
as bni-rrc's own original policies were (nothing there ever populated
`auth_user_id` or checked `is_committee` either — see the comment block
directly above the policies in `004_renewals_schema.sql`). The client never
queries `renewals.*` directly; every read/write goes through the Edge
Functions using the service-role key, which bypasses RLS entirely and is
where the actual (currently open, per the Phase 3 decision) access control
lives today.

**Conclusion: do not invent a bespoke RLS scheme for `renewals` beyond what
004 already has.** When `docs/SECURITY_REMEDIATION.md`'s Firebase-auth
blocker is eventually resolved project-wide, these already-written
`to authenticated` / `is_committee` policies should just start working
correctly with no changes needed here — that was the point of carrying them
over from bni-rrc's original intent rather than dropping them in Phase 1.

### Scheduled trigger — drafted, not applied

`supabase/migrations/005_renewal_task_schedule.sql` (new) — `pg_cron` +
`pg_net`, the standard Supabase pattern, calling `generate-renewal-tasks`
daily. Uses Supabase Vault for the anon key (`vault.create_secret(...)`,
run once via the Dashboard) rather than pasting a credential into a
migration file that gets committed to git. **Not applied** — same as every
other migration in this project — and explicitly flagged in the file's own
header comment that this is the project's first scheduled job and has no
monitoring/alerting wired up; the user needs to check `cron.job_run_details`
and the function's own Invocations log after applying, not assume it's
silently working.

### Real historical data import — written as a runbook, not executed

`docs/BNI_RRC_DATA_IMPORT_RUNBOOK.md` (new) — dependency-ordered table list,
two concrete methods (`pg_dump`/`pg_restore` or CSV via the Dashboard),
verification steps, and rollback path. **Not executed, and correctly so:**
this session has no credentials to either Supabase project (Handychapter's
`oleckbfrkpmoikpkjcpa` or bni-rrc's own `lvijvkqvruygdesgxvch`), and the
plan's own instructions call for a branch/preview dry-run first on
something described as "one-time, largely irreversible" — not a step to
attempt blind, autonomously, without the user's direct involvement and real
access.

### Decommissioning bni-rrc — not started, correctly blocked

Explicitly the last step in the original plan, "only after everything above
is verified working end-to-end." Nothing above has been verified against
live data yet (no browser testing was possible this session either — see
the Phase 3 notes above). Not attempted.

## Reference

Full comparison (package.json/deps, folder structure, config, env vars,
routing, API surface, feature classification) was worked out in the planning
session that produced this file — see git history / conversation log for the
complete table-by-table breakdown if a fact here needs re-deriving.
