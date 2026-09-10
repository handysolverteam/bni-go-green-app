# Security Remediation Runbook

Status of the two critical findings, what has been fixed in code, and the steps that
must be performed by a human with dashboard access.

> **Do the rotation in Part 1 first.** Rewriting git history without rotating keys is
> pointless (clones already exist), and rotating keys without closing RLS still leaves
> the database world-readable.

---

## Part 1 — Leaked credentials

### What happened

`.env` was listed in `.gitignore`, but gitignore does not apply to files git already
tracks. It had been committed before the ignore rule existed, so it stayed tracked and
every push shipped live secrets to `origin`. The same values were also pasted in
plaintext into `docs/PROJECT_HANDOVER.md` §5.1.

The `service_role` key committed to git was verified byte-identical to the one in the
working `.env` — the leak was live, not historical.

Mitigating factor: the GitHub repository is **private** (an unauthenticated API request
returns 404). This was not exposed to the open internet. It *was* exposed to every
collaborator, every CI integration, and every existing clone — which matters during a
notice-period handover.

### Done in code

- [x] `git rm --cached .env` — untracked; the local file is untouched and the app still runs
- [x] Live values removed from `docs/PROJECT_HANDOVER.md` §5.1, replaced with a pointer
- [x] Removed hardcoded connection fallbacks in `src/services/supabaseService.ts` and
      `src/lib/supabase.ts` so a missing/rotated key fails loudly instead of silently
      connecting with a stale or truncated credential

### To do — requires dashboard access

**1. Rotate every key that was ever committed.** Treat all of these as compromised:

| Key | Where to rotate | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → Rotate | **Highest priority.** Bypasses RLS entirely. |
| `SUPABASE_SECRET_KEY` (`sb_secret_…`) | Supabase → Settings → API | Same blast radius. |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API | Rotating invalidates deployed bundles — redeploy right after. |
| `GEMINI_API_KEY` | Google AI Studio | Also currently shipped in the browser bundle; see Part 3. |
| `FIREBASE_API_KEY` | — | **Not a secret.** Firebase API keys are public identifiers by design. Do not rotate; secure with Firebase Auth authorized domains + security rules instead. |

**2. Drop the unused keys from `.env`.** `VITE_SUPABASE_SERVICE_ROLE_KEY` and
`VITE_SUPABASE_SECRET_KEY` are not read by any frontend code. A `VITE_`-prefixed variable
is inlined into the client bundle by Vite, so keeping admin keys under that prefix risks
publishing them the moment someone references one. Remove both, and never give a secret a
`VITE_` prefix.

**3. Purge the secrets from git history.** Only after rotation, and coordinate with
everyone holding a clone — this rewrites every commit hash.

```bash
# Back up first
git clone --mirror git@github-office:handysolverteam/bni-go-green-app.git backup.git

pip install git-filter-repo   # or: brew install git-filter-repo

git filter-repo --invert-paths --path .env
git filter-repo --replace-text <(echo 'literal:<the-old-service-role-key>==>***REMOVED***')

git push origin --force --all
git push origin --force --tags
```

Every collaborator must then re-clone. Old clones keep the old history, which is exactly
why rotation (step 1) is the step that actually protects you.

**4. Audit for misuse.** Supabase → Logs, and Google Cloud → billing for the Gemini key.
Look for unfamiliar IPs or request spikes.

---

## Part 2 — Row Level Security is not enforced

### What happened

Every table has a policy of the form:

```sql
CREATE POLICY "Public full access members" ON public.members FOR ALL USING (true);
```

RLS is *enabled*, but the policy permits everything, so it has no effect. Verified
empirically: using only the anon key extracted from the public JS bundle, with no login,
all tables returned data — including 787 `members`, 12 `profiles`, and 8 `organizations`
with their 6-digit join codes.

Writes were not tested (a delete probe was deliberately not run against production), but
`FOR ALL USING (true)` supplies `WITH CHECK` from the same expression when omitted, so
inserts/updates/deletes are almost certainly open too.

This also contradicts `public/privacy.html`, which tells users their data is protected.

### Why this cannot be fixed with policies alone

The app authenticates primarily through **Firebase**, falling back to Supabase OAuth.
`org_members.user_id` and `profiles.user_id` therefore hold **Firebase UIDs**, and
Firebase-authenticated requests reach Supabase as the `anon` role with **`auth.uid()` =
NULL**.

Applying conventional `auth.uid()`-based policies right now would lock out every
Firebase user — that is, essentially all of them. The auth architecture must be resolved
first. Options:

