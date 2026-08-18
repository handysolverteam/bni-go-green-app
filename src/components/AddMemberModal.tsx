import React, { useState, useEffect, useMemo } from 'react';
import { Member } from '../types';
import { scoreMember } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { UserPlus, UserCheck, X, Save, Calculator } from 'lucide-react';
import { UniversalModal } from './UniversalModal';
import { useToast } from '../context/ToastContext';

interface AddMemberModalProps {
  isOpen: boolean;
  memberToEdit?: Member | null;
  onSave: (member: Member) => Promise<void>;
  onClose: () => void;
  chapters?: string[];
  rosterMembers?: Member[];
  currentReportMembers?: Member[];
  isRosterOnly?: boolean;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  onSave,
  memberToEdit = null,
  chapters = [],
  rosterMembers = [],
  currentReportMembers = [],
  isRosterOnly = false,
}) => {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRosterName, setSelectedRosterName] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Member>>({
    Name: '',
    Chapter: chapters[0] || 'Handychapter',
    P: 0,
    A: 0,
    S: 0,
    M: 0,
    RGT: 0,
    V: 0,
    TYFCB: 0,
    CEU: 0,
    OneToOnes: 0,
    Sponsors: 0,
    Phone: '',
    JoinDate: '',
  });

  // Calculate available roster members who are NOT ALREADY in the active report
  const existingReportNames = useMemo(() => {
    return new Set((currentReportMembers || []).map(m => (m.Name || '').trim().toLowerCase()));
  }, [currentReportMembers]);

  const availableRosterMembers = useMemo(() => {
    if (!rosterMembers || rosterMembers.length === 0) return [];
    const uniqueMap = new Map<string, Member>();
    
    const isFilteredReport = Boolean(
      currentReportMembers &&
      currentReportMembers.length > 0 &&
      currentReportMembers.length < rosterMembers.length
    );

    rosterMembers.forEach(m => {
      const norm = (m.Name || '').trim().toLowerCase();
      if (norm) {
        if (!isFilteredReport || !existingReportNames.has(norm)) {
          if (!uniqueMap.has(norm)) {
            uniqueMap.set(norm, m);
          }
        }
      }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => a.Name.localeCompare(b.Name));
  }, [rosterMembers, existingReportNames, currentReportMembers]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedRosterName('');
    if (memberToEdit) {
      setFormData({
        ...memberToEdit,
        Phone: memberToEdit.Phone || '',
        JoinDate: memberToEdit.JoinDate || '',
      });
    } else {
      setFormData({
        Name: '',
        Chapter: (chapters && chapters[0]) || 'Handychapter',
        P: 0,
        A: 0,
        S: 0,
        M: 0,
        RGT: 0,
        V: 0,
        TYFCB: 0,
        CEU: 0,
        OneToOnes: 0,
        Sponsors: 0,
        Phone: '',
        JoinDate: '',
      });
    }
  }, [isOpen, memberToEdit?.id]);

  const currentScored = scoreMember(formData as Member);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.Name?.trim()) {
      showToast('Member name is required!', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const updatedMember: Member = {
        id: memberToEdit?.id || `mem_${Date.now()}`,
        Name: formData.Name.trim(),
        Chapter: formData.Chapter || 'Handychapter',
        P: Number(formData.P) || 0,
        A: Number(formData.A) || 0,
        S: Number(formData.S) || 0,
        M: Number(formData.M) || 0,
        RGT: Number(formData.RGT) || 0,
        V: Number(formData.V) || 0,
        TYFCB: Number(formData.TYFCB) || 0,
        CEU: Number(formData.CEU) || 0,
        OneToOnes: Number(formData.OneToOnes) || 0,
        Sponsors: Number(formData.Sponsors) || 0,
        Phone: formData.Phone || '',
        JoinDate: formData.JoinDate || '',
      };

      await onSave(updatedMember);
      showToast(memberToEdit ? 'Member updated successfully!' : 'New member added to database!', 'success');
      onClose();
    } catch (err) {
      showToast('Failed to save member.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <UniversalModal
      isOpen={isOpen}
      onClose={onClose}
      title={isRosterOnly ? 'Add Member to Master Roster' : memberToEdit ? `Edit ${memberToEdit.Name}` : 'Add New Member to Report'}
      icon={memberToEdit ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
      maxWidth="max-w-xl"
    >
      {/* Form Body */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Roster Only Mode: Simple Name & Phone Inputs */}
        {isRosterOnly ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Member Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={formData.Name || ''}
                onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 text-xs font-bold text-white border border-slate-700 focus:border-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">WhatsApp Phone Number *</label>
              <input
                type="tel"
                inputMode="numeric"
                required
                placeholder="e.g. 9876543210"
                value={formData.Phone || ''}
                onChange={(e) => setFormData({ ...formData, Phone: e.target.value.replace(/[^0-9]/g, '') })}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 text-xs font-bold text-white border border-slate-700 focus:border-emerald-500"
              />
            </div>
          </div>
        ) : (
          <>
            {/* Optional Roster Selection Dropdown (Only for NEW report members) */}
            {!memberToEdit && availableRosterMembers.length > 0 && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-black text-emerald-400">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>Select from Existing Chapter Roster (Optional)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Pick an existing roster member to auto-fill their details (showing members not yet in this report):
                </p>
                <select
                  value={selectedRosterName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedRosterName(val);
                    if (val) {
                      const match = availableRosterMembers.find(m => 
                        (m.id && m.id === val) || 
                        m.Name === val || 
                        (m.Name || '').trim().toLowerCase() === val.trim().toLowerCase()
                      );
                      if (match) {
                        setFormData(prev => ({
                          ...prev,
                          ...match,
                          Name: match.Name || '',
                          Phone: match.Phone || '',
                          JoinDate: match.JoinDate || (match as any).join_date || '',
                          Chapter: match.Chapter || chapters[0] || 'Handychapter',
                          Email: match.Email || '',
                          user_id: match.user_id,
                          P: Number(match.P) || 0,
                          A: Number(match.A) || 0,
                          S: Number(match.S) || 0,
                          M: Number(match.M) || 0,
                          RGT: Number(match.RGT) || 0,
                          V: Number(match.V) || 0,
                          TYFCB: Number(match.TYFCB) || 0,
                          CEU: Number(match.CEU) || 0,
                          OneToOnes: Number(match.OneToOnes) || 0,
                          Sponsors: Number(match.Sponsors) || 0,
                        }));
                        showToast(`Selected "${match.Name}" - details auto-filled!`, 'info');
                      }
                    } else {
                      setFormData({
                        Name: '',
                        Chapter: chapters[0] || 'Handychapter',
                        P: 0,
                        A: 0,
                        S: 0,
                        M: 0,
                        RGT: 0,
                        V: 0,
                        TYFCB: 0,
                        CEU: 0,
                        OneToOnes: 0,
                        Sponsors: 0,
                        Phone: '',
                        JoinDate: '',
                      });
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 text-xs font-bold text-white border border-emerald-500/40 focus:outline-none focus:border-emerald-400 cursor-pointer"
                >
                  <option value="">-- Create New Custom Member --</option>
                  {availableRosterMembers.map((m, idx) => (
                    <option key={m.id || `ros_${idx}`} value={m.id || m.Name}>
                      {m.Name} {m.Phone ? `(${m.Phone})` : '(No Phone)'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Live Score Preview Bar */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-300">
                  <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Calculated Traffic Light Score</span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <span className="text-lg font-black text-white">
                    {currentScored.score || 0} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                  </span>
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                    currentScored.trafficLight?.label === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    currentScored.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {currentScored.trafficLight?.emoji} {currentScored.trafficLight?.label}
                  </span>
                </div>
              </div>

              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, currentScored.score || 0))}%`,
                    backgroundColor: currentScored.trafficLight?.color || '#94a3b8',
                  }}
                />
              </div>
            </div>
          </>
        )}

          {/* Report Member Full Info & Metric Scores (Only for Report Mode) */}
          {!isRosterOnly && (
            <>
              {/* Member Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Member Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formData.Name || ''}
                    onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">WhatsApp Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +91 9876543210"
                    value={formData.Phone || ''}
                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Joining Date (Optional)</label>
                  <input
                    type="date"
                    value={formData.JoinDate || (formData as any).join_date || ''}
                    onChange={(e) => setFormData({ ...formData, JoinDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold text-white"
                  />
                </div>
              </div>

              {/* Attendance & Referrals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Present (P)</label>
                  <input
                    type="number"
                    value={formData.P ?? 0}
                    onChange={(e) => setFormData({ ...formData, P: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Absent (A)</label>
                  <input
                    type="number"
                    value={formData.A ?? 0}
                    onChange={(e) => setFormData({ ...formData, A: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Substitute (S)</label>
                  <input
                    type="number"
                    value={formData.S ?? 0}
                    onChange={(e) => setFormData({ ...formData, S: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Medical (M)</label>
                  <input
                    type="number"
                    value={formData.M ?? 0}
                    onChange={(e) => setFormData({ ...formData, M: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Referrals Given</label>
                  <input
                    type="number"
                    value={formData.RGT ?? 0}
                    onChange={(e) => setFormData({ ...formData, RGT: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">1-2-1 Meetings</label>
                  <input
                    type="number"
                    value={formData.OneToOnes ?? 0}
                    onChange={(e) => setFormData({ ...formData, OneToOnes: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Visitors Brought</label>
                  <input
                    type="number"
                    value={formData.V ?? 0}
                    onChange={(e) => setFormData({ ...formData, V: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">TYFCB (₹)</label>
                  <input
                    type="number"
                    value={formData.TYFCB ?? 0}
                    onChange={(e) => setFormData({ ...formData, TYFCB: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">CEUs (Trainings)</label>
                  <input
                    type="number"
                    value={formData.CEU ?? 0}
                    onChange={(e) => setFormData({ ...formData, CEU: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400">Members Sponsored</label>
                  <input
                    type="number"
                    value={formData.Sponsors ?? 0}
                    onChange={(e) => setFormData({ ...formData, Sponsors: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 rounded-lg glass-input text-xs font-bold text-white"
                  />
                </div>
              </div>
            </>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2.5 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading || !formData.Name?.trim()}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all disabled:opacity-50 flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isLoading ? 'Saving...' : memberToEdit ? 'Update Member' : 'Save Member'}</span>
            </button>
          </div>
        </form>
    </UniversalModal>
  );
};
