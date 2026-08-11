import { supabase } from '../lib/supabase';
import { Member, ScoringConfig } from '../types';
import { scoreMember } from '../lib/scoringEngine';

export interface OutreachLogRecord {
  id?: string;
  user_id?: string;
  member_name: string;
  phone: string;
  status: 'sent' | 'pending' | 'failed' | 'skipped';
  message: string;
  sent_at: string;
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
        console.warn('Supabase fetch error (falling back to local):', error.message);
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
