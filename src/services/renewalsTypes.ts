// Return shape of the renewals-dashboard Edge Function's `action=member-detail`,
// mirroring _shared/renewals/data.ts's getMemberDetail() (itself a faithful
// port of bni-rrc's lib/renewals/data.ts — see docs/BNI_RRC_MIGRATION.md).

import type {
  ChapterRole,
  DashboardCycle,
  Member,
  MemberAlias,
  MemberPalmsSnapshot,
  MemberPastRoleEntry,
  MemberSponsorAchievement,
  MemberTrainingAchievement,
  SponsorAchievementSummary,
  TrainingAchievementSummary,
} from '../lib/renewals/types';

export type PalmsBatchFileResult = {
  filename: string;
  batchId: string | null;
  status: 'imported' | 'duplicate_skipped' | 'failed';
  reportIdentity: string | null;
  chapterName: string | null;
  reportFrom: string | null;
  reportTo: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

export type PalmsBatchImportResult = {
  totalFiles: number;
  importedFiles: number;
  duplicateFiles: number;
  failedFiles: number;
  importedCount: number;
  skippedCount: number;
  errors: string[];
  files: PalmsBatchFileResult[];
};

export type MemberDetail = {
  member: Member;
  currentCycle: DashboardCycle | null;
  cycles: DashboardCycle[];
  latestPalmsSnapshot: MemberPalmsSnapshot | null;
  palmsSnapshots: MemberPalmsSnapshot[];
  sponsorAchievements: MemberSponsorAchievement[];
  sponsorSummary: SponsorAchievementSummary;
  trainingAchievements: MemberTrainingAchievement[];
  trainingSummary: TrainingAchievementSummary;
  performanceAnchorDate: string;
  availableRoles: ChapterRole[];
  pastRoles: MemberPastRoleEntry[];
  aliases: MemberAlias[];
};