| Option | Change | Trade-off |
|---|---|---|
| **A. Supabase Auth only** | Drop the Firebase path; use Supabase Google OAuth everywhere | Smallest code change (already wired in `src/lib/supabase.ts`). Existing rows key on Firebase UIDs, but `fetchUserOrganization()` already auto-heals by email, which covers most of the migration. |
| **B. Firebase → Supabase JWT bridge** | Edge Function mints a Supabase-signed JWT from a verified Firebase token | Keeps the current login UX; adds infrastructure and a token-refresh path. |
| **C. Server-side data access** | All DB access moves behind Edge Functions that verify the Firebase token and use `service_role` | Most secure and most work; the client stops talking to PostgREST directly. |

**Recommended: A**, then apply the policies below.

### Policies to apply once auth is resolved (option A)

Not yet applied — these lock out Firebase-authenticated users until the migration is done.

```sql
-- Replace the permissive policies
DROP POLICY IF EXISTS "Public full access organizations" ON public.organizations;
DROP POLICY IF EXISTS "Public full access org_members"   ON public.org_members;
DROP POLICY IF EXISTS "Public full access profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Public full access members"       ON public.members;
DROP POLICY IF EXISTS "Public full access outreach_logs" ON public.outreach_logs;

-- Helper: the orgs the caller belongs to
CREATE OR REPLACE FUNCTION public.caller_org_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid()::text;
$$;

-- Members: readable/writable only within your own chapter
CREATE POLICY "members_org_scoped" ON public.members
  FOR ALL USING (org_id IN (SELECT public.caller_org_ids()))
  WITH CHECK (org_id IN (SELECT public.caller_org_ids()));

-- Organizations: only chapters you belong to
CREATE POLICY "orgs_member_read" ON public.organizations
  FOR SELECT USING (id IN (SELECT public.caller_org_ids()));

-- Only owners/admins may change chapter settings
CREATE POLICY "orgs_admin_write" ON public.organizations
  FOR UPDATE USING (
    id IN (SELECT org_id FROM public.org_members
           WHERE user_id = auth.uid()::text AND role IN ('owner','admin'))
  );

-- Profiles: your own row is writable; chapter-mates' rows are readable
CREATE POLICY "profiles_self_write" ON public.profiles
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "profiles_chaptermate_read" ON public.profiles
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM public.org_members
                WHERE org_id IN (SELECT public.caller_org_ids()))
  );

-- Membership rows: read within your chapters; only owners/admins may change roles
CREATE POLICY "org_members_read" ON public.org_members
  FOR SELECT USING (org_id IN (SELECT public.caller_org_ids()));

CREATE POLICY "org_members_admin_write" ON public.org_members
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.org_members
               WHERE user_id = auth.uid()::text AND role IN ('owner','admin'))
  );

-- Let a member delete only their OWN membership (the Leave Chapter feature)
CREATE POLICY "org_members_self_leave" ON public.org_members
  FOR DELETE USING (user_id = auth.uid()::text);

-- Outreach logs: your own
CREATE POLICY "outreach_logs_self" ON public.outreach_logs
  FOR ALL USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- Tables that currently have RLS switched off entirely
ALTER TABLE public.outreach_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_org_scoped" ON public.outreach_templates
  FOR ALL USING (org_id IS NULL OR org_id IN (SELECT public.caller_org_ids()));

ALTER TABLE public.ai_chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_org_scoped" ON public.ai_chat_history
  FOR ALL USING (org_id IN (SELECT public.caller_org_ids()));

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_logs_org_scoped" ON public.import_logs
  FOR ALL USING (org_id IN (SELECT public.caller_org_ids()));
```

Apply to a **branch/staging database first** and run the checklist in
`PROJECT_HANDOVER.md` §9 before touching production.

### Also note

Role checks in the UI (`isAdminOrOwner`, the `adminOnly` sidebar flag) are cosmetic — they
only hide interface elements. Until RLS is enforced, any member can call the REST API
directly to promote themselves or delete a roster. The sole-owner guard on Leave Chapter
is likewise a UX guard, not a security control.

---

## Part 3 — Follow-ups (not part of the two critical items)

- **Gemini key ships in the browser.** Confirmed inlined in `dist/assets/index-*.js`.
  Any `VITE_*` var is public. Proxy Gemini through an Edge Function.
- **`xlsx@0.18.5`** — prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS
  (GHSA-5pgg-2g8v-p4x9), no fix available, and users upload untrusted `.xlsx` parsed
  client-side. Move to the `https://cdn.sheetjs.com` build or `exceljs`.
- **Unbounded avatar upload** — `readAsDataURL` with no size cap writes base64 into a DB
  TEXT column and localStorage. Cap ~2MB and downscale on a canvas.
- **`privacy.html`** claims data is protected; align it with reality once RLS is enforced.
