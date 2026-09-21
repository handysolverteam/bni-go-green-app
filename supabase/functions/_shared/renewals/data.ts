// Adapted from bni-rrc's lib/renewals/data.ts — the read-query layer behind
// bni-rrc's dashboard/achievements/member-detail pages. Not a DB-writer, but
// excluded from the Phase 1 client-side port (see docs/BNI_RRC_MIGRATION.md)
// because it calls getServiceSupabase() like the other 9 excluded files.
// Business logic unchanged; adaptations: explicit `supabase` client param,
// tables qualified into the `renewals` schema.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  AchievementMemberListItem,
  ChapterRole,
  DashboardCycle,
  Member,
  MemberAlias,
  MemberPastRoleEntry,
  MemberPalmsSnapshot,
  MemberSponsorAchievement,
  MemberTrainingAchievement,
  MemberTrafficLight,
  RenewalAssignment,
  RenewalCycle,
  RenewalTask,
} from "./types.ts";
import { selectLifetimePalmsSnapshot } from "./achievements.ts";
import { buildSponsorAchievementSummary } from "./sponsor-achievements.ts";
import { calculateStage, getDerivedRenewalDates, isWithinRenewalWorkWindow } from "./stage.ts";
import { buildTrainingAchievementSummary } from "./training-achievements.ts";
import { isExactMonthlyPalmsSnapshot } from "./palms-window.ts";
import { isActiveRenewalTaskType } from "./task-types.ts";
import { getMemberAliases } from "./member-aliases.ts";
import { PAST_YEAR_TRAFFIC_LIGHT_LIMIT, groupTrafficLightHistoryByMember } from "./traffic-light-history.ts";

function isMissingSchemaError(error: unknown, ...needles: string[]): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message = typeof maybeError.message === "string" ? maybeError.message.toLowerCase() : "";
  const details = typeof maybeError.details === "string" ? maybeError.details.toLowerCase() : "";
  const combined = `${message} ${details}`;

  return code === "42P01" || needles.some((needle) => combined.includes(needle));
}

type RenewalCycleRow = RenewalCycle & {
  members: Member | null;
  renewal_assignments: Array<RenewalAssignment & { members: Pick<Member, "id" | "name" | "industry"> | null }>;
  renewal_tasks: RenewalTask[];
};

export function enrichCycle(row: RenewalCycleRow, today = new Date(), trafficLightHistory: MemberTrafficLight[] = []): DashboardCycle {
  return {
    ...row,
    member: row.members!,
    latest_traffic_light: trafficLightHistory[0] ?? null,
    traffic_light_history: trafficLightHistory,
    stage: calculateStage(
      {
        renewal_date: row.renewal_date,
        status: row.status,
        renewal_tasks: row.renewal_tasks,
      },
      today,
    ),
    derived_dates: getDerivedRenewalDates(row.renewal_date),
    assignments: row.renewal_assignments.map((assignment) => ({
      ...assignment,
      assignee: assignment.members ?? undefined,
    })),
    open_task_count: row.renewal_tasks.filter((task) => task.status === "open" && isActiveRenewalTaskType(task.task_type)).length,
  };
}

async function getTrafficLightHistoriesByMember(
  supabase: SupabaseClient,
  memberIds: string[],
  limit?: number | null,
): Promise<Map<string, MemberTrafficLight[]>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .schema("renewals")
    .from("member_traffic_lights")
    .select("*")
    .in("member_id", memberIds)
    .order("report_month", { ascending: false });

  if (error) {
    throw error;
  }

  return groupTrafficLightHistoryByMember((data ?? []) as MemberTrafficLight[], limit);
}

async function getLatestPalmsSnapshotsByMember(
  supabase: SupabaseClient,
  memberIds: string[],
): Promise<Map<string, MemberPalmsSnapshot>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .schema("renewals")
    .from("member_palms_snapshots")
    .select("*")
    .in("member_id", memberIds)
    .order("report_to", { ascending: false });

  if (error) {
    throw error;
  }

  const snapshotsByMember = new Map<string, MemberPalmsSnapshot[]>();

  for (const row of (data ?? []) as MemberPalmsSnapshot[]) {
    const snapshots = snapshotsByMember.get(row.member_id) ?? [];
    snapshots.push(row);
    snapshotsByMember.set(row.member_id, snapshots);
  }

  const snapshots = new Map<string, MemberPalmsSnapshot>();

  for (const [memberId, memberSnapshots] of snapshotsByMember) {
    const selectedSnapshot = selectLifetimePalmsSnapshot(memberSnapshots);

    if (selectedSnapshot) {
      snapshots.set(memberId, selectedSnapshot);
    }
  }

  return snapshots;
}

