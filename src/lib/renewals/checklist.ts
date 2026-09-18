const checklistDateFields = {
  online_form_filled: "online_form_filled_date",
  checklist_filled: "checklist_filled_date",
  payment_link_generated: "payment_link_generated_date",
  payment_made: "payment_made_date",
} as const;

export type ChecklistField = keyof typeof checklistDateFields;

export function buildChecklistUpdates(
  body: Record<string, unknown>,
  today = new Date(),
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const dateOnly = today.toISOString().slice(0, 10);

  for (const [field, dateField] of Object.entries(checklistDateFields)) {
    if (field in body) {
      updates[field] = body[field];
      updates[dateField] = body[field] ? dateOnly : null;
    }
  }

  return updates;
}
