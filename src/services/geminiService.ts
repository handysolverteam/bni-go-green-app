import { Member, Organization } from '../types';

/**
 * Shared Chapter AI types.
 *
 * The browser-side Gemini call that used to live here was removed on 2026-10-10. It had two
 * problems: the API key was read from VITE_GEMINI_API_KEY and therefore shipped inside the
 * public website bundle, and it pasted the entire chapter dataset into the prompt for every
 * caller, relying on an instruction in that prompt to stop the model revealing restricted
 * fields. A prompt is not an access control.
 *
 * Chapter AI now runs in the chapter-ai Edge Function, which keeps the key server-side and
 * filters the dataset to the caller's tier *before* building the prompt. See
 * supabase/functions/chapter-ai/index.ts and supabaseService.askChapterAI().
 */

export interface OrgSnapshot {
  organization: Organization | null;
  members: Member[];
  importLogs: any[];
  templates: any[];
}

/** Role-based permission flags passed into the local answering engine. */
export interface ChatPermissions {
  /** True for President/Vice President. False for Go Green committee members. */
  canSeeContactDetails: boolean;
  /** Human-readable role label used in generated copy. */
  roleLabel: string;
}
