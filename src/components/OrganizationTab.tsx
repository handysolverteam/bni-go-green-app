import React, { useState, useEffect } from 'react';
import { Organization, OrgMember, UserRole } from '../types';
import { GlassCard } from './GlassCard';
import { Building2, Copy, Check, Users, ShieldCheck, Crown, Shield, Loader2 } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

interface OrganizationTabProps {
  org: Organization | null;
  orgMember: OrgMember | null;
}

export const OrganizationTab: React.FC<OrganizationTabProps> = ({ org, orgMember }) => {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isAdminOrOwner = orgMember?.role === 'owner' || orgMember?.role === 'admin';

  useEffect(() => {
    if (!org?.id) return;
    const loadMembers = async () => {
      setIsLoading(true);
      const res = await supabaseService.fetchOrgMembers(org.id);
      setMembers(res);
      setIsLoading(false);
    };
    loadMembers();
  }, [org]);

  const handleCopyCode = () => {
    if (org?.code) {
      navigator.clipboard.writeText(org.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (!org?.id || !isAdminOrOwner) return;
    const ok = await supabaseService.updateOrgMemberRole(org.id, targetUserId, newRole);
    if (ok) {
      setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m));
    }
  };

  if (!org) {
    return (
      <GlassCard className="p-8 text-center space-y-2">
        <Building2 className="w-10 h-10 text-slate-500 mx-auto" />
        <h3 className="text-base font-bold text-white">No Organization Attached</h3>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Org Header Card */}
      <GlassCard glow className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center text-[#22c55e]">
                <Building2 className="w-6 h-6" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">{org.name}</h2>
              <p className="text-xs text-slate-400">
                {org.chapter_name || 'BNI Chapter'} &bull; {org.city || 'Regional Division'}
              </p>
            </div>
          </div>

          {/* 6-Digit Code Badge */}
          <div className="flex items-center space-x-2 bg-slate-900/90 border border-emerald-500/30 px-4 py-2 rounded-2xl">
            <div>
              <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">6-Digit Invite Code</div>
              <div className="text-lg font-black text-emerald-400 tracking-widest">{org.code}</div>
            </div>
            <button
              onClick={handleCopyCode}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              title="Copy Invite Code"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-300 flex items-center justify-between">
          <span>Your Org Role: <strong className="text-emerald-400 capitalize">{orgMember?.role}</strong></span>
          <span className="text-slate-500">Total Members: {members.length}</span>
        </div>
      </GlassCard>

      {/* Org Members List & RBAC */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <span>Organization Team & Role Permissions</span>
        </h3>

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 uppercase text-slate-400 border-b border-white/10 font-black">
              <tr>
                <th className="px-4 py-3">Member Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Role Access Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/40">
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center">
                    <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto mb-2" />
                    <span className="text-xs text-slate-400">Loading organization team members...</span>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No team members found in this organization. Share your 6-digit invite code to invite members!
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-bold text-white flex items-center space-x-2">
                      {m.role === 'owner' ? <Crown className="w-4 h-4 text-amber-400" /> :
                       m.role === 'admin' ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> :
                       <Shield className="w-4 h-4 text-slate-400" />}
                      <span>{m.user_email || m.user_id}</span>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full capitalize ${
                        m.role === 'owner' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        m.role === 'admin' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                      }`}>
                        {m.role}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {isAdminOrOwner && m.role !== 'owner' ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.user_id, e.target.value as UserRole)}
                          className="px-2 py-1 rounded-lg glass-input text-xs font-bold text-white bg-slate-900"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-500">Fixed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
};
