import { formatDisplayDate, formatDisplayMonth } from "./date-format";
import type { MemberAchievements } from "./achievements";
import type { MemberPastRoleEntry, MemberTrafficLight } from "./types";
import { sortTrafficLightHistoryForDisplay } from "./traffic-light-history";

function formatNumber(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTrafficLightSummary(history: MemberTrafficLight[]): string | null {
  const recentTrafficLights = sortTrafficLightHistoryForDisplay(history).slice(-6).reverse();

  if (recentTrafficLights.length === 0) {
    return null;
  }

  return recentTrafficLights
    .map((trafficLight) => {
      const colorEmoji =
        trafficLight.color === "green"
          ? "🟢"
          : trafficLight.color === "yellow"
            ? "🟡"
            : trafficLight.color === "red"
              ? "🔴"
              : "⚪";
      return `${formatDisplayMonth(trafficLight.report_month).split(" ")[0]} ${colorEmoji}`;
    })
    .join(" | ");
}

export function buildMemberAchievementShareText({
  memberName,
  roles,
  renewalLabel,
  tenureLabel,
  joiningDateLabel,
  achievements,
  trafficLightHistory,
}: {
  memberName: string;
  roles: MemberPastRoleEntry[];
  renewalLabel: string;
  tenureLabel: string;
  joiningDateLabel: string;
  achievements: MemberAchievements;
  trafficLightHistory: MemberTrafficLight[];
}): string {
  const roleText =
    roles.length > 0 ? roles.map((pastRole) => pastRole.role.name).join(", ") : "No past roles added yet";
  const joiningText = joiningDateLabel === "-" ? "Joining date not set" : joiningDateLabel;
  const lines = [
    `🌟 Celebrating ${memberName} 🌟`,
    "",
    `🏆 Roles held: ${roleText}`,
    `🔄 ${renewalLabel}`,
    `📅 Member for ${tenureLabel} | Joined ${joiningText}`,
    "",
    `🤝 Referrals given: ${formatNumber(achievements.referrals.givenTotal)}`,
    `👥 1-to-1s done: ${formatNumber(achievements.oneToOnes)}`,
    `💰 TYFCB: ${formatCurrency(achievements.tyfcb)}`,
    `🙌 Visitors: ${formatNumber(achievements.visitors)}`,
    `✅ Absences: ${formatNumber(achievements.attendance.absences)}`,
    "",
    "📊 Averages:",
    `🤝 Referrals / week: ${formatNumber(achievements.averages.referralsGivenPerWeek)}`,
    `👥 1-to-1s / week: ${formatNumber(achievements.averages.oneToOnesPerWeek)}`,
    `🙌 Visitors / month: ${formatNumber(achievements.averages.visitorsPerMonth)}`,
    `📚 Trainings / month: ${formatNumber(achievements.averages.trainingsPerMonth)}`,
  ];

  const trafficLightSummary = formatTrafficLightSummary(trafficLightHistory);

  if (trafficLightSummary) {
    lines.push("");
    lines.push("🚦 Last 6 months:");
    lines.push(trafficLightSummary);
  }

  if (achievements.source === "palms" && achievements.reportTo) {
    lines.push("");
    lines.push(`📌 Achievements updated till ${formatDisplayDate(achievements.reportTo)}`);
  }

  lines.push("");
  lines.push("Regards,");
  lines.push("Retention and Renewal Coordinators");
  lines.push("Team Moneyfestation");

  return lines.join("\n");
}
