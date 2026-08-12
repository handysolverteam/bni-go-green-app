import { createClient } from '@supabase/supabase-js';
import { Member, Organization, OrgMember, UserProfileExtended, OutreachTemplate } from '../types';
import { scoreMember } from '../lib/scoringEngine';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://oleckbfrkpmoikpkjcpa.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

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

  async fetchUserOrganization(userId: string): Promise<{ org: Organization; member: OrgMember } | null> {
    try {
      const { data: memberData, error: memberError } = await supabase
        .from('org_members')
        .select('*, organization:organizations(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (memberError || !memberData || !memberData.organization) {
        return null;
      }

      return {
        org: memberData.organization,
        member: {
          id: memberData.id,
          org_id: memberData.org_id,
          user_id: memberData.user_id,
          user_email: memberData.user_email,
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
  async fetchUserProfile(userId: string): Promise<UserProfileExtended | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return null;
      return {
        user_id: data.user_id,
        full_name: data.full_name || '',
        phone: data.phone || '',
        business_category: data.business_category || data.chapter_role || '',
        bio: data.bio || '',
        avatar_url: data.avatar_url || '',
        is_profile_completed: data.is_profile_completed ?? true,
        updated_at: data.updated_at,
      };
    } catch (e) {
      console.error('Error fetching user profile:', e);
      return null;
    }
  },

  async saveUserProfile(profile: Partial<UserProfileExtended> & { user_id: string }): Promise<boolean> {
    try {
      const p = profile as any;
      const { error: rpcError } = await supabase.rpc('save_user_profile', {
        p_user_id: profile.user_id,
        p_full_name: profile.full_name || '',
        p_phone: profile.phone || '',
        p_chapter_role: p.bni_chapter || '',
        p_business_category: p.category || '',
        p_avatar_url: profile.avatar_url || '',
        p_is_profile_completed: profile.is_profile_completed ?? true,
      });

      if (rpcError) {
        console.warn('RPC profile save warning, executing fallback upsert:', rpcError);
        const { error } = await supabase
          .from('profiles')
          .upsert({
            user_id: profile.user_id,
            full_name: profile.full_name || '',
            phone: profile.phone || '',
            chapter_role: p.bni_chapter || '',
            business_category: p.category || '',
            avatar_url: profile.avatar_url || '',
            is_profile_completed: profile.is_profile_completed ?? true,
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

      data.sort((a: any, b: any) => {
        const idxA = Number(a.raw_data?.excel_row_index);
        const idxB = Number(b.raw_data?.excel_row_index);
        if (!isNaN(idxA) && !isNaN(idxB) && idxA !== idxB) return idxA - idxB;
        return (a.created_at || '').localeCompare(b.created_at || '');
      });

      return data.map((row: any) => {
        const raw = row.raw_data || {};
        const totalVal = Number(raw['Total Score'] ?? raw['total_score'] ?? raw['TotalScore'] ?? row.score) || (row.score > 0 ? row.score : undefined);
        const mem = scoreMember({
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

      const row = {
        ...(scored.id && !scored.id.startsWith('temp_') ? { id: scored.id } : {}),
        org_id: orgId,
        user_id: userId,
        name: scored.Name,
        chapter: scored.Chapter || 'Influencers',
        phone: scored.Phone || '',
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
        batch_name: scored.batch_name || '',
        raw_data: scored.raw_data || {},
        updated_at: new Date().toISOString(),
      };

      const { data: upsertData } = await supabase.from('members').upsert(row).select().single();
      if (upsertData) {
        return scoreMember({
          ...scored,
          id: upsertData.id,
        });
      }
      return scored;
    } catch (e) {
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
        user_id: userId || '',
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

      return true;
    } catch (e) {
      console.error('upsertMembers error:', e);
      return false;
    }
  },

  async purgeAllMembers(orgId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('purge_all_bni_chapter_data', {
        p_org_id: orgId,
      });

      if (error) {
        await supabase.from('members').delete().eq('org_id', orgId);
        await supabase.from('import_logs').delete().eq('org_id', orgId);
      }
      return true;
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

  // --- OUTREACH TEMPLATES CRUD ---
  async fetchOutreachTemplates(orgId?: string): Promise<OutreachTemplate[]> {
    try {
      let query = supabase.from('outreach_templates').select('*');
      if (orgId) {
        query = query.or(`org_id.eq.${orgId},is_default.eq.true`);
      } else {
        query = query.eq('is_default', true);
      }

      const { data, error } = await query.order('created_at', { ascending: true });
      if (error || !data || data.length === 0) {
        return DEFAULT_OUTREACH_TEMPLATES;
      }
      return data;
    } catch (e) {
      return DEFAULT_OUTREACH_TEMPLATES;
    }
  },

  async saveOutreachTemplate(template: Partial<OutreachTemplate>): Promise<boolean> {
    try {
      const row = {
        ...(template.id && !template.id.startsWith('temp_') && !template.id.startsWith('default_') ? { id: template.id } : {}),
        org_id: template.org_id || null,
        name: template.name || 'Custom Outreach Template',
        status_target: template.status_target || 'All',
        message_template: template.message_template || '',
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('outreach_templates').upsert(row);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async deleteOutreachTemplate(templateId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('outreach_templates').delete().eq('id', templateId);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async updateMemberPhone(memberId: string, phone: string): Promise<boolean> {
    return this.updateMemberDetails(memberId, { phone });
  },

  async updateMemberDetails(memberId: string, details: { phone?: string; joinDate?: string }): Promise<boolean> {
    try {
      const payload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (details.phone !== undefined) payload.phone = details.phone.trim();
      if (details.joinDate !== undefined) payload.join_date = details.joinDate.trim();

      const { error } = await supabase
        .from('members')
        .update(payload)
        .eq('id', memberId);
      return !error;
    } catch (e) {
      return false;
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
