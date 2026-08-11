import { supabase } from '../lib/supabase';
import { Member, Organization, OrgMember, UserProfileExtended, UserRole } from '../types';
import { scoreMember } from '../lib/scoringEngine';

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

function generate6DigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const supabaseService = {
  // --- ORGANIZATION MANAGEMENT ---
  async createOrganization(
    name: string,
    chapterName: string,
    city: string,
    userId: string,
    userEmail?: string
  ): Promise<{ res: { org: Organization; member: OrgMember } | null; error?: string }> {
    try {
      const code = generate6DigitCode();
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([{
          name,
          chapter_name: chapterName,
          city,
          code,
          created_by: userId,
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
        return { res: null, error: 'Invalid 6-digit code or table missing.' };
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
          chapter_role: profile.chapter_role || '',
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
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('members')
        .upsert(row)
        .select()
        .single();

      if (error || !data) return member;

      return scoreMember({
        id: data.id,
        org_id: data.org_id,
        Name: data.name,
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
      });
    } catch (e) {
      return member;
    }
  },

  async upsertMembers(members: Member[], orgId: string, userId: string): Promise<boolean> {
    try {
      const rows = members.map(m => ({
        org_id: orgId,
        user_id: userId,
        name: m.Name,
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
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('members')
        .upsert(rows, { onConflict: 'org_id, name' });

      return !error;
    } catch (e) {
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
  async saveOrgSettings(orgId: string, settings: { green: number; amber: number; red: number; signature: string }): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          green_threshold: settings.green,
          amber_threshold: settings.amber,
          red_threshold: settings.red,
          custom_signature: settings.signature,
        })
        .eq('id', orgId);

      return !error;
    } catch (e) {
      return false;
    }
  },

  // --- OUTREACH LOGS ---
  async saveOutreachLog(log: OutreachLogRecord): Promise<boolean> {
    try {
      const { error } = await supabase.from('outreach_logs').insert([log]);
      return !error;
    } catch (e) {
      return false;
    }
  }
};
