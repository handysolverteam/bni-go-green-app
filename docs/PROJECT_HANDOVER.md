  # BNI Go Green — Complete Project Handover Documentation

  > **Author:** HandySolver Team (notice-period handover)
  > **Project:** Multi-tenant BNI Chapter PALMS Score Tracker + WhatsApp Outreach web app
  > **Repo:** `git@github-office:handysolverteam/bni-go-green-app.git` (branch: `main`)
  > **Stack:** React 19 + TypeScript + Vite + TailwindCSS + Supabase (DB/Auth/Realtime) + Firebase (Google OAuth fallback) + PWA

  ---

  ## 1. Overview / What This App Does

  BNI Go Green is a role-based, multi-tenant web application used by **BNI Chapter Directors / Owners / Admins / Members** to:

  1. **Track weekly PALMS statistics** (`P`resent, `A`bsent, `S`ubstitute, `M`edical, `R`eferrals, `V`isitors, `T`YFCB).
  2. **Compute a 100-point Traffic Light score** for every member (Green / Amber / Red / Grey).
  3. **Import BNI Traffic Light Excel reports** and visualize them as report cards.
  4. **Generate personalized WhatsApp outreach messages** and open WhatsApp (Web/Mobile) with a pre-filled message.
  5. **Manage an organization** via a unique **6-digit invite code** with RBAC (`owner` / `admin` / `member`).

  ---

  ## 2. Key Features (What Was Built)

  | Area | Feature | Detail |
  |---|---|---|
  | **Auth** | Google OAuth SSO | Dual provider: **Firebase** first (`signInWithPopup`), falls back to **Supabase OAuth** redirect. Both sessions are monitored via `AuthContext`. |
  | **Organizations** | 6-digit invite code | `generateUnique6DigitCode()` creates e.g. `789210`. Creator becomes `owner`. Joining via code makes `member`. |
  | **RBAC** | `owner` / `admin` / `member` | Role hierarchy; roles editable in Organization tab. |
  | **Onboarding** | Org onboarding + Profile onboarding | Post-login: create/join org, then complete profile (name, WhatsApp, chapter role, category, bio). |
  | **Scoring** | 100-pt Traffic Light engine | `scoringEngine.ts`. 7 categories with threshold tiers: Attendance (10), CEU (10), 1-2-1s (20), Referrals (25), Visitors (25), TYFCB (5), Sponsors (5). Thresholds: Green ≥70, Amber 50–69, Red 30–49, Grey <30. |
  | **Traffic Lights** | Week-wise BNI reports, scored on a new screen | Admins import BNI's weekly **Chapter Summary PALMS Report** + **Chapter Sponsor Report** (.xls); every member of the chapter sees the **Traffic Lights** tab (window: last 6 months / all weeks / one week / custom range, colour + member filters, XLSX/CSV/PDF export). See section 7.13. |
  | **Level-up plans** | Auto-generated nudges | `levelUpPlan()` computes points needed to next tier and the single/combined action(s) to reach it. |
  | **Excel import** | `xlsx` parser | Auto-detects header row, handles multi-sheet workbooks, preserves raw columns into `raw_data`, extracts report dates, joins first/last name, sample-file generator included. |
  | **Dashboard** | Report cards + member table | Batch-level cards (green/amber/red/grey counts, avg score), full member roster with status pill filters, optimistic UI updates. |
  | **WhatsApp outreach** | `NudgeSender` | Per-report outreach manager: auto-generated personalized messages, per-member custom message editing, preview, copy, direct WhatsApp deep-link (`web.whatsapp.com` desktop / `api.whatsapp.com` mobile), batch progress tracker, send/regenerate/edit, inline phone & join-date editing. |
  | **Templates** | Outreach templates CRUD | `TemplateManagerPage` + 6 default templates (`⚡ Universal`, `🟢 Green`, `🟡 Amber`, `🔴 Red`, `⚪ Grey`, `🚀 General`). Placeholders: `{{name}}`, `{{score}}`, `{{traffic_light}}`, `{{nudges_list}}`, `{{attendance_rate}}`, `{{ceu_current}}`, etc. |
  | **Settings** | Per-org scoring & signature | Custom green/amber/red thresholds, custom WhatsApp signature, enable/disable signature, custom scoring config persisted. |
  | **Realtime** | Supabase `postgres_changes` | Member table subscription auto-refreshes members list live. |
  | **PWA** | Installable | `manifest.json`, service worker `sw.js`, icons (192/512/maskable), install prompt component, mobile gesture-zoom disabled. |
  | **Offline cache** | localStorage | Org, profile, members, import logs cached (keys `bni_cached_*`), instant hydration on reload. |
  | **Routing** | Hash routing | `#dashboard`, `#import`, `#nudges`, `#nudges/report/<name>`, `#org`, `#profile`, `#settings`. |

  ---

  ## 3. Project Structure

  ```
  bni-go-green-app/
  ├── index.html                     # PWA meta, manifest, theme script
  ├── package.json                   # scripts + dependencies
  ├── vite.config.ts                 # port 3000, chunk splitting, '@' alias
  ├── tailwind.config.js / postcss.config.js
  ├── tsconfig.json
  ├── .env                           # <-- ALL CREDENTIALS (see section 5)
  ├── .env.example                   # template (safe to commit)
  ├── .mcp.json / mcp_config.json    # Supabase MCP for AI tooling
  ├── public/
  │   ├── manifest.json              # PWA manifest
  │   ├── sw.js                      # service worker (prod only)
  │   ├── icons/                     # app icons (svg + png)
  │   └── generate_icons.cjs / make_icons.cjs / make_icons.js
  ├── src/
  │   ├── main.tsx                   # React root + SW registration (PROD)
  │   ├── App.tsx                    # App shell, routing, state, org/profile/member orchestration
  │   ├── index.css                  # Tailwind + glass UI styles
  │   ├── types/index.ts             # All TypeScript interfaces
  │   ├── context/
  │   │   ├── AuthContext.tsx        # Firebase + Supabase dual auth
  │   │   └── ToastContext.tsx       # Global toast notifications
  │   ├── lib/
  │   │   ├── firebase.ts            # Firebase config + Google sign-in/out
  │   │   ├── supabase.ts            # Supabase client + OAuth sign-in/out
  │   │   ├── scoringEngine.ts       # 100-pt scoring, thresholds, nudges, level-up plans
  │   │   ├── excelParser.ts         # Excel → Member[] parser + sample generator
  │   │   ├── outreachUtils.ts       # Message builder, template substitution, date formatting
  │   │   └── whatsappUtils.ts       # WhatsApp deep-link URL generator
  │   ├── services/supabaseService.ts# All DB CRUD, RPC calls, templates, outreach logs
  │   └── components/                # See list below
  └── docs/PROJECT_HANDOVER.md       # THIS FILE
  ```

  ### Components (`src/components/`)

  - `LoginPage.tsx` — Google SSO login screen
  - `OrgOnboardingScreen.tsx` — create/join organization
  - `ProfileOnboardingScreen.tsx` — complete user profile
  - `Sidebar.tsx` — responsive 240px sidebar / mobile drawer
  - `Navbar.tsx` — mobile top bar
  - `Dashboard.tsx` — report cards + roster (849 lines, main view)
  - `ImportModal.tsx` — Excel upload + batch naming + parse preview
  - `AddMemberModal.tsx` — manually add a member
  - `MemberDetailModal.tsx` — member score breakdown detail
  - `ConfirmationModal.tsx` — generic confirm dialog
  - `NudgeSender.tsx` — WhatsApp outreach manager (824 lines)
  - `TemplateManagerPage.tsx` — outreach template CRUD
  - `OrganizationTab.tsx` — org roster + RBAC management
  - `SettingsPage.tsx` — scoring thresholds + signature settings
  - `ProfilePage.tsx` — edit own profile
  - `GlassCard.tsx`, `PageHeader.tsx` — reusable UI
  - `PWAInstallPrompt.tsx`, `ScrollToTopButton.tsx` — utility components

  ---

  ## 4. How to Run / Start the Project

  ### Prerequisites
  - Node.js ≥ 18 (tested with npm + Vite 6)
  - npm

  ### Local Development

  ```bash
  # 1. Install dependencies
  npm install

  # 2. Create .env from template (see section 5 for real values)
  #    Copy .env.example -> .env  OR restore the existing .env

 
  ```

  ### Production Build

  ```bash
  npm run build     # tsc typecheck + vite build -> dist/
  npm run preview   # preview the production bundle locally
  ```

  ### Scripts (`package.json`)

  | Command | Purpose |
  |---|---|
  | `npm run dev` | Vite dev server, port **3000**, auto-open |
  | `npm run build` | `tsc && vite build` (typecheck + bundle) |
  | `npm run lint` | `tsc --noEmit` (type-only lint/typecheck) |
  | `npm run preview` | Serve production build locally |

  ### Notes
  - **Vite port is hardcoded to 3000** (`vite.config.ts`). If 3000 is busy, change it there.
  - Service worker only registers in **production** (`import.meta.env.PROD`).
  - Hash-based routing — no server rewrites needed for SPA deployment.
  - Test login: any Google account works (Firebase handles auth). First login requires onboarding (org + profile).

  ---

  ## 5. Credentials & Environment Variables

  > **⚠️ SECURITY WARNING:** The `.env` file contains **live production secrets** including a Supabase **service_role** key and **secret key**. These grant full database access, bypassing Row Level Security. **Never commit `.env`.** Share it only with the successor / owner via a password manager or another private channel.
  >
  > **`.env` was tracked in git until it was untracked in this change, so every key it ever held is recoverable from history and must be rotated.** Follow `docs/SECURITY_REMEDIATION.md` before treating this project as secure.

  ### 5.1 Credentials — NOT stored in this document

  > **Live secrets were previously pasted into this section and are therefore present in this
  > repository's git history.** They have been removed here. Treat every key committed before
  > this change as compromised and rotate it — see `docs/SECURITY_REMEDIATION.md`.

  Credentials live **only** in the untracked local `.env` file (see `.env.example` for the
  required variable names) and in the hosting provider's environment-variable settings.

  | Where to get each value | Source |
  |---|---|
  | `VITE_FIREBASE_*`, `VITE_GOOGLE_WEB_CLIENT_ID` | Firebase Console → Project Settings |
  | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API |
  | `VITE_GEMINI_API_KEY` | Google AI Studio (see remediation doc — this must move server-side) |

  **Never paste real key values into this file, any doc, or any commit.** Hand them over through
  a password manager or another private channel.

  ### 5.2 `.env.example` (safe template)

  ```env
  VITE_FIREBASE_API_KEY=your_firebase_api_key
  VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
  VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
  VITE_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id

  VITE_SUPABASE_URL=https://oleckbfrkpmoikpkjcpa.supabase.co
  VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
  ```

  ### 5.3 Key Ownership / Where Credentials Live

  | Resource | Where | Who owns |
  |---|---|---|
  | Firebase project `handydash-75858-b95d2` | firebase.google.com console | HandyLeads / HandySolver team |
  | Google OAuth web client `18967278229-rq5dr7gs5l34mqdg1435g1iuttuvhj5q` | Google Cloud Console | HandySolver |
  | Supabase project `oleckbfrkpmoikpkjcpa` | supabase.com dashboard | HandySolver |
  | Supabase MCP server | `.mcp.json` / `mcp_config.json` (`https://mcp.supabase.com/mcp?project_ref=oleckbfrkpmoikpkjcpa`) | HandySolver AI tooling |
  | GitHub repo | `github-office:handysolverteam/bni-go-green-app` | HandySolver team |

  ### 5.4 Key Usage in Code

  - **Auth:** `src/lib/firebase.ts` and `src/lib/supabase.ts` read all `VITE_FIREBASE_*` / `VITE_SUPABASE_*` vars via `import.meta.env`.
  - **DB client:** `src/services/supabaseService.ts` uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (with a hardcoded fallback URL `https://oleckbfrkpmoikpkjcpa.supabase.co`).
  - `VITE_SUPABASE_SERVICE_ROLE_KEY` and `VITE_SUPABASE_SECRET_KEY` are present but **not used directly in frontend code** — kept for admin/CLI tooling (e.g., Supabase CLI, SQL scripts).

  ---

  ## 6. Supabase Database Schema

  > Live tables verified in the project (see README for the full creation SQL).

  | Table | Purpose | RLS |
  |---|---|---|
  | `organizations` | Chapter orgs + 6-digit code + thresholds + custom signature | ✅ ON |
  | `org_members` | Org membership + RBAC (`owner`/`admin`/`member`) | ✅ ON |
  | `profiles` | User profile (name, phone, category, bio) | ✅ ON |
  | `members` | Per-member PALMS stats, score, traffic_light, `batch_name`, `raw_data` | ✅ ON |
  | `import_logs` | Report batch import metadata + `file_data` (base64) | ✅ ON |
  | `outreach_logs` | WhatsApp outreach send tracking | ✅ ON |
  | `outreach_templates` | Per-org custom outreach templates | ⚠️ OFF |
  | `chapter_settings` | Chapter-level settings (1 row) | ✅ ON |

  ### RPC / Database Functions used by the app

  - `create_bni_organization` — atomic org + owner member creation (with direct-table fallback in code)
  - `import_bni_report` — atomic batch member import (with chunked insert fallback)
  - `save_user_profile` — profile upsert
  - `purge_all_bni_chapter_data` — wipe all org members + import logs
  - `delete_bni_report_batch` — delete one batch by name

  > **⚠️ CRITICAL SECURITY ISSUE (found during handover):** `public.outreach_templates` has **Row Level Security DISABLED** while the other 7 tables have it enabled. Anyone with the public anon key can read/write all outreach templates. Fix by enabling RLS (the table is org-scoped):

  ```sql
  ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Outreach templates org-scoped access"
  ON public.outreach_templates
  FOR ALL
  USING (org_id IS NULL OR auth.uid()::text IN (
    SELECT user_id FROM public.org_members WHERE org_id = public.outreach_templates.org_id
  ));
  ```

  > If you need an org-scoped policy tailored to your RLS approach (e.g. `owner`-only writes), adjust the `USING` clause before applying.

  ---

  ## 7. Functionality Detail (Module-by-Module)

  ### 7.1 Authentication (`AuthContext`, `firebase.ts`, `supabase.ts`)
  1. `loginWithGoogle()` calls Firebase `signInWithPopup` first.
  2. On Firebase failure → falls back to Supabase `signInWithOAuth` (redirect to origin).
  3. `onAuthStateChanged` (Firebase) + Supabase session listener keep `user` in sync.
  4. `logout()` clears all `bni_cached_*` localStorage + both sessions.
  5. `user.uid` is the key used for all profile/org lookups.

  ### 7.2 Organization System (`OrgOnboardingScreen`, `supabaseService`)
  - **Create:** fills name/chapter/city → generates unique 6-digit code → RPC `create_bni_organization` → creator = `owner`.
  - **Join:** enter 6-digit code → verify in `organizations.code` → insert `org_members` with role `member` (idempotent: returns existing membership if already joined).
  - Cached to localStorage (`bni_cached_org`, `bni_cached_org_member`).

  ### 7.3 Scoring Engine (`scoringEngine.ts`)
  - `DEFAULTS` define threshold tiers per category (see section 2 table).
  - `scoreMember()` → computes breakdown + total + traffic light + nudges.
  - `metricSnapshot()` computes attendance/CEU/1-2-1/referral **rates** from explicit Excel rates or derived from counts over effective weeks.
  - `trafficLight(score)` → Green/Amber/Red/Grey with emoji + hex color.
  - `generateNudges()` → returns best next actions sorted by point gain.
  - `levelUpPlan()` → computes points needed & single/combined nudges to reach next tier.
  - Custom org scoring config overrides defaults via `setScoringConfig()` (loaded from `organizations.custom_scoring`).

  ### 7.4 Excel Import (`excelParser.ts`, `ImportModal.tsx`)
  - Drag-drop / file select `.xlsx`.
  - Parser scans rows 0–30 for the header row (auto-detect by "name" + "score/rate" keywords).
  - Handles First Name / Last Name split, joins to full name.
  - Extracts: Chapter, Region, Phone, Email, Join Date, Total Score, all Rate columns, all Score columns, TYFCB, Visitors, Sponsors, PALMS counts (P/A/S/M).
  - Multi-sheet workbooks → picks sheet with most members.
  - Raw row data preserved in `raw_data` (including `excel_row_index` for stable ordering).
  - Report dates ("From"/"To") parsed from top rows.
  - Generates a sample Excel buffer for testing (`generateSampleExcelBuffer`).
  - Import uses **optimistic UI**: report card + members render instantly, DB save happens in background via RPC `import_bni_report` (fallback: chunked inserts + `saveImportLog`).
  - Duplicate member names in a batch get auto-suffixed `#2`, `#3`, etc. to preserve every row.

  ### 7.5 Dashboard (`Dashboard.tsx`)
  - Report/batch cards: batch name, uploaded date, target count, sent count, green/amber/red/grey, avg score, delete-batch action.
  - Roster view: member table (desktop) + cards (mobile) with search + traffic-light status pills.
  - Member detail modal: full category breakdown, current values, points, level-up plan nudges.
  - Add/Delete member, Purge All data (with confirmation).

  ### 7.6 WhatsApp Outreach (`NudgeSender.tsx`, `outreachUtils.ts`, `whatsappUtils.ts`)
  - Select a report card → outreach manager view.
  - For each member: auto-generated personalized message via `buildMemberMessage()`:
    - Greeting by first name (`getFirstName` handles titles like "Dr", "Mr").
    - Score + traffic light, level-up plan (options or steps), other improvement opportunities, scoring snapshot, signature, "Made with 🧡 by Handysolver".
  - Actions per member: **Send** (opens WhatsApp with prefilled text), **Copy**, **Preview** (toggle), **Edit/Regenerate** custom message, inline **phone / join-date edit**.
  - Phone validation: 10+ digits required; 10-digit numbers get auto-prefixed `91`.
  - WhatsApp URL: mobile → `api.whatsapp.com/send`, desktop → `web.whatsapp.com/send`.
  - **Batch progress tracker:** start batch, pause/resume, per-member status (`pending/sent/failed/skipped`), progress %, "hide sent" toggle, status filters (All/Green/Amber/Red/Grey), search.
  - Outreach logs saved to `outreach_logs`; member `raw_data.outreach_status` updated.
  - Templates with `{{placeholder}}` substitution; per-org templates CRUD (auto-seeded from defaults on first load).

  ### 7.7 Templates (`TemplateManagerPage.tsx`)
  - List/edit/create/delete outreach templates per org.
  - 6 default templates included in code (`DEFAULT_OUTREACH_TEMPLATES`).
  - Merges org DB templates + defaults with deduplication by content signature.

  ### 7.8 Settings (`SettingsPage.tsx`)
  - Edit green/amber/red score thresholds.
  - Custom WhatsApp signature + enable/disable.
  - Custom scoring config saved to `organizations.custom_scoring`.
  - On save, all members re-scored in UI.

  ### 7.9 Organization / RBAC (`OrganizationTab.tsx`)
  - Roster of org members (mobile cards + desktop table).
  - Change member roles (`owner`/`admin`/`member`), invite by code.

  ### 7.10 Profile (`ProfilePage.tsx`, `ProfileOnboardingScreen.tsx`)
  - Show/edit full name, phone, chapter role, business category, bio, avatar.
  - First-time onboarding gate after login.

  ### 7.11 PWA
  - Installable via `manifest.json` + service worker (`public/sw.js`, prod-only).
  - `PWAInstallPrompt` offers install; icons in `public/icons/`.
  - Mobile UX: pinch/double-tap zoom disabled, theme-color, apple touch icons.

  ### 7.12 Persistence & Realtime
  - localStorage keys: `bni_cached_org`, `bni_cached_org_member`, `bni_cached_profile`, `bni_cached_members`, `bni_cached_import_logs`, `bni_active_tab`, `bni_active_report`, `bni_theme_mode`.
  - Supabase Realtime `postgres_changes` on `members` → auto re-fetch roster.

  ---

  ### 7.13 Traffic Lights (`TrafficLightsTab.tsx`, `TrafficLightsImport.tsx`, `src/lib/trafficLights/*`, `trafficLightsService.ts`)

  - **Purpose:** BNI's "Member Traffic Lights" report rebuilt from BNI's own exports, saved per chapter (organization) **week by week** so any window can be shown.
  - **Data (migration `014_traffic_lights.sql` — run it once in the Supabase SQL editor):** `traffic_palms_weeks` (one row per member per imported week: P A L M S, RGI RGO RRI RRO, V, 1-2-1, TYFCB, CEU, T) and `traffic_sponsor_weeks` (one row per sponsored person; an empty row marks a week imported with nobody sponsored). Both carry `week_from`, `week_to` (the report's From:/To:) and `meeting_date` (the Wednesday inside the week). RLS: **read = any member of the chapter** (`caller_org_ids()`), **write = owner/admin** (`caller_admin_org_ids()`).
  - **Import (owner/admin only):** the two BNI `.xls` files (SpreadsheetML, parsed by the existing `renewals/palms-import.ts` and `renewals/sponsor-import.ts`). Rules (`lib/trafficLights/import.ts`, `weeks.ts`): one week per file (a range over 7 days is refused), the file's chapter must be this chapter, a week overlapping a *different* imported week is refused (it would double count), the *same* week imported again replaces it. Picked files are listed before anything is saved; each has an X to deselect it (and "Clear selection"), more files can be added, and the checks re-run after a deselect (a file refused only because it overlapped a deselected one becomes importable). Two files of the same report type and week in one selection are refused ("deselect one of them"). Imported weeks are listed with a Remove button.
  - **Import history (migration `015_traffic_import_log.sql` — run after 014):** `traffic_import_log` records every import and removal: file name, report type (`palms` / `sponsor` / `both` for a removal), week, meeting date, rows imported, whether it replaced an earlier import, who (`imported_by`, `imported_by_name`) and when. Append-only (read = chapter members, insert = owner/admin, no update/delete). Writing a history line is best effort and never blocks an import. The migration **backfills** one line per already-imported week and report type from the import time and uploader that 014 stored (file name empty: it was never saved), so no re-import is needed. Shown as the "Import history" table under the imported weeks.
  - **Delete a file's data (`history.ts` `liveImportIds`, `deleteReport`):** each history line whose data is still in use ("In use": the newest import of that report type for that week, not replaced or removed since, rows still stored) has a Delete button. It deletes only that report's rows (PALMS or Sponsor) for the week, writes a "Deleted" history line with the file name, and the file can then be imported again (the week no longer counts as imported, so there is no overlap or "replaces" notice). "Remove" in the imported-weeks table still deletes a whole week (both reports). Older lines stay as history ("Not in use").
  - **Scoring (`score.ts`, `calc.ts`)** — BNI's rules, deliberately separate from `scoringEngine.ts` so the Dashboard is unchanged: weeks = P+A+L+M+S of the window; attendance = (weeks − A) / weeks on the whole percent (rounded half-down); CEU, 1-2-1 and (RGI+RGO) per week; TYFCB amount; visitors = V; sponsors = distinct Sponsor Report lines of the member whose application date is inside the window (matched by first + last name, so "Ranjan Sapra" = "Ranjan K Sapra"). Tiers: attendance 0.88→5 / 0.96→10; CEU >0→5 / ≥0.5→10; 121 0.25…1→5…20; referrals 0.25…1.25→5…25; TYFCB 1 / 85k / 210k / 625k / 1.25M→1…5; visitors 1…5→5…25; sponsors ≥1→5. Colours: green ≥70, amber 50–69, red 30–49, grey <30.
  - **Windows (`window.ts`):** *Last 6 months* (default; ends on the newest imported meeting, starts the day after the same date 6 months earlier = 26 or 27 meetings), *All imported weeks*, *one week*, *custom range*. Adding the weekly lines gives the same totals as one PALMS report for the window (checked on the 14 Oct 2026 reports: 76 members, 26 green / 34 amber / 16 red).
  - **Screen:** colour chips, a filter in the Name column header (search box + checklist, several members at once), From/To calendars, Sr. No. and Name columns that stay in place while the table scrolls sideways, XLSX / CSV / PDF export of what is on screen (`export.ts`; the PDF uses `jspdf` + `jspdf-autotable`, loaded only when the button is used, and fills the Total Score cell with the light; the PDF has no separate Colour column, the XLSX and CSV keep it), a note when the Sponsor Report is missing for some weeks of the window. Visible to every member of the chapter (a deliberate choice: the roster itself stays restricted by RLS, this table does not).
  - **Tests:** `src/lib/trafficLights/__tests__/trafficLights.test.ts` (tiers, weeks, windows, scoring, SpreadsheetML import, export).

  ## 8. Deployment

  - **Platform:** Vite SPA — deployable to Vercel / Netlify / any static host (output: `dist/`).
  - **Production URL referenced in code:** `https://bni-go-green.vercel.app` (see `src/lib/supabase.ts` fallback `redirectTo`).
  - Env vars must be set in the hosting provider's dashboard (copy from `.env`).
  - No server-side rewrites required (hash routing).
  - Service worker precaches assets; after deploys, users may need a hard refresh if cache is stale (verify `sw.js` versioning).

  ---

  ## 9. Verification Checklist (For The Next Developer)

  1. `npm install` → `npm run dev` → open `http://localhost:3000`.
  2. Login with a Google account.
  3. Create a new org (note the 6-digit code) or join with an existing code.
  4. Complete profile onboarding.
  5. Go to **Import** → upload a BNI Traffic Light Excel report (or use a generated sample). Verify report card + roster appear instantly.
  6. Open **Nudges / Outreach** → select the report → verify auto-generated messages, preview/copy/send, phone editing, batch tracker.
  7. **Settings** → change thresholds/signature → verify members re-score.
  8. **Organization** → verify roster + role changes.
  9. Test on mobile (PWA install prompt, drawer navigation).

  ---

  ## 10. Known Issues / Gotchas

  - `outreach_templates` RLS is **OFF** (see section 6) — fix recommended.
  - `VITE_SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_SECRET_KEY` in `.env` are not consumed by frontend code — safe to remove if rotation occurs.
  - Firebase `handydash-75858` is shared with the HandyLeads project — the Google OAuth consent screen may list HandyLeads; do not rotate without coordinating with that team.
  - WhatsApp "Send" opens a new tab with a prefilled message (user must press send manually). No server-side sending.
  - Realtime subscription filters on `org_id`; ensure RLS/Realtime publication allows the org filter if issues arise.

  ---

  *End of handover document. For further questions, contact the HandySolver Team.*
