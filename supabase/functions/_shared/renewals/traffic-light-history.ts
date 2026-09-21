// Direct port of bni-rrc's lib/renewals/traffic-light-history.ts (also
// ported for the client bundle at src/lib/renewals/traffic-light-history.ts).
// Pure, Deno-compatible.

import type { MemberTrafficLight } from "./types.ts";

export const TRAFFIC_LIGHT_HISTORY_LIMIT = 6;
export const PAST_YEAR_TRAFFIC_LIGHT_LIMIT = 12;

export function groupTrafficLightHistoryByMember(
  trafficLights: MemberTrafficLight[],
  limit: number | null = TRAFFIC_LIGHT_HISTORY_LIMIT,
): Map<string, MemberTrafficLight[]> {
  const sorted = [...trafficLights].sort((left, right) => {
    if (left.member_id !== right.member_id) {
      return left.member_id.localeCompare(right.member_id);
    }

    return right.report_month.localeCompare(left.report_month);
  });
  const histories = new Map<string, MemberTrafficLight[]>();

  for (const trafficLight of sorted) {
    const history = histories.get(trafficLight.member_id) ?? [];

    if (limit === null || history.length < limit) {
      history.push(trafficLight);
      histories.set(trafficLight.member_id, history);
    }
  }

  return histories;
}

export function sortTrafficLightHistoryForDisplay(history: MemberTrafficLight[]): MemberTrafficLight[] {
  return [...history].sort((left, right) => left.report_month.localeCompare(right.report_month));
}
