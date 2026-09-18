// Renewals-domain "roles" — a free-form catalog of historical BNI leadership
// titles (President, Membership Committee, etc.) a member has held, for
// achievements/bio display. NOT Handychapter's own owner/admin/member RBAC
// (see src/types/index.ts's UserRole) — different concept, same word.

export function normalizeRoleName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sanitizeRoleName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function buildRoleOrderUpdates(assignmentIds: string[]) {
  return assignmentIds.map((id, index) => ({
    id,
    display_order: index,
  }));
}
