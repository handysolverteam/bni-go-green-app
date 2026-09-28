import type { UserRole } from '../types';

// UI-facing labels only — the underlying org_members.role DB values stay
// 'owner'/'admin'/'member' (see supabase/migrations/007_committees_and_role_check.sql
// for why: renaming would touch every existing row across 8 live chapters and every
// call site for zero functional gain, since the requirement is new labels, not new
// values).
//
// Deliberately real BNI titles, not "Superadmin" — that word is now reserved for the
// separate, cross-organization Platform Admin role (see migration 009), and having both
// a per-chapter "Superadmin" and a platform-wide one confused people (2026-09-28).
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'President',
  admin: 'Vice President',
  member: 'Member',
};

export const ROLE_LABELS_SHORT: Record<UserRole, string> = {
  owner: 'President',
  admin: 'VP',
  member: 'Member',
};
