import React, { useState, useEffect } from 'react';
import { Member } from '../types';
import { scoreMember } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { UserPlus, UserCheck, X, Save, Calculator } from 'lucide-react';

interface AddMemberModalProps {
  isOpen: boolean;
  memberToEdit?: Member | null;
  onSave: (member: Member) => Promise<void>;
  onClose: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  memberToEdit,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState<Partial<Member>>({
    Name: '',
    Phone: '',
    Email: '',
    P: 24,
    A: 0,
    S: 0,
    M: 0,
    RGT: 0,
    V: 0,
    TYFCB: 0,
    CEU: 0,
    OneToOnes: 0,
    Sponsors: 0,
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (memberToEdit) {
      setFormData({ ...memberToEdit });
    } else {
      setFormData({
        Name: '',
        Phone: '',
        Email: '',
        P: 24,
        A: 0,
        S: 0,
        M: 0,
        RGT: 0,
        V: 0,
        TYFCB: 0,
        CEU: 0,
        OneToOnes: 0,
        Sponsors: 0,
      });
    }
  }, [memberToEdit, isOpen]);

  if (!isOpen) return null;

  const currentScored = scoreMember(formData as Member);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.Name?.trim()) return;

    setIsLoading(true);
    try {
      const finalMember = scoreMember({
        ...formData,
        Name: formData.Name.trim(),
        id: memberToEdit?.id || undefined,
      } as Member);

      await onSave(finalMember);
      onClose();
    } catch (err) {
      console.error('Save member error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <GlassCard className="w-full max-w-xl p-6 space-y-6 relative border-emerald-500/30 my-8">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-white/10">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {memberToEdit ? <UserCheck className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-xl font-black text-white">
              {memberToEdit ? `Edit ${memberToEdit.Name}` : 'Add New Member'}
            </h2>
            <p className="text-xs text-slate-400">
              Enter PALMS metrics to calculate score & sync to Supabase database.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Live Score Preview Bar */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-slate-300">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>Calculated PALMS Score:</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-lg font-black text-white">{currentScored.score || 0} / 100</span>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                currentScored.trafficLight?.label === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                currentScored.trafficLight?.label === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}>
                {currentScored.trafficLight?.label}
              </span>
            </div>
          </div>

          {/* Member Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Member Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rajesh Sharma"
                value={formData.Name || ''}
                onChange={(e) => setFormData({ ...formData, Name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">WhatsApp Phone</label>
              <input
                type="text"
                placeholder="e.g. 9876543210"
                value={formData.Phone || ''}
                onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>
          </div>

          {/* PALMS Attendance & Referrals */}
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

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/10">
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
      </GlassCard>
    </div>
  );
};
