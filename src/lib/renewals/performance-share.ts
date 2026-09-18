import { formatDisplayDate, formatDisplayMonth } from "./date-format";
import type { MonthlyPalmsPerformance } from "./palms-monthly-performance";
import type { PastYearPerformance } from "./past-year-performance";
import type { PastYearTrainingPerformance } from "./past-year-training-performance";
import { buildPerformanceAverages } from "./performance-averages";

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

function formatTrafficLightSummary(performance: PastYearPerformance): string | null {
  if (performance.history.length === 0) {
    return null;
  }

  return [...performance.history]
    .reverse()
    .map((trafficLight) => {
      const colorEmoji =
        trafficLight.color === "green"
          ? "🟢"
          : trafficLight.color === "yellow"
            ? "🟡"
            : trafficLight.color === "red"
              ? "🔴"
              : "⚪";

      const label = trafficLight.report_window_end ?? trafficLight.report_month;
      return `${formatDisplayMonth(label).split(" ")[0]} ${trafficLight.score} ${colorEmoji}`;
    })
    .join(" | ");
}

export function buildMemberPerformanceShareText({
  memberName,
  periodMonths = 12,
  palmsPerformance,
  palmsRange,
  trainingPerformance,
  trainingRange,
  trafficLightPerformance,
  trafficLightRange,
}: {
  memberName: string;
  periodMonths?: 6 | 12;
  palmsPerformance: MonthlyPalmsPerformance;
  palmsRange: string | null;
  trainingPerformance: PastYearTrainingPerformance;
  trainingRange: string | null;
  trafficLightPerformance: PastYearPerformance;
  trafficLightRange: string | null;
}): string {
  const averages = buildPerformanceAverages({
    reportFrom: trainingPerformance.windowStart,
    reportTo: trainingPerformance.anchorDate,
    referralsGiven: palmsPerformance.totals.referralsGiven,
    oneToOnes: palmsPerformance.totals.oneToOnes,
    visitors: palmsPerformance.totals.visitors,
    trainings: trainingPerformance.count,
  });
  const lines = [
    `🌟 ${periodMonths === 12 ? "Past year" : `Past ${periodMonths} months`} performance of ${memberName} 🌟`,
    "",
    `📅 Monthly PALMS coverage: ${palmsPerformance.monthsCovered} month${palmsPerformance.monthsCovered === 1 ? "" : "s"}`,
  ];

  if (palmsRange) {
    lines.push(`📌 PALMS range: ${palmsRange}`);
  }

  if (trafficLightRange) {
    lines.push(`🚦 Traffic-light range: ${trafficLightRange}`);
  }

  if (trainingRange) {
    lines.push(`📚 Training range: ${trainingRange}`);
  }

  lines.push("");
  lines.push(`🤝 Referrals given: ${formatNumber(palmsPerformance.totals.referralsGiven)}`);
  lines.push(`📥 Referrals received: ${formatNumber(palmsPerformance.totals.referralsReceived)}`);
  lines.push(`🙌 Visitors: ${formatNumber(palmsPerformance.totals.visitors)}`);
  lines.push(`👥 1-to-1s: ${formatNumber(palmsPerformance.totals.oneToOnes)}`);
  lines.push(`💰 TYFCB: ${formatCurrency(palmsPerformance.totals.tyfcb)}`);
  lines.push(`✅ Presents: ${formatNumber(palmsPerformance.totals.presents)}`);
  lines.push(`⚠️ Absences: ${formatNumber(palmsPerformance.totals.absences)}`);
  lines.push(`🎓 CEU: ${formatNumber(palmsPerformance.totals.ceu)}`);
  lines.push(`📚 Trainings: ${formatNumber(trainingPerformance.count)}`);

  lines.push("");
  lines.push("📊 Averages:");
  lines.push(`🤝 Referrals / week: ${formatNumber(averages.referralsGivenPerWeek)}`);
  lines.push(`👥 1-to-1s / week: ${formatNumber(averages.oneToOnesPerWeek)}`);
  lines.push(`🙌 Visitors / month: ${formatNumber(averages.visitorsPerMonth)}`);
  lines.push(`📚 Trainings / month: ${formatNumber(averages.trainingsPerMonth)}`);

  if (trafficLightPerformance.snapshotsCovered > 0) {
    lines.push("");
    lines.push(
      `📈 Traffic-light score: Avg ${formatNumber(trafficLightPerformance.scores.average)} | Best ${formatNumber(trafficLightPerformance.scores.best)} | Worst ${formatNumber(trafficLightPerformance.scores.worst)}`,
    );
  }

  const trafficLightSummary = formatTrafficLightSummary(trafficLightPerformance);

  if (trafficLightSummary) {
    lines.push("");
    lines.push(`🚦 Last ${periodMonths} traffic-light snapshots:`);
    lines.push(trafficLightSummary);
  }

  if (palmsPerformance.monthlySnapshots.length > 0) {
    lines.push("");
    lines.push(
      `🗓️ Performance updated till ${formatDisplayDate(
        palmsPerformance.monthlySnapshots[palmsPerformance.monthlySnapshots.length - 1].report_to,
      )}`,
    );
  }

  lines.push("");
  lines.push("Regards,");
  lines.push("Retention and Renewal Coordinators");
  lines.push("Team Moneyfestation");

  return lines.join("\n");
}
