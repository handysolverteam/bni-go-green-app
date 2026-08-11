import { supabase } from '../lib/supabase';
import { Member, Organization, OrgMember, UserProfileExtended, UserRole, ScoringConfig } from '../types';
import { scoreMember, DEFAULTS } from '../lib/scoringEngine';

export interface OutreachLogRecord {
  id?: string;
  user_id?: string;
  org_id?: string;
  member_name: string;
  phone: string;
  status: 'sent' | 'pending' | 'failed' | 'skipped';
  message: string;
  sent_at: string;
}

export interface ImportLogRecord {
  id?: string;
  org_id: string;
  user_id: string;
  file_name?: string;
  member_count: number;
  imported_at?: string;
}

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const supabaseService = {
  // --- UNIQUE 6-DIGIT CODE GENERATION ---
  async generateUnique6DigitCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = generate6DigitCode();
      const { data } = await supabase
        .from('organizations')
        .select('id')
        .eq('code', candidate)
        .maybeSingle();

      if (!data) return candidate;
      attempts++;
    }
    return (Date.now() % 1000000).toString().padStart(6, '0');
  },

  // --- ORGANIZATION MANAGEMENT ---
  async createOrganization(
    name: string,
    chapterName: string,
    city: string,
    userId: string,
    userEmail?: string
  ): Promise<{ res: { org: Organization; member: OrgMember } | null; error?: string }> {
    try {
      const code = await this.generateUnique6DigitCode();
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([{
          name,
          chapter_name: chapterName,
          city,
          code,
          created_by: userId,
          green_threshold: DEFAULTS.trafficLight.green,
          amber_threshold: DEFAULTS.trafficLight.amber,
          red_threshold: DEFAULTS.trafficLight.red,
          custom_signature: 'Keep the momentum going! 💪',
          custom_scoring: DEFAULTS,
        }])
        .select()
        .single();

      if (orgError || !orgData) {
        console.error('Create org error:', orgError);
        return { res: null, error: orgError?.message || 'Database error creating organization.' };
      }

      // Add user as owner in org_members
      const { data: memData, error: memError } = await supabase
        .from('org_members')
        .insert([{
          org_id: orgData.id,
          user_id: userId,
          user_email: userEmail || '',
          role: 'owner',
        }])
        .select()
        .single();

      if (memError || !memData) {
        console.error('Create org member error:', memError);
        return { res: null, error: memError?.message || 'Error assigning org owner role.' };
      }

      // Seed chapter_settings table row by default
      try {
        await supabase.from('chapter_settings').upsert({
          user_id: userId,
          org_id: orgData.id,
          green_threshold: DEFAULTS.trafficLight.green,
          amber_threshold: DEFAULTS.trafficLight.amber,
          red_threshold: DEFAULTS.trafficLight.red,
          custom_signature: 'Keep the momentum going! 💪',
          scoring_config: DEFAULTS,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (e) {
        // Table optional fallback
      }

      return { res: { org: orgData as Organization, member: memData as OrgMember } };
    } catch (e: any) {
      console.error('Create org exception:', e);
      return { res: null, error: e.message || 'Network exception creating organization.' };
    }
  },

  async joinOrganization(
    code: string,
    userId: string,
    userEmail?: string
  ): Promise<{ res: { org: Organization; member: OrgMember } | null; error?: string }> {
    try {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('code', code.trim())
        .single();

      if (orgError || !orgData) {
        console.error('Join org: invalid code', orgError);
        return { res: null, error: 'Invalid 6-digit code. Organization not found.' };
      }

      const { data: memData, error: memError } = await supabase
        .from('org_members')
        .upsert([{
          org_id: orgData.id,
          user_id: userId,
          user_email: userEmail || '',
          role: 'member',
        }], { onConflict: 'org_id, user_id' })
        .select()
        .single();

      if (memError || !memData) {
        console.error('Join org member error:', memError);
        return { res: null, error: memError?.message || 'Error joining org member.' };
      }

      return { res: { org: orgData as Organization, member: memData as OrgMember } };
    } catch (e: any) {
      console.error('Join org exception:', e);
      return { res: null, error: e.message || 'Exception joining organization.' };
    }
  },

  async fetchUserOrganization(userId: string): Promise<{ org: Organization; member: OrgMember } | null> {
    try {
      const { data: memData, error: memError } = await supabase
        .from('org_members')
        .select('*, org:organizations(*)')
        .eq('user_id', userId)
        .single();

      if (memError || !memData || !memData.org) return null;

      return {
        org: memData.org as Organization,
        member: {
          id: memData.id,
          org_id: memData.org_id,
          user_id: memData.user_id,
          user_email: memData.user_email,
          role: memData.role as UserRole,
        },
      };
    } catch (e) {
      return null;
    }
  },

  async fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
    try {
      const { data, error } = await supabase
        .from('org_members')
        .select('*')
        .eq('org_id', orgId);

      if (error || !data) return [];
      return data as OrgMember[];
    } catch (e) {
      return [];
    }
  },

  async updateOrgMemberRole(orgId: string, targetUserId: string, newRole: UserRole): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('org_members')
        .update({ role: newRole })
        .eq('org_id', orgId)
        .eq('user_id', targetUserId);

      return !error;
    } catch (e) {
      return false;
    }
  },

  // --- USER PROFILES ---
  async fetchUserProfile(userId: string): Promise<UserProfileExtended | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) return null;
      return data as UserProfileExtended;
    } catch (e) {
      return null;
    }
  },

  async saveUserProfile(profile: UserProfileExtended): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: profile.user_id,
          full_name: profile.full_name,
          phone: profile.phone || '',
          avatar_url: profile.avatar_url || '',
          business_category: profile.business_category || '',
          bio: profile.bio || '',
          is_profile_completed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      return !error;
    } catch (e) {
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
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((row: any) => scoreMember({
        id: row.id,
        org_id: row.org_id,
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
        raw_data: row.raw_data || {},
      }));
    } catch (e) {
      return [];
    }
  },

  async saveSingleMember(member: Member, orgId: string, userId: string): Promise<Member | null> {
    try {
      const row = {
        ...(member.id ? { id: member.id } : {}),
        org_id: orgId,
        user_id: userId,
        name: member.Name,
        chapter: member.Chapter || 'Influencers',
        phone: member.Phone || '',
        email: member.Email || '',
        present: member.P || 0,
        absent: member.A || 0,
        substitute: member.S || 0,
        medical: member.M || 0,
        referrals_given: member.RGT || 0,
        visitors: member.V || 0,
        tyfcb: member.TYFCB || 0,
        ceu: member.CEU || 0,
        one_to_ones: member.OneToOnes || 0,
        sponsors: member.Sponsors || 0,
        score: member.score || 0,
        traffic_light: member.trafficLight?.label || 'Grey',
        batch_name: member.batch_name || '',
        raw_data: member.raw_data || {},
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('members')
        .upsert(row, { onConflict: 'org_id,name' })
        .select()
        .single();

      if (error || !data) return member;

      return scoreMember({
        id: data.id,
        org_id: data.org_id,
        Name: data.name,
        Chapter: data.chapter || member.Chapter || 'Influencers',
        Phone: data.phone || '',
        Email: data.email || '',
        P: data.present || 0,
        A: data.absent || 0,
        S: data.substitute || 0,
        M: data.medical || 0,
        RGT: data.referrals_given || 0,
        V: data.visitors || 0,
        TYFCB: Number(data.tyfcb) || 0,
        CEU: Number(data.ceu) || 0,
        OneToOnes: Number(data.one_to_ones) || 0,
        Sponsors: data.sponsors || 0,
        batch_name: data.batch_name || member.batch_name,
        raw_data: data.raw_data || member.raw_data,
      });
    } catch (e) {
      return member;
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

      const rows = members.map(m => ({
        org_id: orgId,
        user_id: userId,
        name: m.Name ? m.Name.trim() : 'Unnamed Member',
        chapter: m.Chapter || 'Influencers',
        phone: m.Phone || '',
        email: m.Email || '',
        present: m.P || 0,
        absent: m.A || 0,
        substitute: m.S || 0,
        medical: m.M || 0,
        referrals_given: m.RGT || 0,
        visitors: m.V || 0,
        tyfcb: m.TYFCB || 0,
        ceu: m.CEU || 0,
        one_to_ones: m.OneToOnes || 0,
        sponsors: m.Sponsors || 0,
        score: m.score || 0,
        traffic_light: m.trafficLight?.label || 'Grey',
        batch_name: finalBatchName,
        raw_data: m.raw_data || {},
        updated_at: new Date().toISOString(),
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
        totalScoreSum += m.score || 0;
      });

      const avgScore = members.length > 0 ? Math.round(totalScoreSum / members.length) : 0;

      // Ultra-fast single-pass parallel execution for members & import log
      const upsertPromise = supabase
        .from('members')
        .upsert(uniqueRows, { onConflict: 'org_id,name' });

      const logPromise = this.saveImportLog({
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

      await Promise.all([upsertPromise, logPromise]);
      return true;
    } catch (e) {
      console.error('upsertMembers error:', e);
      return false;
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

  async purgeAllMembers(orgId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('org_id', orgId);

      return !error;
    } catch (e) {
      return false;
    }
  },

  // --- REALTIME SUBSCRIPTION ---
  subscribeToMembers(orgId: string, onUpdate: () => void) {
    const channel = supabase
      .channel(`members-realtime-${orgId}`)
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
        return {
          scoringConfig: orgData.custom_scoring || null,
          signature: orgData.custom_signature || 'Keep the momentum going! 💪',
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  async saveOrgSettings(orgId: string, userId: string, settings: any, fullScoringConfig: any): Promise<boolean> {
    try {
      const { error: orgError } = await supabase
        .from('organizations')
        .update({
          green_threshold: settings.green,
          amber_threshold: settings.amber,
          red_threshold: settings.red,
          custom_signature: settings.signature,
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
        org_id: log.org_id,
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
      await supabase
        .from('members')
        .delete()
        .eq('org_id', orgId)
        .eq('batch_name', batchName);

      if (logId) {
        await supabase.from('import_logs').delete().eq('id', logId);
      } else {
        await supabase.from('import_logs').delete().eq('org_id', orgId).eq('batch_name', batchName);
      }

      return true;
    } catch (e) {
      return false;
    }
  }
};
