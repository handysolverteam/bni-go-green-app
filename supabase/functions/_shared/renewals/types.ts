// Ported from bni-rrc's lib/types.ts. Trimmed to only the fields these
// Edge Functions actually read/write — see src/lib/renewals/types.ts for
// the full client-side copy used by the (not yet wired up) ported logic.

export type RenewalStatus = "active" | "renewed" | "dropped";

export type RenewalStage =
  | "MC Discussion"
  | "Member Discussion"
  | "Documents Pending"
  | "Payment Pending"
  | "Critical Deadline"
  | "Renewed"
  | "Dropped";

export type RenewalTaskType =
  | "mc_discussion"
  | "member_discussion"
  | "monthly_review"
  | "renewal_push"
  | "docs_collection"
  | "payment_due"
  | "critical_deadline";

export type DerivedRenewalDates = {
  mc_discussion_date: string;
  member_discussion_date: string;
  documents_sent_date: string;
  payment_due_date: string;
  final_deadline: string;
};

export type RenewalTask = {
  id: string;
  renewal_cycle_id: string;
  task_type: RenewalTaskType;
  due_date: string;
  status: "open" | "completed" | "cancelled";
  notes: string | null;
  completed_at: string | null;
};

export type Member = {
  id: string;
  auth_user_id: string | null;
  name: string;
  industry: string | null;
  sponsor: string | null;
  report_role: string | null;
  member_since: string | null;
  is_committee: boolean;
};

export type MemberAlias = {
  id: string;
  member_id: string;
  alias_name: string;
  normalized_alias_name: string;
  source: "manual" | "rename" | "import_review";
  created_at: string;
  updated_at: string;
};

export type RenewalCycle = {
  id: string;
  member_id: string;
  renewal_year: number;
  renewal_date: string;
  reported_due_date: string | null;
  status: "active" | "renewed" | "dropped";
  source_membership_status: string | null;
  auto_renewal_enabled: boolean;
  is_two_year_renewal: boolean;
};

export type ImportMemberRow = {
  name: string;
  industry: string;
  reportRole: string;
  membershipStatus: string;
  dueDate: string;
  autoRenewalEnabled: boolean;
};

export type TrafficLightColor = "green" | "yellow" | "red" | "grey";

export type MemberTrafficLight = {
  id: string;
  member_id: string;
  report_month: string;
  report_window_start: string | null;
  report_window_end: string | null;
  score: number;
  color: TrafficLightColor;
  present_count: number;
  absent_count: number;
  late_count: number;
  medical_count: number;
  substitute_count: number;
  referrals_given: number;
  referrals_received: number;
  visitors: number;
  testimonials: number;
  tyfcb: number | null;
  trainings: number;
  week_count: number;
  import_batch_id: string | null;
};

export type ChapterRole = {
  id: string;
  name: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
};

export type MemberPastRole = {
  id: string;
  member_id: string;
  role_id: string;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type MemberPastRoleEntry = MemberPastRole & {
  role: ChapterRole;
};

export type RenewalAssignment = {
  id: string;
  renewal_cycle_id: string;
  assignee_member_id: string;
  slot: 1 | 2;
  assignee?: Pick<Member, "id" | "name" | "industry">;
};

export type SponsorAchievementSummary = {
  lifetimeSponsors: MemberSponsorAchievement[];
  pastYearSponsors: MemberSponsorAchievement[];
  lifetimeCount: number;
  pastYearCount: number;
};

export type TrainingAchievementSummary = {
  lifetimeTrainings: MemberTrainingAchievement[];
  pastYearTrainings: MemberTrainingAchievement[];
  lifetimeCount: number;
  pastYearCount: number;
};

export type DashboardCycle = RenewalCycle & {
  member: Member;
  latest_traffic_light: MemberTrafficLight | null;
  traffic_light_history: MemberTrafficLight[];
  stage: RenewalStage | null;
  derived_dates: DerivedRenewalDates;
  assignments: RenewalAssignment[];
  renewal_tasks: RenewalTask[];
  open_task_count: number;
};

export type AchievementMemberListItem = {
  member: Member;
  currentCycle: DashboardCycle | null;
  latestPalmsSnapshot: MemberPalmsSnapshot | null;
};

export type MemberPalmsSnapshot = {
  id: string;
  member_id: string;
  chapter_name: string;
  report_from: string;
  report_to: string;
  run_at: string | null;
  present_count: number;
  absent_count: number;
  late_count: number;
  medical_count: number;
  substitute_count: number;
  referrals_given_inside: number;
  referrals_given_outside: number;
  referrals_received_inside: number;
  referrals_received_outside: number;
  visitors: number;
  one_to_ones: number;
  tyfcb: number | null;
  ceu: number;
  trainings: number;
  import_batch_id: string | null;
};

export type MemberSponsorAchievement = {
  id: string;
  member_id: string;
  sponsored_first_name: string;
  sponsored_last_name: string;
  sponsored_full_name: string;
  sponsored_region: string | null;
  sponsored_chapter: string | null;
  application_date: string;
  import_batch_id: string | null;
};

export type MemberTrainingAchievement = {
  id: string;
  member_id: string;
  chapter_name: string;
  region_name: string | null;
  event_date: string;
  event_type: string;
  role: string | null;
  join_date: string | null;
  induction_date: string | null;
  import_batch_id: string | null;
};
