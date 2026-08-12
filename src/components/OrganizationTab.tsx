import React, { useState, useEffect } from 'react';
import { Organization, OrgMember, UserRole } from '../types';
import { GlassCard } from './GlassCard';
import { Building2, Copy, Check, Users, ShieldCheck, Crown, Shield, Loader2 } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useToast } from '../context/ToastContext';

interface OrganizationTabProps {
  org: Organization | null;
  orgMember: OrgMember | null;
}

export const OrganizationTab: React.FC<OrganizationTabProps> = ({ org, orgMember }) => {
  const { showToast } = useToast();
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
      showToast('6-digit organization code copied to clipboard!', 'info');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    if (!org?.id || !isAdminOrOwner) return;
    const ok = await supabaseService.updateOrgMemberRole(org.id, targetUserId, newRole);
    if (ok) {
      setMembers(prev => prev.map(m => m.user_id === targetUserId ? { ...m, role: newRole } : m));
      showToast(`Updated member role to ${newRole.toUpperCase()}`, 'success');
    } else {
      showToast('Failed to update member role. Check DB permissions.', 'error');
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
              <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Invite Code</div>
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

        {/* Mobile Roster Cards View (<640px) */}
        <div className="sm:hidden space-y-2.5">
          {isLoading ? (
            <div className="py-6 text-center text-slate-500 flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Loading roster...</span>
            </div>
          ) : (
            members.map((mem) => {
              const isMe = mem.user_id === orgMember?.user_id;
              const isOwner = mem.role === 'owner';

              return (
                <div key={mem.id} className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-white text-xs">
                        {(mem.user_email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1">
                          <span className="truncate max-w-[180px]">{mem.user_email || 'User'}</span>
                          {isMe && <span className="text-[10px] text-emerald-400 font-extrabold">(You)</span>}
                        </div>
                        <div className="pt-0.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            mem.role === 'owner' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            mem.role === 'admin' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            'bg-slate-800 text-slate-400 border border-slate-700/50'
                          }`}>
                            {mem.role === 'owner' ? <Crown className="w-3 h-3 text-amber-400" /> : <Shield className="w-3 h-3 text-emerald-400" />}
                            <span>{mem.role.toUpperCase()}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isAdminOrOwner && !isOwner && !isMe && (
                    <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                      <button
                        onClick={() => handleRoleChange(mem.user_id, mem.role === 'admin' ? 'member' : 'admin')}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold text-center border border-white/10 transition-all"
                      >
                        {mem.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Roster Table View (>=640px) */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-white/10">
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
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse border-b border-white/5">
                    <td className="px-4 py-3.5"><div className="h-4 bg-slate-800/80 rounded-md w-48" /></td>
                    <td className="px-4 py-3.5"><div className="h-5 bg-emerald-500/20 rounded-full w-16" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="h-7 bg-slate-800/60 rounded-xl w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No team members found in this organization. Share your invite code to invite members!
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
