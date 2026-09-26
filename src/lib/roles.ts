import type { UserRole } from '../types';

// UI-facing labels only — the underlying org_members.role DB values stay
// 'owner'/'admin'/'member' (see supabase/migrations/007_committees_and_role_check.sql
// for why: renaming would touch every existing row across 8 live chapters and every
// call site for zero functional gain, since the requirement is new labels, not new
// values).
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Superadmin (President)',
  admin: 'Admin (Vice-President)',
  member: 'Member',
};

export const ROLE_LABELS_SHORT: Record<UserRole, string> = {
  owner: 'Superadmin',
  admin: 'Admin',
  member: 'Member',
};
