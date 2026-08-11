import React, { useState } from 'react';
import { UserProfileExtended, Organization, OrgMember } from '../types';
import { GlassCard } from './GlassCard';
import { User, ShieldCheck, Building2, Save, Check } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

interface ProfilePageProps {
  profile: UserProfileExtended | null;
  org: Organization | null;
  orgMember: OrgMember | null;
  onProfileUpdated: (updated: UserProfileExtended) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ profile, org, orgMember, onProfileUpdated }) => {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [chapterRole, setChapterRole] = useState(profile?.chapter_role || 'Member');
  const [category, setCategory] = useState(profile?.business_category || '');
  const [bio, setBio] = useState(profile?.bio || '');

  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.user_id || !fullName.trim()) return;

    setIsLoading(true);
    const updated: UserProfileExtended = {
      ...profile,
      full_name: fullName.trim(),
      phone: phone.trim(),
      chapter_role: chapterRole,
      business_category: category.trim(),
      bio: bio.trim(),
      is_profile_completed: true,
    };

    const ok = await supabaseService.saveUserProfile(updated);
    if (ok) {
      onProfileUpdated(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Profile Banner Card */}
      <GlassCard glow className="p-6 space-y-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center font-black text-emerald-400 text-xl">
              {(fullName || 'U').charAt(0).toUpperCase()}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-black text-white">{fullName || 'User Profile'}</h2>
            <div className="flex items-center space-x-2 text-xs text-slate-400 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="capitalize text-white font-bold">{orgMember?.role || 'Member'} Role</span>
              <span>&bull;</span>
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              <span>{org?.name || 'Chapter'}</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Edit Form */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <span>Edit Profile Details</span>
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">WhatsApp Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Chapter Role</label>
              <select
                value={chapterRole}
                onChange={(e) => setChapterRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold bg-slate-900 text-white"
              >
                <option value="President">President</option>
                <option value="Vice President">Vice President</option>
                <option value="Secretary Treasurer">Secretary Treasurer</option>
                <option value="Membership Committee">Membership Committee</option>
                <option value="Visitor Host">Visitor Host</option>
                <option value="Education Coordinator">Education Coordinator</option>
                <option value="Member">Member</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Business Category</label>
              <input
                type="text"
                placeholder="e.g. Real Estate / Software"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Bio / Company Details</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isLoading || !fullName.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all disabled:opacity-50"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-slate-950" /> : <Save className="w-4 h-4" />}
              <span>{isLoading ? 'Saving...' : savedSuccess ? 'Profile Saved!' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
};
