import { createClient } from '@supabase/supabase-js';
import { Member, Organization, OrgMember, UserProfileExtended, OutreachTemplate } from '../types';
import { scoreMember } from '../lib/scoringEngine';
import { UNIVERSAL_DEFAULT_TEMPLATE_TEXT } from '../lib/outreachUtils';
import { formatPhoneWithCountryCode } from '../lib/whatsappUtils';

// No hardcoded fallbacks: a baked-in key survives rotation, and the truncated placeholder that
// used to live here would connect with an invalid credential and fail in confusing ways.
// Misconfiguration must fail loudly instead.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface OutreachLogRecord {
  user_id: string;
  org_id?: string;
  member_name: string;
  phone: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  message: string;
  sent_at?: string;
}

export const supabaseService = {
  // --- 6-DIGIT ORG CODE GENERATION & VERIFICATION ---
  async generateUnique6DigitCode(): Promise<string> {
    for (let attempts = 0; attempts < 10; attempts++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (!data) return code;
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  async queryChapterAI(orgId: string, queryText: string): Promise<{ response_text: string; stats?: any } | null> {
    try {
      const { data, error } = await supabase.rpc('query_chapter_ai', {
        p_org_id: orgId,
        p_query: queryText,
      });

      if (error) {
        console.warn('query_chapter_ai RPC error:', error.message);
        return null;
      }
      return data;
    } catch (e) {
      console.error('queryChapterAI exception:', e);
      return null;
    }
  },

  // High-Speed Memory Cache for Org Snapshot
  _orgSnapshotCache: null as { orgId: string; data: any; timestamp: number } | null,

  // Real-time Read-Only Supabase Org Snapshot for Chapter AI (All tables & fields for orgId)
  async getCompleteOrgSnapshot(orgId: string, forceRefresh: boolean = false): Promise<{
    organization: any;
    members: any[];
    importLogs: any[];
    templates: any[];
  }> {
    try {
      if (!forceRefresh && this._orgSnapshotCache && this._orgSnapshotCache.orgId === orgId && (Date.now() - this._orgSnapshotCache.timestamp < 15000)) {
        return this._orgSnapshotCache.data;
      }

      const [orgRes, membersRes, logsRes, templatesRes] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
        supabase.from('members').select('id, name, phone, email, score, traffic_light, present, absent, substitute, medical, one_to_ones, ceu, referrals_given, tyfcb, batch_name, org_id').eq('org_id', orgId).order('name', { ascending: true }),
        supabase.from('import_logs').select('id, org_id, file_name, batch_name, total_records, green_count, amber_count, red_count, avg_score, created_at').eq('org_id', orgId).order('created_at', { ascending: false }),
        supabase.from('outreach_templates').select('id, org_id, name, status_target, message_template').eq('org_id', orgId),
      ]);

      const result = {
        organization: orgRes.data || null,
        members: membersRes.data || [],
        importLogs: logsRes.data || [],
        templates: templatesRes.data || [],
      };

      this._orgSnapshotCache = { orgId, data: result, timestamp: Date.now() };
      return result;
    } catch (err) {
      console.warn('Failed to fetch complete org snapshot:', err);
      return { organization: null, members: [], importLogs: [], templates: [] };
    }
  },

  async getAIChatHistory(orgId: string, sessionId?: string): Promise<any[]> {
    try {
      let query = supabase
        .from('ai_chat_history')
        .select('*')
        .eq('org_id', orgId);

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },

  subscribeToAIChatHistory(orgId: string, onUpdate: () => void) {
    const channelName = `ai_chat_realtime_${orgId}_${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_chat_history',
          filter: `org_id=eq.${orgId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return {
      unsubscribe: () => {
        try {
          supabase.removeChannel(channel);
        } catch (_) {}
      }
    };
  },

  async getAIChatSessions(orgId: string): Promise<Array<{ session_id: string; last_text: string; created_at: string; msg_count: number }>> {
    try {
      const { data, error } = await supabase
        .from('ai_chat_history')
        .select('session_id, text, created_at, sender')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error || !data) return [];

      const sessionsMap = new Map<string, { session_id: string; last_text: string; created_at: string; msg_count: number; has_user_msg: boolean }>();

      data.forEach((row: any) => {
        const sId = row.session_id || 'default';
        const isUser = row.sender === 'user';

        if (!sessionsMap.has(sId)) {
          sessionsMap.set(sId, {
            session_id: sId,
            last_text: row.text,
            created_at: row.created_at,
            msg_count: 1,
            has_user_msg: isUser,
          });
        } else {
          const s = sessionsMap.get(sId)!;
          s.msg_count += 1;
          if (isUser) s.has_user_msg = true;
        }
      });

      // Filter out empty sessions where the user never sent any message or selected any option
      return Array.from(sessionsMap.values())
        .filter(s => s.has_user_msg)
        .map(({ has_user_msg, ...rest }) => rest);
    } catch {
      return [];
    }
  },

  async saveAIChatMessage(orgId: string, sender: 'user' | 'ai', text: string, options: any[] = [], sessionId: string = 'default'): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('ai_chat_history')
        .insert([{
          org_id: orgId,
          sender,
          text,
          options: JSON.stringify(options),
          session_id: sessionId,
        }]);
      return !error;
    } catch {
      return false;
    }
  },

  async clearAIChatHistory(orgId: string, sessionId?: string): Promise<boolean> {
    try {
      let query = supabase
        .from('ai_chat_history')
        .delete()
        .eq('org_id', orgId);

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { error } = await query;
      return !error;
    } catch {
      return false;
    }
  },

  async createOrganization(name: string, chapterName: string, city: string, userId: string, userEmail?: string): Promise<{ org: Organization; member: OrgMember } | null> {
    try {
      const code = await this.generateUnique6DigitCode();

      // 1. Try server-side atomic RPC function
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_bni_organization', {
        p_name: name,
        p_chapter_name: chapterName,
        p_city: city,
        p_user_id: userId,
        p_user_email: userEmail || '',
        p_code: code
      });

      if (!rpcError && rpcData && rpcData.org && rpcData.member) {
        return { org: rpcData.org, member: rpcData.member };
      }

      // 2. Direct table fallback
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([{
          name,
          chapter_name: chapterName,
          city,
          code,
          created_by: userId
        }])
        .select()
        .single();

      if (orgError || !orgData) throw orgError;

      const { data: memberData, error: memberError } = await supabase
        .from('org_members')
        .insert([{
          org_id: orgData.id,
          user_id: userId,
          user_email: userEmail || '',
          role: 'owner'
        }])
        .select()
        .single();

      if (memberError || !memberData) throw memberError;

      return { org: orgData, member: memberData };
    } catch (e) {
      console.error('Error creating org:', e);
      return null;
    }
  },

  async joinOrganization(code: string, userId: string, userEmail?: string): Promise<{ org: Organization; member: OrgMember } | { error: string } | null> {
    return this.joinOrganizationByCode(code, userId, userEmail);
  },

  async joinOrganizationByCode(code: string, userId: string, userEmail?: string): Promise<{ org: Organization; member: OrgMember } | { error: string } | null> {
    try {
      const cleanCode = code.trim();
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

      if (orgError || !orgData) {
        return { error: 'Invalid 6-digit organization code. Please check and try again.' };
      }

      const { data: existingMember } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgData.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember) {
        return { org: orgData, member: existingMember };
      }

      const { data: newMember, error: memberError } = await supabase
        .from('org_members')
        .insert([{
          org_id: orgData.id,
          user_id: userId,
          user_email: userEmail || '',
          role: 'member'
        }])
        .select()
        .single();

      if (memberError || !newMember) throw memberError;

      return { org: orgData, member: newMember };
    } catch (e: any) {
      console.error('Error joining org by code:', e);
      return { error: e.message || 'Failed to join organization.' };
    }
  },

  async fetchUserOrganization(userId: string, userEmail?: string | null): Promise<{ org: Organization; member: OrgMember } | null> {
    try {
      let { data: memberData } = await supabase
        .from('org_members')
        .select('*, organization:organizations(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fallback: search by email if Firebase UID changed
      if ((!memberData || !memberData.organization) && userEmail) {
        const { data: emailMatch } = await supabase
          .from('org_members')
          .select('*, organization:organizations(*)')
          .eq('user_email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (emailMatch && emailMatch.organization) {
          memberData = emailMatch;
          // Auto-heal / update user_id to new UID
          await supabase
            .from('org_members')
            .update({ user_id: userId })
            .eq('id', emailMatch.id);
        }
      }

      if (!memberData || !memberData.organization) {
        return null;
      }

      return {
        org: memberData.organization,
        member: {
          id: memberData.id,
          org_id: memberData.org_id,
          user_id: userId,
          user_email: memberData.user_email || userEmail || '',
          role: memberData.role,
          created_at: memberData.created_at
        }
      };
    } catch (e) {
      console.error('Error fetching user org:', e);
      return null;
    }
  },

  async fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];
      return data;
    } catch (e) {
      console.error('Error fetching org members:', e);
      return [];
    }
  },

  /**
   * Checks whether a user is allowed to leave an organization.
   * A sole owner may not abandon a chapter that still has other people in it —
   * doing so would leave nobody able to manage settings or roles.
   */
  async checkLeaveEligibility(orgId: string, userId: string, userEmail?: string | null): Promise<{
    canLeave: boolean;
    reason?: string;
    memberCount: number;
    ownerCount: number;
    isSoleOwner: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('user_id, user_email, role')
        .eq('org_id', orgId);

      if (error || !data) {
        return { canLeave: false, reason: 'Could not verify chapter membership. Check your connection.', memberCount: 0, ownerCount: 0, isSoleOwner: false };
      }

      const isSelf = (row: any) =>
        row.user_id === userId || (Boolean(userEmail) && row.user_email === userEmail);

      const owners = data.filter(r => r.role === 'owner');
      const others = data.filter(r => !isSelf(r));
      const iAmOwner = data.some(r => isSelf(r) && r.role === 'owner');
      const isSoleOwner = iAmOwner && owners.length === 1;

      // Last person standing — nobody else is affected, so let them go.
      if (others.length === 0) {
        return { canLeave: true, memberCount: data.length, ownerCount: owners.length, isSoleOwner };
      }

      if (isSoleOwner) {
        return {
          canLeave: false,
          reason: 'You are the only Owner of this chapter. Promote another member to Owner in the Chapter tab before you leave, otherwise nobody will be able to manage it.',
          memberCount: data.length,
          ownerCount: owners.length,
          isSoleOwner: true,
        };
      }

      return { canLeave: true, memberCount: data.length, ownerCount: owners.length, isSoleOwner: false };
    } catch (e) {
      console.error('checkLeaveEligibility exception:', e);
      return { canLeave: false, reason: 'Could not verify chapter membership.', memberCount: 0, ownerCount: 0, isSoleOwner: false };
    }
  },

  /**
   * Removes the current user's membership from one organization.
   * Deletes by user_id AND user_email, because fetchUserOrganization() falls back to an
   * email lookup — leaving an email-matched row behind would silently re-join them on reload.
   * Chapter PALMS data is left untouched; only the personal link is removed.
   */
  async leaveOrganization(orgId: string, userId: string, userEmail?: string | null): Promise<{ ok: boolean; error?: string }> {
    try {
      const eligibility = await this.checkLeaveEligibility(orgId, userId, userEmail);
      if (!eligibility.canLeave) {
        return { ok: false, error: eligibility.reason || 'You cannot leave this chapter right now.' };
      }

      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('org_id', orgId)
        .eq('user_id', userId);

      if (error) return { ok: false, error: error.message };

      // Clear any stale email-matched row that would trigger the auto-heal re-join
      if (userEmail) {
        await supabase
          .from('org_members')
          .delete()
          .eq('org_id', orgId)
          .eq('user_email', userEmail);
      }

      // Unlink (but keep) any roster row that pointed at this user
      await supabase
        .from('members')
        .update({ user_id: null })
        .eq('org_id', orgId)
        .eq('user_id', userId);

      return { ok: true };
    } catch (e: any) {
      console.error('leaveOrganization exception:', e);
      return { ok: false, error: e.message || 'Failed to leave organization.' };
    }
  },

  /**
   * Deletes the user's personal data across every chapter they belong to.
   * Chapter-owned data (roster members, imported reports, org AI chat history) is preserved —
   * it belongs to the chapter, not to this account.
   * Blocks if the user is the sole Owner of any chapter that still has other members.
   */
  async deleteUserAccount(userId: string, userEmail?: string | null): Promise<{ ok: boolean; error?: string; blockedOrgs?: string[] }> {
    try {
      const { data: memberships } = await supabase
        .from('org_members')
        .select('org_id, organization:organizations(name)')
        .or(userEmail ? `user_id.eq.${userId},user_email.eq.${userEmail}` : `user_id.eq.${userId}`);

      const orgIds = Array.from(new Set((memberships || []).map((m: any) => m.org_id).filter(Boolean)));

      // Verify every chapter can be safely left before deleting anything
      const blockedOrgs: string[] = [];
      for (const orgId of orgIds) {
        const eligibility = await this.checkLeaveEligibility(orgId, userId, userEmail);
        if (!eligibility.canLeave) {
          const match: any = (memberships || []).find((m: any) => m.org_id === orgId);
          blockedOrgs.push(match?.organization?.name || 'your chapter');
        }
      }

      if (blockedOrgs.length > 0) {
        return {
          ok: false,
          blockedOrgs,
          error: `You are the only Owner of ${blockedOrgs.join(', ')}. Promote another member to Owner before deleting your account.`,
        };
      }

      // Unlink roster rows, keeping the chapter's PALMS data intact
      await supabase.from('members').update({ user_id: null }).eq('user_id', userId);

      // Personal outreach history
      await supabase.from('outreach_logs').delete().eq('user_id', userId);

      // Memberships (by id and by email, mirroring the auto-heal lookup)
      await supabase.from('org_members').delete().eq('user_id', userId);
      if (userEmail) {
        await supabase.from('org_members').delete().eq('user_email', userEmail);
      }

      // Finally the profile itself
      const { error: profileError } = await supabase.from('profiles').delete().eq('user_id', userId);
      if (profileError) return { ok: false, error: profileError.message };

      return { ok: true };
    } catch (e: any) {
      console.error('deleteUserAccount exception:', e);
      return { ok: false, error: e.message || 'Failed to delete account data.' };
    }
  },

  async updateOrgMemberRole(orgId: string, userId: string, newRole: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('org_members')
        .update({ role: newRole })
        .eq('org_id', orgId)
        .eq('user_id', userId);

      return !error;
    } catch (e) {
      console.error('Error updating member role:', e);
      return false;
    }
  },

  // --- USER PROFILE METHODS ---
  /**
   * Looks for an EXISTING profile that already claims this phone number, under a different
   * auth account. Used to catch the duplicate-account case: someone who signed up with
   * Google and later signs in by phone gets a fresh Firebase uid, and would otherwise be
   * dropped into onboarding as a stranger to their own chapter.
   *
   * Matches on the last 10 digits so stored formats ("+91 98765 43210", "919876543210")
   * all compare equal. Returns null if nothing matches, or if the lookup is not permitted
   * — under per-user RLS a brand new account can read nobody else's profile, so this
   * degrades to "no hint" rather than failing the sign-in.
   */
  async findProfileByPhone(phone: string, excludeUserId: string): Promise<{
    user_id: string;
    full_name: string;
    email?: string | null;
  } | null> {
    try {
      const last10 = (phone || '').replace(/\D/g, '').slice(-10);
      if (last10.length < 10) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, phone')
        .ilike('phone', `%${last10}%`)
        .limit(5);

      if (error || !data?.length) return null;

      const match = data.find((row: any) => row.user_id && row.user_id !== excludeUserId);
      if (!match) return null;

      // profiles has no email column, so the address (for "sign in with Google as ...")
      // comes from the membership row.
      const { data: membership } = await supabase
        .from('org_members')
        .select('user_email')
        .eq('user_id', match.user_id)
        .limit(1)
        .maybeSingle();

      return {
        user_id: match.user_id,
        full_name: match.full_name || 'your account',
        email: membership?.user_email || null,
      };
    } catch (e) {
      console.error('findProfileByPhone exception:', e);
      return null;
    }
  },

  async fetchUserProfile(userId: string, userEmail?: string | null): Promise<UserProfileExtended | null> {
    try {
      let { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      // Fallback 1: re-link a profile whose user_id predates the current identity provider.
      // profiles has no `id` column (user_id is the primary key), and `email` only exists
      // after the 002 migration — an older deployment silently failed both lookups here.
      if (!data && userEmail) {
        const { data: emailData } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', userEmail)
          .maybeSingle();

        if (emailData) {
          data = emailData;
          await supabase
            .from('profiles')
            .update({ user_id: userId, is_profile_completed: true })
            .eq('user_id', emailData.user_id);
        }
      }

      // Fallback 1b: org_members carries the email even on pre-migration databases,
      // so it can map an old auth UID onto the current one.
      if (!data && userEmail) {
        const { data: legacyMembership } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('user_email', userEmail)
          .neq('user_id', userId)
          .maybeSingle();

        if (legacyMembership?.user_id) {
          const { data: legacyProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', legacyMembership.user_id)
            .maybeSingle();

          if (legacyProfile) {
            await supabase
              .from('profiles')
              .update({ user_id: userId, is_profile_completed: true })
              .eq('user_id', legacyMembership.user_id);
            await supabase
              .from('org_members')
              .update({ user_id: userId })
              .eq('user_id', legacyMembership.user_id);
            data = { ...legacyProfile, user_id: userId };
          }
        }
      }

      // Check localStorage cache for existing phone number if DB phone is empty
      const cachedStr = localStorage.getItem('bni_cached_profile');
      let cachedPhone = '';
      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          if (cached && cached.phone) cachedPhone = cached.phone;
        } catch (_) {}
      }

      // Fallback 2: Check localStorage cache if DB data is missing
      if (!data && cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          if (cached && (cached.full_name || cached.phone || cached.is_profile_completed)) {
            await this.saveUserProfile({
              ...cached,
              user_id: userId,
              is_profile_completed: true,
            });
            return {
              user_id: userId,
              full_name: cached.full_name || 'Member',
              phone: cached.phone || cachedPhone || '',
              business_category: cached.business_category || '',
              bio: cached.bio || '',
              avatar_url: cached.avatar_url || '',
              is_profile_completed: true,
            };
          }
        } catch (e) {
          console.warn('Failed to parse cached profile:', e);
        }
      }

      if (!data) return null;

      const finalPhone = data.phone || cachedPhone || '';

      return {
        user_id: userId,
        full_name: data.full_name || '',
        phone: finalPhone,
        business_category: data.business_category || data.chapter_role || '',
        bio: data.bio || '',
        avatar_url: data.avatar_url || '',
        is_profile_completed: data.is_profile_completed ?? true,
        updated_at: data.updated_at,
      };
    } catch (e) {
      console.error('Error fetching user profile:', e);
      const cachedStr = localStorage.getItem('bni_cached_profile');
      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          if (cached) return { ...cached, is_profile_completed: true };
        } catch (_) {}
      }
      return null;
    }
  },

  async saveUserProfile(profile: Partial<UserProfileExtended> & { user_id: string }): Promise<boolean> {
    try {
      const p = profile as any;
      
      // Preserve existing phone number if new phone number is empty
      const cachedStr = localStorage.getItem('bni_cached_profile');
      let existingPhone = '';
      if (cachedStr) {
        try {
          const cached = JSON.parse(cachedStr);
          if (cached && cached.phone) existingPhone = cached.phone;
        } catch (_) {}
      }

      const safePhone = (profile.phone && profile.phone.trim().length > 0) ? profile.phone.trim() : existingPhone;

      // Save to localStorage immediately as fail-safe backup
      const profileToSave: UserProfileExtended = {
        user_id: profile.user_id,
        full_name: profile.full_name || '',
        phone: safePhone,
        business_category: p.business_category || p.category || '',
        bio: profile.bio || '',
        avatar_url: profile.avatar_url || '',
        is_profile_completed: true,
        updated_at: new Date().toISOString(),
      };
      localStorage.setItem('bni_cached_profile', JSON.stringify(profileToSave));

      const { error: rpcError } = await supabase.rpc('save_user_profile', {
        p_user_id: profile.user_id,
        p_full_name: profile.full_name || '',
        p_phone: safePhone,
        p_chapter_role: p.bni_chapter || '',
        p_business_category: p.category || p.business_category || '',
        p_avatar_url: profile.avatar_url || '',
        p_is_profile_completed: true,
      });

      if (rpcError) {
        console.warn('RPC profile save warning, executing fallback upsert:', rpcError);
        const { error } = await supabase
          .from('profiles')
          .upsert({
            user_id: profile.user_id,
            full_name: profile.full_name || '',
            phone: safePhone,
            chapter_role: p.bni_chapter || '',
            business_category: p.category || p.business_category || '',
            avatar_url: profile.avatar_url || '',
            is_profile_completed: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        return !error;
      }

      return true;
    } catch (e) {
      console.error('Error saving user profile:', e);
      return false;
    }
  },

  // --- MEMBERS CRUD (Scoped by Org) ---
  async fetchMembers(orgId: string): Promise<Member[]> {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];

      // Count frequency of user_id values to detect uploader bulk-stamping
      const userIdCounts = new Map<string, number>();
      data.forEach((r: any) => {
        if (r.user_id) {
          userIdCounts.set(r.user_id, (userIdCounts.get(r.user_id) || 0) + 1);
        }
      });

      data.sort((a: any, b: any) => {
        const idxA = Number(a.raw_data?.excel_row_index);
        const idxB = Number(b.raw_data?.excel_row_index);
        if (!isNaN(idxA) && !isNaN(idxB) && idxA !== idxB) return idxA - idxB;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      return data.map((row: any) => {
        const raw = row.raw_data || {};
        const totalVal = Number(raw['Total Score'] ?? raw['total_score'] ?? raw['TotalScore'] ?? row.score) || (row.score > 0 ? row.score : undefined);
        
        // If a user_id appears on more than 2 members, it was bulk-stamped by uploader -> ignore it
        const isBulkStamped = row.user_id && (userIdCounts.get(row.user_id) || 0) > 2;
        const validUserId = isBulkStamped ? undefined : (row.user_id || undefined);

        const mem = scoreMember({
          id: row.id,
          org_id: row.org_id,
          user_id: validUserId,
          avatar_url: row.avatar_url || undefined,
          Name: row.name,
          Phone: row.phone || '',
          Email: row.email || '',
          P: row.present || 0,
          A: row.absent || 0,
          S: row.substitute || 0,
          M: row.medical || 0,
          RGT: row.referrals_given || 0,
          V: row.visitors || 0,
          TYFCB: Number(row.tyfcb) || 0,
          CEU: Number(row.ceu) || 0,
          OneToOnes: Number(row.one_to_ones) || 0,
          Sponsors: row.sponsors || 0,
          JoinDate: row.join_date || '',
          batch_name: row.batch_name || '',
          AttendanceRate: raw['Attendance Rate'] ?? raw['attendance_rate'] ?? row.attendance_rate,
          CEURate: raw['CEU Rate'] ?? raw['ceu_rate'] ?? row.ceu_rate,
          OneToOneRate: raw['121 Rate'] ?? raw['1-2-1 Rate'] ?? raw['one_to_one_rate'] ?? row.one_to_one_rate,
          ReferralsGivenRate: raw['Referrals Given Rate'] ?? raw['referrals_given_rate'] ?? row.referrals_given_rate,
          AttendanceScore: raw['Attendance Score'] ?? row.attendance_score,
          CEUScore: raw['CEU Score'] ?? row.ceu_score,
          OneToOneScore: raw['121 Score'] ?? raw['1-2-1 Score'] ?? row.one_to_one_score,
          ReferralsGivenScore: raw['Referrals Given Score'] ?? row.referrals_given_score,
          TYFCBScore: raw['TYFCB Score'] ?? row.tyfcb_score,
          VisitorScore: raw['Visitor Score'] ?? raw['Visitors Score'] ?? row.visitor_score,
          SponsorScore: raw['Sponsor Score'] ?? raw['Sponsors Score'] ?? row.sponsor_score,
          workbookTotalScore: totalVal,
          raw_data: raw,
        });
        (mem as any).created_at = row.created_at;
        (mem as any).import_log_id = row.import_log_id;
        return mem;
      });
    } catch (e) {
      return [];
    }
  },

  async saveSingleMember(member: Member, orgId: string, userId: string): Promise<Member | null> {
    try {
      const scored = scoreMember(member);

      const isValidUUID = (id?: string) => {
        if (!id) return false;
        return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
      };

      const row = {
        ...(scored.id && isValidUUID(scored.id) ? { id: scored.id } : {}),
        org_id: orgId,
        user_id: scored.user_id || null,
        name: scored.Name,
        chapter: scored.Chapter || 'Handychapter',
        phone: scored.Phone ? formatPhoneWithCountryCode(scored.Phone) : '',
        email: scored.Email || '',
        join_date: scored.JoinDate || (scored as any).join_date || '',
        present: scored.P || 0,
        absent: scored.A || 0,
        substitute: scored.S || 0,
        medical: scored.M || 0,
        referrals_given: scored.RGT || 0,
        visitors: scored.V || 0,
        tyfcb: scored.TYFCB || 0,
        ceu: scored.CEU || 0,
        one_to_ones: scored.OneToOnes || 0,
        sponsors: scored.Sponsors || 0,
        score: scored.score || 0,
        traffic_light: scored.trafficLight?.label || 'Grey',
        batch_name: scored.batch_name || 'Master Roster',
        raw_data: scored.raw_data || {},
        updated_at: new Date().toISOString(),
      };

      const { data: upsertData, error } = await supabase.from('members').upsert(row).select().single();
      if (error) {
        console.error('Error saving member to Supabase:', error);
      }
      if (upsertData) {
        // Bi-directional propagation: update all other records of this member in org with latest phone & details
        if (scored.Name) {
          const detailUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
          if (scored.Phone) detailUpdates.phone = formatPhoneWithCountryCode(scored.Phone);
          if (scored.JoinDate) detailUpdates.join_date = scored.JoinDate.trim();
          if (scored.user_id) detailUpdates.user_id = scored.user_id;

          if (Object.keys(detailUpdates).length > 1) {
            await supabase
              .from('members')
              .update(detailUpdates)
              .eq('org_id', orgId)
              .eq('name', scored.Name);
          }
        }

        return scoreMember({
          ...scored,
          id: upsertData.id,
          batch_name: upsertData.batch_name || scored.batch_name || 'Master Roster',
        });
      }
      return scored;
    } catch (e) {
      console.error('saveSingleMember exception:', e);
      return scoreMember(member);
    }
  },

  async deleteMember(memberId: string, orgId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', memberId)
        .eq('org_id', orgId);

      return !error;
    } catch (e) {
      return false;
    }
  },

  async upsertMembers(
    members: Member[],
    orgId: string,
    userId: string,
    fileName?: string,
    batchName?: string,
    fileData?: string
  ): Promise<boolean> {
    try {
      const finalBatchName = batchName || fileName || `Report Batch - ${new Date().toLocaleDateString()}`;

      const safeNum = (val: any): number => {
        if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
        if (!val) return 0;
        const cleaned = String(val).replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
      };

      const now = new Date().toISOString();
      const rows = members.map(m => ({
        org_id: orgId,
        user_id: m.user_id || null,
        name: m.Name ? String(m.Name).trim() : 'Unnamed Member',
        chapter: m.Chapter ? String(m.Chapter).trim() : 'Influencers',
        phone: m.Phone ? String(m.Phone).trim() : '',
        email: m.Email ? String(m.Email).trim() : '',
        join_date: m.JoinDate || (m as any).join_date || '',
        present: safeNum(m.P),
        absent: safeNum(m.A),
        substitute: safeNum(m.S),
        medical: safeNum(m.M),
        referrals_given: safeNum(m.RGT),
        visitors: safeNum(m.V),
        tyfcb: safeNum(m.TYFCB),
        ceu: safeNum(m.CEU),
        one_to_ones: safeNum(m.OneToOnes),
        sponsors: safeNum(m.Sponsors),
        score: safeNum(m.score),
        traffic_light: m.trafficLight?.label ? String(m.trafficLight.label).trim() : 'Grey',
        batch_name: finalBatchName,
        raw_data: typeof m.raw_data === 'object' && m.raw_data !== null ? m.raw_data : {},
        created_at: now,
        updated_at: now,
      }));

      // Ensure every single member row from the Excel file is preserved 100% without dropping duplicates
      const nameCounts = new Map<string, number>();
      const uniqueRows = rows.map(r => {
        const normName = r.name ? r.name.trim() : 'Unnamed Member';
        const count = (nameCounts.get(normName.toLowerCase()) || 0) + 1;
        nameCounts.set(normName.toLowerCase(), count);

        return {
          ...r,
          name: count > 1 ? `${normName} #${count}` : normName,
        };
      });

      // Calculate batch metrics
      let greenCount = 0;
      let amberCount = 0;
      let redCount = 0;
      let greyCount = 0;
      let totalScoreSum = 0;

      members.forEach(m => {
        const label = m.trafficLight?.label || 'Grey';
        if (label === 'Green') greenCount++;
        else if (label === 'Amber') amberCount++;
        else if (label === 'Red') redCount++;
        else greyCount++;
        totalScoreSum += safeNum(m.score);
      });

      const avgScore = members.length > 0 ? Math.round(totalScoreSum / members.length) : 0;

      // 1. Execute Supabase Database Function (RPC) server-side for atomic execution
      const { error: rpcErr } = await supabase.rpc('import_bni_report', {
        p_org_id: orgId,
        p_user_id: userId || '',
        p_batch_name: finalBatchName,
        p_file_name: fileName || 'BNI_Traffic_Lights_Report.xlsx',
        p_file_data: fileData || '',
        p_members: rows,
      });

      if (rpcErr) {
        console.warn('RPC import warning, running fallback batch insert:', rpcErr);

        // Fallback: Clear previous records for this org & batch to prevent constraint conflicts
        await supabase
          .from('members')
          .delete()
          .eq('org_id', orgId)
          .eq('batch_name', finalBatchName);

        // Direct insert of all member rows into public.members table
        const chunkSize = 50;
        for (let i = 0; i < uniqueRows.length; i += chunkSize) {
          const chunk = uniqueRows.slice(i, i + chunkSize);
          const { error: membersErr } = await supabase
            .from('members')
            .insert(chunk);

          if (membersErr) {
            console.warn('Chunk insert warning, executing row-by-row fallback:', membersErr);
            for (const row of chunk) {
              try {
                await supabase.from('members').insert(row);
              } catch (e) {
                console.error('Single row insert error:', row.name, e);
              }
            }
          }
        }

        // Save import log entry fallback
        await this.saveImportLog({
          org_id: orgId,
          user_id: userId,
          file_name: fileName || 'BNI_Traffic_Lights_Report.xlsx',
          batch_name: finalBatchName,
          total_records: members.length,
          green_count: greenCount,
          amber_count: amberCount,
          red_count: redCount,
          grey_count: greyCount,
          avg_score: avgScore,
          file_data: fileData || '',
        });
      }

      // Bi-directional (Vice-Versa) Sync:
      // Merge all available phone numbers and join_dates across all DB records & new report rows
      try {
        const { data: allOrgMembers } = await supabase
          .from('members')
          .select('name, phone, join_date, user_id')
          .eq('org_id', orgId);

        if (allOrgMembers && allOrgMembers.length > 0) {
          const phoneLookup: Record<string, string> = {};
          const joinDateLookup: Record<string, string> = {};
          const userIdLookup: Record<string, string> = {};

          allOrgMembers.forEach(m => {
            const nameKey = (m.name || '').trim().toLowerCase();
            if (nameKey) {
              if (m.phone && m.phone.trim()) phoneLookup[nameKey] = m.phone.trim();
              if (m.join_date && m.join_date.trim()) joinDateLookup[nameKey] = m.join_date.trim();
              if (m.user_id && m.user_id.trim()) userIdLookup[nameKey] = m.user_id.trim();
            }
          });

          for (const nameKey of Object.keys({ ...phoneLookup, ...joinDateLookup, ...userIdLookup })) {
            const phone = phoneLookup[nameKey];
            const joinDate = joinDateLookup[nameKey];
            const uid = userIdLookup[nameKey];

            const updates: Record<string, any> = { updated_at: new Date().toISOString() };
            if (phone) updates.phone = phone;
            if (joinDate) updates.join_date = joinDate;
            if (uid) updates.user_id = uid;

            if (Object.keys(updates).length > 1) {
              // Update all member records for this name in the org (both Roster & all Reports)
              const { data: matchingNames } = await supabase
                .from('members')
                .select('name')
                .eq('org_id', orgId);

              const exactNameMatch = (matchingNames || []).find(m => (m.name || '').trim().toLowerCase() === nameKey);
              if (exactNameMatch?.name) {
                await supabase
                  .from('members')
                  .update(updates)
                  .eq('org_id', orgId)
                  .eq('name', exactNameMatch.name);
              }
            }
          }
        }
      } catch (mapErr) {
        console.warn('Bi-directional auto-sync warning:', mapErr);
      }

      return true;
    } catch (e) {
      console.error('upsertMembers error:', e);
      return false;
    }
  },

  async purgeAllMembers(orgId: string): Promise<boolean> {
    try {
      // 1. Fetch all members in org to preserve unique member entries in Master Roster before deleting report batches
      const { data: allMembers } = await supabase
        .from('members')
        .select('*')
        .eq('org_id', orgId);

      if (allMembers && allMembers.length > 0) {
        const rosterNames = new Set(
          allMembers.filter(m => m.batch_name === 'Master Roster').map(m => (m.name || '').trim().toLowerCase())
        );

        const masterRowsToInsert: any[] = [];
        const seenNames = new Set<string>();

        for (const bm of allMembers) {
          const normName = (bm.name || '').trim().toLowerCase();
          if (normName && !rosterNames.has(normName) && !seenNames.has(normName)) {
            seenNames.add(normName);
            masterRowsToInsert.push({
              org_id: orgId,
              user_id: bm.user_id || null,
              name: bm.name,
              chapter: bm.chapter || 'Handychapter',
              phone: bm.phone || '',
              email: bm.email || '',
              join_date: bm.join_date || '',
              present: 0,
              absent: 0,
              substitute: 0,
              medical: 0,
              referrals_given: 0,
              visitors: 0,
              tyfcb: 0,
              ceu: 0,
              one_to_ones: 0,
              sponsors: 0,
              score: 0,
              traffic_light: 'Grey',
              batch_name: 'Master Roster',
              raw_data: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }

        if (masterRowsToInsert.length > 0) {
          await supabase.from('members').insert(masterRowsToInsert);
        }
      }

      // 2. Delete ONLY report batch rows (neq batch_name 'Master Roster') and all import_logs
      await supabase.from('members').delete().eq('org_id', orgId).neq('batch_name', 'Master Roster');
      await supabase.from('import_logs').delete().eq('org_id', orgId);
      return true;
    } catch (e) {
      console.error('purgeAllMembers exception:', e);
      return false;
    }
  },

  // --- REALTIME SUBSCRIPTION ---
  subscribeToMembers(orgId: string, onUpdate: () => void) {
    const topic = `members_rt_${orgId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `org_id=eq.${orgId}` },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // --- SETTINGS CRUD ---
  async fetchOrgSettings(orgId: string, userId: string) {
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (orgData) {
        const orgSettings = orgData.settings || {};
        return {
          scoringConfig: orgData.custom_scoring || null,
          signature: orgData.custom_signature || 'Keep the momentum going! 💪',
          enableSignature: orgSettings.enable_signature !== undefined ? Boolean(orgSettings.enable_signature) : true,
          scoreTerm: orgSettings.score_term || 'Go Green',
          defaultCountryCode: orgSettings.default_country_code || '+91',
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async saveOrgSettings(orgId: string, userId: string, settingsPayload: any, fullScoringConfig: any): Promise<boolean> {
    try {
      const { data: currentOrg } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', orgId)
        .maybeSingle();

      const existingSettings = currentOrg?.settings || {};
      const updatedSettings = {
        ...existingSettings,
        enable_signature: settingsPayload.enableSignature !== undefined ? settingsPayload.enableSignature : true,
        score_term: settingsPayload.scoreTerm || 'Go Green',
        defaultCountryCode: settingsPayload.defaultCountryCode || '+91',
      };

      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          green_threshold: settingsPayload.green,
          amber_threshold: settingsPayload.amber,
          red_threshold: settingsPayload.red,
          custom_signature: settingsPayload.signature,
          settings: updatedSettings,
          custom_scoring: fullScoringConfig,
        })
        .eq('id', orgId);

      return !orgError;
    } catch (e) {
      return false;
    }
  },

  // --- ORG-BASED OUTREACH & IMPORT TRACKING LOGS ---
  async saveOutreachLog(log: OutreachLogRecord): Promise<boolean> {
    try {
      const { error } = await supabase.from('outreach_logs').insert([{
        user_id: log.user_id,
        org_id: log.org_id || null,
        member_name: log.member_name,
        phone: log.phone || '',
        status: log.status,
        message: log.message,
        sent_at: log.sent_at || new Date().toISOString(),
      }]);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async fetchOutreachLogs(orgId?: string): Promise<OutreachLogRecord[]> {
    try {
      let query = supabase.from('outreach_logs').select('*');
      if (orgId) {
        query = query.eq('org_id', orgId);
      }
      const { data, error } = await query.order('sent_at', { ascending: false });
      if (error || !data) return [];
      return data.map((r: any) => ({
        user_id: r.user_id,
        org_id: r.org_id,
        member_name: r.member_name,
        phone: r.phone || '',
        status: r.status,
        message: r.message || '',
        sent_at: r.sent_at,
      }));
    } catch (e) {
      return [];
    }
  },

  async saveImportLog(log: any): Promise<boolean> {
    try {
      const fName = log.file_name || log.filename || 'Excel Import Report';
      const { error } = await supabase.from('import_logs').insert([{
        org_id: log.org_id,
        user_id: log.user_id,
        filename: fName,
        file_name: fName,
        batch_name: log.batch_name || fName || 'Report Batch',
        total_records: log.total_records || log.member_count || 0,
        green_count: log.green_count || 0,
        amber_count: log.amber_count || 0,
        red_count: log.red_count || 0,
        grey_count: log.grey_count || 0,
        avg_score: log.avg_score || 0,
        file_data: log.file_data || '',
        created_at: new Date().toISOString(),
      }]);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async fetchImportLogs(orgId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('import_logs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];
      return data.map((row: any) => ({
        id: row.id,
        org_id: row.org_id,
        user_id: row.user_id,
        file_name: row.file_name || row.filename || 'Imported Report',
        batch_name: row.batch_name || row.file_name || row.filename || 'Report Batch',
        total_records: Number(row.total_records || 0),
        green_count: Number(row.green_count || 0),
        amber_count: Number(row.amber_count || 0),
        red_count: Number(row.red_count || 0),
        grey_count: Number(row.grey_count || 0),
        avg_score: Number(row.avg_score || 0),
        file_data: row.file_data || '',
        created_at: row.created_at || row.imported_at,
      }));
    } catch (e) {
      return [];
    }
  },

  async deleteImportBatch(orgId: string, batchName: string, logId?: string): Promise<boolean> {
    try {
      if (!batchName || batchName === 'Master Roster') {
        return false; // Cannot delete Master Roster
      }

      // 1. Fetch all members in this batch to preserve them in Master Roster if they don't exist elsewhere
      const { data: batchMembers } = await supabase
        .from('members')
        .select('*')
        .eq('org_id', orgId)
        .eq('batch_name', batchName);

      if (batchMembers && batchMembers.length > 0) {
        const { data: otherMembers } = await supabase
          .from('members')
          .select('name')
          .eq('org_id', orgId)
          .neq('batch_name', batchName);

        const otherNames = new Set((otherMembers || []).map(m => (m.name || '').trim().toLowerCase()));

        // For members only in this batch, insert a baseline Master Roster entry so they are not lost
        const masterRowsToInsert: any[] = [];
        const seenNames = new Set<string>();

        for (const bm of batchMembers) {
          const normName = (bm.name || '').trim().toLowerCase();
          if (normName && !otherNames.has(normName) && !seenNames.has(normName)) {
            seenNames.add(normName);
            masterRowsToInsert.push({
              org_id: orgId,
              user_id: bm.user_id || null,
              name: bm.name,
              chapter: bm.chapter || 'Handychapter',
              phone: bm.phone || '',
              email: bm.email || '',
              join_date: bm.join_date || '',
              present: 0,
              absent: 0,
              substitute: 0,
              medical: 0,
              referrals_given: 0,
              visitors: 0,
              tyfcb: 0,
              ceu: 0,
              one_to_ones: 0,
              sponsors: 0,
              score: 0,
              traffic_light: 'Grey',
              batch_name: 'Master Roster',
              raw_data: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }

        if (masterRowsToInsert.length > 0) {
          await supabase.from('members').insert(masterRowsToInsert);
        }
      }

      // 2. Delete the report batch records & log
      const { error } = await supabase.rpc('delete_bni_report_batch', {
        p_org_id: orgId,
        p_batch_name: batchName,
        p_log_id: logId || '',
      });

      if (error) {
        await supabase.from('members').delete().eq('org_id', orgId).eq('batch_name', batchName);
        if (logId) {
          await supabase.from('import_logs').delete().eq('id', logId);
        } else {
          await supabase.from('import_logs').delete().eq('org_id', orgId).eq('batch_name', batchName);
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  },

  // --- OUTREACH TEMPLATES CRUD (STRICT ORG ISOLATION) ---
  async fetchOutreachTemplates(orgId?: string): Promise<OutreachTemplate[]> {
    try {
      if (!orgId) {
        return DEFAULT_OUTREACH_TEMPLATES;
      }

      // Fetch org-specific templates
      const { data: orgTemplates } = await supabase
        .from('outreach_templates')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      const dbList = (orgTemplates && orgTemplates.length > 0) ? orgTemplates : [];

      // If org has no templates saved in DB yet, auto-seed defaults for this org
      if (dbList.length === 0) {
        const seedRows = DEFAULT_OUTREACH_TEMPLATES.map(t => ({
          org_id: orgId,
          name: t.name,
          status_target: t.status_target,
          message_template: t.message_template,
          is_default: true,
          updated_at: new Date().toISOString(),
        }));

        const { data: seeded } = await supabase
          .from('outreach_templates')
          .insert(seedRows)
          .select();

        if (seeded && seeded.length > 0) {
          seeded.sort((a, b) => (a.name?.includes('Universal') ? -1 : b.name?.includes('Universal') ? 1 : 0));
          return seeded;
        }

        return DEFAULT_OUTREACH_TEMPLATES.map(t => ({ ...t, org_id: orgId }));
      }

      // Merge defaults with org's DB list if any default template missing
      const mergedMap = new Map<string, OutreachTemplate>();
      DEFAULT_OUTREACH_TEMPLATES.forEach(t => mergedMap.set(t.name.trim().toLowerCase(), { ...t, org_id: orgId }));
      dbList.forEach(t => {
        const key = (t.name || '').trim().toLowerCase();
        mergedMap.set(key, t);
      });

      const list = Array.from(mergedMap.values());

      // Secondary deduplication by content signature (name + message body)
      const seenContent = new Set<string>();
      const result: OutreachTemplate[] = [];

      for (const t of list) {
        const normName = (t.name || '').trim().toLowerCase();
        const normMsg = (t.message_template || '').replace(/\s+/g, ' ').trim();
        const contentSig = `${normName}::${normMsg}`;

        if (seenContent.has(contentSig)) {
          continue;
        }

        seenContent.add(contentSig);
        result.push(t);
      }

      result.sort((a, b) => (a.name?.includes('Universal') || a.id === 'default_universal' ? -1 : b.name?.includes('Universal') || b.id === 'default_universal' ? 1 : 0));
      return result;
    } catch (e) {
      return DEFAULT_OUTREACH_TEMPLATES;
    }
  },

  async saveOutreachTemplate(template: Partial<OutreachTemplate>, orgId?: string): Promise<boolean> {
    try {
      const targetOrgId = template.org_id || orgId;
      const row: Record<string, any> = {
        ...(template.id && !template.id.startsWith('temp_') && !template.id.startsWith('default_') ? { id: template.id } : {}),
        org_id: targetOrgId || null,
        name: template.name || 'Custom Outreach Template',
        status_target: template.status_target || 'All',
        message_template: template.message_template || '',
        is_default: template.is_default ?? false,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('outreach_templates').upsert(row);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async deleteOutreachTemplate(templateId: string, orgId?: string): Promise<boolean> {
    try {
      let query = supabase.from('outreach_templates').delete().eq('id', templateId);
      if (orgId) {
        query = query.eq('org_id', orgId);
      }
      const { error } = await query;
      return !error;
    } catch (e) {
      return false;
    }
  },

  async updateMemberPhone(memberId: string, phone: string): Promise<boolean> {
    return this.updateMemberDetails(memberId, { phone });
  },

  async updateMemberDetails(memberId: string, detailsOrPhone: string | { phone?: string; joinDate?: string; userId?: string; avatarUrl?: string }, joinDateStr?: string): Promise<boolean> {
    try {
      let details: { phone?: string; joinDate?: string; userId?: string; avatarUrl?: string } = {};
      if (typeof detailsOrPhone === 'string') {
        details = { phone: detailsOrPhone, joinDate: joinDateStr || '' };
      } else {
        details = detailsOrPhone || {};
      }

      const payload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (details.phone !== undefined) payload.phone = details.phone.trim();
      if (details.joinDate !== undefined) payload.join_date = details.joinDate.trim();
      if (details.userId !== undefined) payload.user_id = details.userId ? details.userId : null;

      const { data: memberData } = await supabase
        .from('members')
        .select('name, org_id')
        .eq('id', memberId)
        .maybeSingle();

      let query = supabase.from('members').update(payload).eq('id', memberId);
      if (memberData?.org_id) {
        query = query.eq('org_id', memberData.org_id);
      }
      const { error } = await query;

      if (!error && memberData?.name) {
        let mapQuery = supabase
          .from('members')
          .update(payload)
          .eq('name', memberData.name);
        if (memberData.org_id) {
          mapQuery = mapQuery.eq('org_id', memberData.org_id);
        }
        await mapQuery;
      }

      return !error;
    } catch (e) {
      return false;
    }
  },

  async resetAllMemberUserLinks(orgId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('members')
        .update({ user_id: null, updated_at: new Date().toISOString() })
        .eq('org_id', orgId);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async batchUpdateMemberDetails(
    orgId: string,
    updates: Array<{ memberId: string; phone?: string; joinDate?: string }>
  ): Promise<number> {
    try {
      // 1. Execute atomic RPC on Supabase server-side (survives page refresh & executes in background)
      const { data, error } = await supabase.rpc('batch_update_member_details', {
        p_org_id: orgId,
        p_updates: updates,
      });

      if (!error && typeof data === 'number') {
        return data;
      }

      // 2. Client-side fallback if RPC is unavailable
      let count = 0;
      for (const item of updates) {
        if (!item.memberId) continue;
        const ok = await this.updateMemberDetails(item.memberId, {
          phone: item.phone,
          joinDate: item.joinDate,
        });
        if (ok) count++;
      }
      return count;
    } catch (e) {
      console.error('Error batch updating member details:', e);
      return 0;
    }
  },

  async updateMemberOutreachStatus(memberId: string, status: string): Promise<boolean> {
    try {
      const { data: current } = await supabase
        .from('members')
        .select('raw_data')
        .eq('id', memberId)
        .maybeSingle();

      const updatedRaw = {
        ...(current?.raw_data || {}),
        outreach_status: status,
        outreach_sent_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('members')
        .update({
          raw_data: updatedRaw,
          updated_at: new Date().toISOString(),
        })
        .eq('id', memberId);
      return !error;
    } catch (e) {
      return false;
    }
  }
};

export const DEFAULT_OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'default_universal',
    name: '⚡ Universal PALMS Score & Action Snapshot',
    status_target: 'All',
    message_template: UNIVERSAL_DEFAULT_TEMPLATE_TEXT,
    is_default: true,
  },
  {
    id: 'default_green',
    name: '🟢 Green Tier - Leadership Celebration',
    status_target: 'Green',
    message_template: `Dear {{name}} 👋

Congratulations on achieving a score of *{{score}}/100* ({{traffic_light}} Tier) in BNI {{chapter}}! 🌟

Your outstanding commitment with *{{present}}* attendances and *{{referrals}}* referrals is driving our chapter forward. Keep leading by example! 💪`,
    is_default: true,
  },
  {
    id: 'default_amber',
    name: '🟡 Amber Tier - Green Level-Up Plan',
    status_target: 'Amber',
    message_template: `Hi {{name}} 👋

Your current PALMS score is *{{score}}/100* ({{traffic_light}} Tier) in BNI {{chapter}}.

You are just a few points away from Green! 🚀
Completing 1 CEU unit or booking 1 One-to-One this week will elevate your score to Green status.

Let us get you to Green together! 💪`,
    is_default: true,
  },
  {
    id: 'default_red',
    name: '🔴 Red Tier - Support & Focus Nudge',
    status_target: 'Red',
    message_template: `Hello {{name}} 👋

We noticed your current PALMS score is *{{score}}/100* ({{traffic_light}} Tier) in BNI {{chapter}}.

We value your membership and want to support your business growth. Let us schedule a quick 1-to-1 this week to discuss how we can boost your score together! 🤝`,
    is_default: true,
  },
  {
    id: 'default_grey',
    name: '⚪ Grey Tier - Urgent Chapter Engagement',
    status_target: 'Grey',
    message_template: `Dear {{name}} 👋

Your current PALMS score is *{{score}}/100* ({{traffic_light}} Tier). We miss your active participation in BNI {{chapter}}!

Please connect with your Vice President or Mentor this week so we can help reactivate your business networking momentum. 🙏`,
    is_default: true,
  },
  {
    id: 'default_all',
    name: '🚀 General BNI Performance Update',
    status_target: 'All',
    message_template: `Hi {{name}} 👋

Here is your latest BNI {{chapter}} performance report:

• PALMS Score: *{{score}}/100* ({{traffic_light}} Tier)
• Referrals Given: *{{referrals}}*
• TYFCB: *{{tyfcb}}*
• One-to-Ones: *{{one_to_ones}}*
• CEUs: *{{ceu}}*

Thank you for your continued contribution to our chapter! 🌟`,
    is_default: true,
  }
];