async function getPalmsSnapshotsByMember(
  supabase: SupabaseClient,
  memberIds: string[],
): Promise<Map<string, MemberPalmsSnapshot[]>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .schema("renewals")
    .from("member_palms_snapshots")
    .select("*")
    .in("member_id", memberIds)
    .order("report_to", { ascending: false });

  if (error) {
    throw error;
  }

  const grouped = new Map<string, MemberPalmsSnapshot[]>();

  for (const row of (data ?? []) as MemberPalmsSnapshot[]) {
    const snapshots = grouped.get(row.member_id) ?? [];
    snapshots.push(row);
    grouped.set(row.member_id, snapshots);
  }

  return grouped;
}

async function getAvailableRoles(supabase: SupabaseClient): Promise<ChapterRole[]> {
  const { data, error } = await supabase.schema("renewals").from("chapter_roles").select("*").order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ChapterRole[];
}

async function getPastRolesByMember(supabase: SupabaseClient, memberIds: string[]): Promise<Map<string, MemberPastRoleEntry[]>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .schema("renewals")
    .from("member_past_roles")
    .select("*, role:chapter_roles (*)")
    .in("member_id", memberIds)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const grouped = new Map<string, MemberPastRoleEntry[]>();

  for (const row of (data ?? []) as MemberPastRoleEntry[]) {
    const entries = grouped.get(row.member_id) ?? [];
    entries.push(row);
    grouped.set(row.member_id, entries);
  }

  return grouped;
}

async function getSponsorAchievementsByMember(
  supabase: SupabaseClient,
  memberIds: string[],
): Promise<Map<string, MemberSponsorAchievement[]>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .schema("renewals")
      .from("member_sponsor_achievements")
      .select("*")
      .in("member_id", memberIds)
      .order("application_date", { ascending: false })
      .order("sponsored_full_name", { ascending: true });

    if (error) {
      if (isMissingSchemaError(error, "member_sponsor_achievements", "sponsor achievements")) {
        return new Map();
      }

      throw error;
    }

    const grouped = new Map<string, MemberSponsorAchievement[]>();

    for (const row of (data ?? []) as MemberSponsorAchievement[]) {
      const achievements = grouped.get(row.member_id) ?? [];
      achievements.push(row);
      grouped.set(row.member_id, achievements);
    }

    return grouped;
  } catch (error) {
    if (isMissingSchemaError(error, "member_sponsor_achievements", "sponsor achievements")) {
      return new Map();
    }

    throw error;
  }
}

async function getTrainingAchievementsByMember(
  supabase: SupabaseClient,
  memberIds: string[],
): Promise<Map<string, MemberTrainingAchievement[]>> {
  if (memberIds.length === 0) {
    return new Map();
  }

  try {
    const { data, error } = await supabase
      .schema("renewals")
      .from("member_training_achievements")
      .select("*")
      .in("member_id", memberIds)
      .order("event_date", { ascending: false })
      .order("event_type", { ascending: true });

    if (error) {
      if (isMissingSchemaError(error, "member_training_achievements", "training achievements")) {
        return new Map();
      }

      throw error;
    }

    const grouped = new Map<string, MemberTrainingAchievement[]>();

    for (const row of (data ?? []) as MemberTrainingAchievement[]) {
      const achievements = grouped.get(row.member_id) ?? [];
      achievements.push(row);
      grouped.set(row.member_id, achievements);
    }

    return grouped;
  } catch (error) {
    if (isMissingSchemaError(error, "member_training_achievements", "training achievements")) {
      return new Map();
    }

    throw error;
  }
}

