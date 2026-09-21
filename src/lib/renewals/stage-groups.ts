import type { DashboardCycle, RenewalStage } from "./types";
import { renewalStages } from "./stage";

export type StageGroup = {
  stage: RenewalStage;
  cycles: DashboardCycle[];
};

export function groupCyclesByStage(cycles: DashboardCycle[]): StageGroup[] {
  return renewalStages.map((stage) => ({
    stage,
    cycles: cycles.filter((cycle) => cycle.stage === stage),
  }));
}

export function getDefaultMobileStage(cycles: DashboardCycle[]): RenewalStage {
  return groupCyclesByStage(cycles).find((group) => group.cycles.length > 0)?.stage ?? "MC Discussion";
}
