import type { MemberPalmsSnapshot, MemberTrafficLight } from "./types";
import { isExactMonthlyPalmsSnapshot } from "./palms-monthly-performance";
import { buildPerformanceAverages, type PerformanceAverages } from "./performance-averages";

export type MemberAchievements = {
  source: "palms" | "traffic_lights" | "none";
  reportFrom: string | null;
  reportTo: string | null;
  chapterName: string | null;
  attendance: {
    presents: number;
    absences: number;
    late: number;
    medical: number;
    substitute: number;
  };
  referrals: {
    givenInside: number | null;
    givenOutside: number | null;
    givenTotal: number;
    receivedInside: number | null;
    receivedOutside: number | null;
    receivedTotal: number;
  };
  visitors: number;
  oneToOnes: number | null;
  tyfcb: number | null;
  ceu: number | null;
  trainings: number;
  testimonials: number | null;
  averages: PerformanceAverages;
};

export function selectLifetimePalmsSnapshot(
  snapshots: MemberPalmsSnapshot[],
): MemberPalmsSnapshot | null {
  const sorted = [...snapshots].sort((left, right) => right.report_to.localeCompare(left.report_to));
  const lifetimeSnapshot = sorted.find((snapshot) => !isExactMonthlyPalmsSnapshot(snapshot));

  return lifetimeSnapshot ?? sorted[0] ?? null;
}

export function buildMemberAchievements(
  palmsSnapshot: MemberPalmsSnapshot | null,
  trafficLightHistory: MemberTrafficLight[],
): MemberAchievements {
  if (palmsSnapshot) {
    return {
      source: "palms",
      reportFrom: palmsSnapshot.report_from,
      reportTo: palmsSnapshot.report_to,
      chapterName: palmsSnapshot.chapter_name,
      attendance: {
        presents: palmsSnapshot.present_count,
        absences: palmsSnapshot.absent_count,
        late: palmsSnapshot.late_count,
        medical: palmsSnapshot.medical_count,
        substitute: palmsSnapshot.substitute_count,
      },
      referrals: {
        givenInside: palmsSnapshot.referrals_given_inside,
        givenOutside: palmsSnapshot.referrals_given_outside,
        givenTotal: palmsSnapshot.referrals_given_inside + palmsSnapshot.referrals_given_outside,
        receivedInside: palmsSnapshot.referrals_received_inside,
        receivedOutside: palmsSnapshot.referrals_received_outside,
        receivedTotal:
          palmsSnapshot.referrals_received_inside + palmsSnapshot.referrals_received_outside,
      },
      visitors: palmsSnapshot.visitors,
      oneToOnes: palmsSnapshot.one_to_ones,
      tyfcb: palmsSnapshot.tyfcb,
      ceu: palmsSnapshot.ceu,
      trainings: palmsSnapshot.trainings,
      testimonials: null,
      averages: buildPerformanceAverages({
        reportFrom: palmsSnapshot.report_from,
        reportTo: palmsSnapshot.report_to,
        referralsGiven: palmsSnapshot.referrals_given_inside + palmsSnapshot.referrals_given_outside,
        oneToOnes: palmsSnapshot.one_to_ones,
        visitors: palmsSnapshot.visitors,
        trainings: palmsSnapshot.trainings,
      }),
    };
  }

  if (trafficLightHistory.length === 0) {
    return {
      source: "none",
      reportFrom: null,
      reportTo: null,
      chapterName: null,
      attendance: { presents: 0, absences: 0, late: 0, medical: 0, substitute: 0 },
      referrals: {
        givenInside: null,
        givenOutside: null,
        givenTotal: 0,
        receivedInside: null,
        receivedOutside: null,
        receivedTotal: 0,
      },
      visitors: 0,
      oneToOnes: null,
      tyfcb: null,
      ceu: null,
      trainings: 0,
      testimonials: null,
      averages: buildPerformanceAverages({
        reportFrom: null,
        reportTo: null,
        referralsGiven: 0,
        oneToOnes: null,
        visitors: 0,
        trainings: 0,
      }),
    };
  }

  const trafficLightSummary = trafficLightHistory.reduce<MemberAchievements>(
    (summary, trafficLight) => ({
      ...summary,
      source: "traffic_lights",
      reportFrom: summary.reportFrom ?? trafficLight.report_month,
      reportTo: trafficLight.report_month,
      attendance: {
        presents: summary.attendance.presents + trafficLight.present_count,
        absences: summary.attendance.absences + trafficLight.absent_count,
        late: summary.attendance.late + trafficLight.late_count,
        medical: summary.attendance.medical + trafficLight.medical_count,
        substitute: summary.attendance.substitute + trafficLight.substitute_count,
      },
      referrals: {
        ...summary.referrals,
        givenTotal: summary.referrals.givenTotal + trafficLight.referrals_given,
        receivedTotal: summary.referrals.receivedTotal + trafficLight.referrals_received,
      },
      visitors: summary.visitors + trafficLight.visitors,
      trainings: summary.trainings + trafficLight.trainings,
      testimonials: (summary.testimonials ?? 0) + trafficLight.testimonials,
      tyfcb: (summary.tyfcb ?? 0) + (trafficLight.tyfcb ?? 0),
    }),
    {
      source: "traffic_lights",
      reportFrom: null,
      reportTo: null,
      chapterName: null,
      attendance: { presents: 0, absences: 0, late: 0, medical: 0, substitute: 0 },
      referrals: {
        givenInside: null,
        givenOutside: null,
        givenTotal: 0,
        receivedInside: null,
        receivedOutside: null,
        receivedTotal: 0,
      },
      visitors: 0,
      oneToOnes: null,
      tyfcb: 0,
      ceu: null,
      trainings: 0,
      testimonials: 0,
      averages: buildPerformanceAverages({
        reportFrom: null,
        reportTo: null,
        referralsGiven: 0,
        oneToOnes: null,
        visitors: 0,
        trainings: 0,
      }),
    },
  );

  return {
    ...trafficLightSummary,
    averages: buildPerformanceAverages({
      reportFrom: trafficLightSummary.reportFrom,
      reportTo: trafficLightSummary.reportTo,
      referralsGiven: trafficLightSummary.referrals.givenTotal,
      oneToOnes: trafficLightSummary.oneToOnes,
      visitors: trafficLightSummary.visitors,
      trainings: trafficLightSummary.trainings,
    }),
  };
}