async function getLatestTrainingReportAnchor(supabase: SupabaseClient, importBatchIds: string[]): Promise<string | null> {
  if (importBatchIds.length === 0) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .schema("renewals")
      .from("import_batches")
      .select("source_report_to")
      .in("id", importBatchIds)
      .not("source_report_to", "is", null)
      .order("source_report_to", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    return (data?.[0]?.source_report_to as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function getDashboardCycles(supabase: SupabaseClient, today = new Date()): Promise<DashboardCycle[]> {
  const { data, error } = await supabase
    .schema("renewals")
    .from("renewal_cycles")
    .select(
      `
      *,
      members (*),
      renewal_assignments (
        *,
        members:assignee_member_id (id, name, industry)
      ),
      renewal_tasks (*)
    `,
    )
    .order("renewal_date", { ascending: true });

  if (error) {
    throw error;
  }

  const rows = ((data ?? []) as RenewalCycleRow[]).filter((row) => row.members && isWithinRenewalWorkWindow(row.renewal_date, today));
  const trafficLightHistories = await getTrafficLightHistoriesByMember(
    supabase,
    rows.map((row) => row.member_id),
  );

  return rows.map((row) => enrichCycle(row, today, trafficLightHistories.get(row.member_id) ?? []));
}

export async function getAchievementMembers(supabase: SupabaseClient, today = new Date()): Promise<AchievementMemberListItem[]> {
  const { data: members, error: membersError } = await supabase.schema("renewals").from("members").select("*").order("name", { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const memberRows = (members ?? []) as Member[];
  const memberIds = memberRows.map((member) => member.id);

  const { data: cycles, error: cyclesError } = await supabase
    .schema("renewals")
    .from("renewal_cycles")
    .select(
      `
      *,
      members (*),
      renewal_assignments (
        *,
        members:assignee_member_id (id, name, industry)
      ),
      renewal_tasks (*)
    `,
    )
    .in("member_id", memberIds)
    .order("renewal_date", { ascending: false });

  if (cyclesError) {
    throw cyclesError;
  }

  const trafficLightHistories = await getTrafficLightHistoriesByMember(supabase, memberIds);
  const latestPalmsSnapshots = await getLatestPalmsSnapshotsByMember(supabase, memberIds);
  const latestCyclesByMember = new Map<string, DashboardCycle>();

  for (const row of (cycles ?? []) as RenewalCycleRow[]) {
    if (latestCyclesByMember.has(row.member_id)) {
      continue;
    }

    const member = memberRows.find((currentMember) => currentMember.id === row.member_id);

    if (!member) {
      continue;
    }

    latestCyclesByMember.set(row.member_id, enrichCycle({ ...row, members: member }, today, trafficLightHistories.get(row.member_id) ?? []));
  }

  return memberRows.map((member) => ({
    member,
    currentCycle: latestCyclesByMember.get(member.id) ?? null,
    latestPalmsSnapshot: latestPalmsSnapshots.get(member.id) ?? null,
  }));
}

export async function getMemberDetail(supabase: SupabaseClient, memberId: string, today = new Date()) {
  const { data: member, error: memberError } = await supabase.schema("renewals").from("members").select("*").eq("id", memberId).single();

  if (memberError) {
    throw memberError;
  }

  const { data: cycles, error: cyclesError } = await supabase
    .schema("renewals")
    .from("renewal_cycles")
    .select(
      `
      *,
      members (*),
      renewal_assignments (
        *,
        members:assignee_member_id (id, name, industry)
      ),
      renewal_tasks (*)
    `,
    )
    .eq("member_id", memberId)
    .order("renewal_date", { ascending: false });

  if (cyclesError) {
    throw cyclesError;
  }

  const trafficLightHistories = await getTrafficLightHistoriesByMember(supabase, [memberId], PAST_YEAR_TRAFFIC_LIGHT_LIMIT);
  const trafficLightHistory = trafficLightHistories.get(memberId) ?? [];
  const latestPalmsSnapshots = await getLatestPalmsSnapshotsByMember(supabase, [memberId]);
  const palmsSnapshotsByMember = await getPalmsSnapshotsByMember(supabase, [memberId]);
  let memberAliases: MemberAlias[] = [];

  try {
    memberAliases = await getMemberAliases(supabase, memberId);
  } catch (error) {
    if (!isMissingSchemaError(error, "member_aliases")) {
      throw error;
    }
  }

  const [availableRoles, pastRolesByMember, sponsorAchievementsByMember, trainingAchievementsByMember] = await Promise.all([
    getAvailableRoles(supabase),
    getPastRolesByMember(supabase, [memberId]),
    getSponsorAchievementsByMember(supabase, [memberId]),
    getTrainingAchievementsByMember(supabase, [memberId]),
  ]);
  const enrichedCycles = ((cycles ?? []) as RenewalCycleRow[]).map((row) => enrichCycle({ ...row, members: member as Member }, today, trafficLightHistory));
  const sponsorSummary = buildSponsorAchievementSummary(sponsorAchievementsByMember.get(memberId) ?? [], today);
  const trainingSummary = buildTrainingAchievementSummary(trainingAchievementsByMember.get(memberId) ?? [], today);
  const trainingAchievements = trainingAchievementsByMember.get(memberId) ?? [];
  const latestExactMonthlyPalmsReportTo = (palmsSnapshotsByMember.get(memberId) ?? [])
    .filter(isExactMonthlyPalmsSnapshot)
    .map((snapshot) => snapshot.report_to)
    .sort((left, right) => right.localeCompare(left))[0];
  const latestTrainingReportAnchor = await getLatestTrainingReportAnchor(
    supabase,
    [...new Set(trainingAchievements.map((item) => item.import_batch_id).filter((id): id is string => Boolean(id)))],
  );
  const performanceAnchorDate = latestExactMonthlyPalmsReportTo ?? latestTrainingReportAnchor ?? today.toISOString().slice(0, 10);

  return {
    member: member as Member,
    currentCycle: enrichedCycles[0] ?? null,
    cycles: enrichedCycles,
    latestPalmsSnapshot: latestPalmsSnapshots.get(memberId) ?? null,
    palmsSnapshots: palmsSnapshotsByMember.get(memberId) ?? [],
    sponsorAchievements: sponsorAchievementsByMember.get(memberId) ?? [],
    sponsorSummary,
    trainingAchievements,
    trainingSummary,
    performanceAnchorDate,
    availableRoles,
    pastRoles: pastRolesByMember.get(memberId) ?? [],
    aliases: memberAliases,
  };
}

export async function getCommitteeMembers(supabase: SupabaseClient): Promise<Member[]> {
  const { data, error } = await supabase.schema("renewals").from("members").select("*").eq("is_committee", true).order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Member[];
}
