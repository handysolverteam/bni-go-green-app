import type { Committee, UserRole } from '../types';

// Consolidates what used to be two independently-duplicated `isAdminOrOwner` copies
// (Sidebar.tsx and OrganizationTab.tsx each computed this locally). RBAC Phase 4 —
// see the approved plan. These are UI-convenience helpers only; the actual security
// boundary is Postgres RLS (migration 008, applied after the Third-Party Auth
// cutover) — these must stay in sync with that migration's policies by intent, not
// by mechanism, since a client-side check can never substitute for a DB-level one.

export function isAdminOrOwner(role: UserRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function isSuperadmin(role: UserRole | null | undefined): boolean {
  return role === 'owner';
}

export function canTransferOwnership(role: UserRole | null | undefined): boolean {
  return isSuperadmin(role);
}

export function hasCommittee(
  committees: Committee[] | null | undefined,
  tag: Committee,
): boolean {
  return Boolean(committees?.includes(tag));
}

export function hasFullRosterAccess(
  role: UserRole | null | undefined,
  committees: Committee[] | null | undefined,
): boolean {
  return isAdminOrOwner(role) || hasCommittee(committees, 'go_green');
}

export function hasFullRenewalsAccess(
  role: UserRole | null | undefined,
  committees: Committee[] | null | undefined,
): boolean {
  return isAdminOrOwner(role) || hasCommittee(committees, 'rrc');
}
