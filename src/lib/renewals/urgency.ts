export type UrgencyLabel = "overdue" | "due_soon" | "upcoming";
export type UrgencyColor = "red" | "yellow" | "green";

export type Urgency = {
  urgency_score: 100 | 70 | 30;
  urgency_label: UrgencyLabel;
  color: UrgencyColor;
};

export const DUE_SOON_DAYS = 10;

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function todayDateOnly(today: Date): Date {
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

export function getUrgency(dueDate: string, today = new Date()): Urgency {
  const due = parseDateOnly(dueDate);
  const current = todayDateOnly(today);
  const daysUntilDue = Math.floor((due.getTime() - current.getTime()) / 86_400_000);

  if (daysUntilDue < 0) {
    return {
      urgency_score: 100,
      urgency_label: "overdue",
      color: "red",
    };
  }

  if (daysUntilDue <= DUE_SOON_DAYS) {
    return {
      urgency_score: 70,
      urgency_label: "due_soon",
      color: "yellow",
    };
  }

  return {
    urgency_score: 30,
    urgency_label: "upcoming",
    color: "green",
  };
}
