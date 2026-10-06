import type { UserRole } from '../types';

// UI-facing labels only — the underlying org_members.role DB values stay
// 'owner'/'admin'/'member' (see supabase/migrations/007_committees_and_role_check.sql
// for why: renaming would touch every existing row across 8 live chapters and every
// call site for zero functional gain, since the requirement is new labels, not new
// values).
//
// Two labels only: Admin and Member. The President/Vice President titles were dropped
// (2026-10-06) because the distinction confused people and bought nothing — every RLS policy
// treats 'owner' and 'admin' identically (`role in ('owner','admin')`), so a "Vice President"
// already had exactly the President's permissions.
//
// 'owner' and 'admin' therefore share the "Admin" label. They remain distinct DB values
// because 'owner' still marks who holds the chapter: ownership transfer, and the "you're the
// last one who can manage this chapter" guards on leaving/deleting an account, all key off it.
// That one advanced flow says "primary admin" rather than inventing a third role name.
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Admin',
  admin: 'Admin',
  member: 'Member',
};

export const ROLE_LABELS_SHORT: Record<UserRole, string> = {
  owner: 'Admin',
  admin: 'Admin',
  member: 'Member',
};
