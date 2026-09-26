// Client wrapper around the Phase 2 renewals Edge Functions (see
// docs/BNI_RRC_MIGRATION.md). Calls carry the caller's Firebase ID token (anon key when
// signed out) so the functions can resolve the caller's RBAC scope.

import { supabase } from '../lib/supabase';
import { firebaseAuth } from '../lib/firebase';
import type { AchievementMemberListItem, DashboardCycle, Member } from '../lib/renewals/types';
import type { TaskInboxItem } from '../lib/renewals/task-inbox-model';
import type { PalmsMonthlyCoverageEntry } from '../lib/renewals/palms-monthly-performance';
import type { MemberDetail, PalmsBatchImportResult } from './renewalsTypes';
import type { RenewalCycle, RenewalTask } from '../lib/renewals/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Edge Functions that only accept GET (Supabase's own client always POSTs via .invoke()). */
async function invokeGet<T>(functionName: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const idToken = (await firebaseAuth.currentUser?.getIdToken().catch(() => null)) ?? null;
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}${query}`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${idToken ?? supabaseAnonKey}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `${functionName} failed (${res.status}).`);
  }
  return body as T;
}

/** Edge Functions that accept POST (file uploads, mutations). */
async function invokePost<T>(functionName: string, body?: FormData | Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      const payload = await response.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || `${functionName} failed.`);
  }
  return data as T;
}

export type ImportResultLike = {
  batchId: string | null;
  importedCount: number;
  skippedCount: number;
  errors: string[];
};

export const renewalsService = {
  async getDashboardCycles(): Promise<DashboardCycle[]> {
    return invokeGet<DashboardCycle[]>('renewals-dashboard', { action: 'cycles' });
  },

  async getAchievementMembers(): Promise<AchievementMemberListItem[]> {
    return invokeGet<AchievementMemberListItem[]>('renewals-dashboard', { action: 'achievements' });
  },

  async getCommitteeMembers(): Promise<Member[]> {
    return invokeGet<Member[]>('renewals-dashboard', { action: 'committee' });
  },

  async getMemberDetail(memberId: string): Promise<MemberDetail> {
    return invokeGet<MemberDetail>('renewals-dashboard', { action: 'member-detail', memberId });
  },

  async getTaskInbox(): Promise<TaskInboxItem[]> {
    return invokeGet<TaskInboxItem[]>('renewals-task-inbox');
  },

  async getPalmsCoverage(): Promise<{ uploadedMonths: PalmsMonthlyCoverageEntry[]; missingMonths: string[] }> {
    return invokeGet('renewals-palms-coverage');
  },

  async generateRenewalTasks(): Promise<{ scannedCount: number; createdCount: number }> {
    return invokePost('generate-renewal-tasks');
  },

  async updateRenewalTaskStatus(taskId: string, status: RenewalTask['status']): Promise<{ ok: true }> {
    return invokePost('update-renewal-task', { id: taskId, status });
  },

  async updateRenewalCycleStatus(cycleId: string, status: RenewalCycle['status']): Promise<{ ok: true }> {
    return invokePost('update-renewal-cycle', { id: cycleId, status });
  },

  async importMembershipDues(file: File): Promise<ImportResultLike> {
    const formData = new FormData();
    formData.append('file', file);
    return invokePost('import-membership-dues', formData);
  },

  async importPalms(files: File[]): Promise<PalmsBatchImportResult> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return invokePost('import-palms', formData);
  },

  async importPalmsLifetime(files: File[]): Promise<PalmsBatchImportResult> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return invokePost('import-palms-lifetime', formData);
  },

  async importSponsors(file: File): Promise<ImportResultLike> {
    const formData = new FormData();
    formData.append('file', file);
    return invokePost('import-sponsors', formData);
  },

  async importTrainings(file: File): Promise<ImportResultLike> {
    const formData = new FormData();
    formData.append('file', file);
    return invokePost('import-trainings', formData);
  },

  async importTrafficLights(file: File, reportMonth?: string): Promise<ImportResultLike> {
    const formData = new FormData();
    formData.append('file', file);
    if (reportMonth) formData.append('reportMonth', reportMonth);
    return invokePost('import-traffic-lights', formData);
  },
};
