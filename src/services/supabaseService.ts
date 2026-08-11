import { supabase } from '../lib/supabase';
import { Member, ScoringConfig } from '../types';
import { scoreMember, DEFAULTS } from '../lib/scoringEngine';

export interface OutreachLogRecord {
  id?: string;
  user_id?: string;
  member_name: string;
  phone: string;
  status: 'sent' | 'pending' | 'failed' | 'skipped';
  message: string;
  sent_at: string;
}

export interface ChapterSettings {
  green_threshold: number;
  amber_threshold: number;
  red_threshold: number;
  custom_signature: string;
}

export const supabaseService = {
  // --- MEMBERS CRUD ---
  async fetchMembers(userId: string): Promise<Member[]> {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error:', error.message);
        return [];
      }

      if (data && data.length > 0) {
        return data.map((row: any) => scoreMember({
          id: row.id,
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
      }
      return [];
    } catch (e) {
      console.error('Supabase fetch exception:', e);
      return [];
    }
  },

  async upsertMembers(members: Member[], userId: string): Promise<boolean> {
    try {
      const rows = members.map(m => ({
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
        .upsert(rows, { onConflict: 'user_id, name' });

      if (error) {
        console.warn('Supabase upsert error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Supabase upsert exception:', e);
      return false;
    }
  },

  async saveSingleMember(member: Member, userId: string): Promise<Member | null> {
    try {
      const row = {
        ...(member.id ? { id: member.id } : {}),
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

      if (error || !data) {
        console.warn('Save member DB error:', error?.message);
        return member;
      }

      return scoreMember({
        id: data.id,
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

  async deleteMember(memberId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('id', memberId)
        .eq('user_id', userId);

      if (error) {
        console.warn('Supabase delete error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Supabase delete exception:', e);
      return false;
    }
  },

  async purgeAllMembers(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('members')
        .delete()
        .eq('user_id', userId);

      if (error) {
        console.warn('Supabase purge error:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Supabase purge exception:', e);
      return false;
    }
  },

  // --- REALTIME SUBSCRIPTION ---
  subscribeToMembers(userId: string, onUpdate: () => void) {
    const channel = supabase
      .channel(`members-realtime-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${userId}` },
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
  async fetchSettings(userId: string): Promise<ChapterSettings | null> {
    try {
      const { data, error } = await supabase
        .from('chapter_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) return null;
      return {
        green_threshold: data.green_threshold || 70,
        amber_threshold: data.amber_threshold || 50,
        red_threshold: data.red_threshold || 30,
        custom_signature: data.custom_signature || 'Keep the momentum going! 💪',
      };
    } catch (e) {
      return null;
    }
  },

  async saveSettings(settings: ChapterSettings, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chapter_settings')
        .upsert({
          user_id: userId,
          green_threshold: settings.green_threshold,
          amber_threshold: settings.amber_threshold,
          red_threshold: settings.red_threshold,
          custom_signature: settings.custom_signature,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      return !error;
    } catch (e) {
      return false;
    }
  },

  // --- OUTREACH LOGS ---
  async saveOutreachLog(log: OutreachLogRecord): Promise<boolean> {
    try {
      const { error } = await supabase.from('outreach_logs').insert([log]);
      if (error) console.warn('Save log error:', error.message);
      return !error;
    } catch (e) {
      return false;
    }
  },

  async fetchOutreachLogs(userId: string): Promise<OutreachLogRecord[]> {
    try {
      const { data, error } = await supabase
        .from('outreach_logs')
        .select('*')
        .eq('user_id', userId)
        .order('sent_at', { ascending: false });

      if (error || !data) return [];
      return data as OutreachLogRecord[];
    } catch (e) {
      return [];
    }
  }
};
