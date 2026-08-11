import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { UserCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { UserProfileExtended } from '../types';

interface ProfileOnboardingScreenProps {
  onProfileCompleted: (profile: UserProfileExtended) => void;
}

export const ProfileOnboardingScreen: React.FC<ProfileOnboardingScreenProps> = ({ onProfileCompleted }) => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState('');
  const [chapterRole, setChapterRole] = useState('Member');
  const [category, setCategory] = useState('');
  const [bio, setBio] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !fullName.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    const profileData: UserProfileExtended = {
      user_id: user.uid,
      full_name: fullName.trim(),
      phone: phone.trim(),
      chapter_role: chapterRole,
      business_category: category.trim(),
      bio: bio.trim(),
      is_profile_completed: true,
    };

    try {
      const ok = await supabaseService.saveUserProfile(profileData);
      if (ok) {
        onProfileCompleted(profileData);
      } else {
        setErrorMsg('Failed to save profile. Please try again.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#060a12] text-slate-100 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 z-10">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-xl shadow-emerald-500/20 mb-1">
            <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
              <UserCheck className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-white">Complete Your Member Profile</h1>
          <p className="text-xs text-slate-400">Tell your chapter team about yourself to finish setup.</p>
        </div>

        <GlassCard glow className="p-6 space-y-4 border-white/10 shadow-2xl">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Saurabh Dhull"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">WhatsApp Contact Phone</label>
              <input
                type="text"
                placeholder="e.g. +91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Chapter Role</label>
                <select
                  value={chapterRole}
                  onChange={(e) => setChapterRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl glass-input text-xs font-semibold bg-slate-900 text-white"
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
                  placeholder="e.g. IT & Software"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Short Bio / Company Name</label>
              <textarea
                rows={2}
                placeholder="e.g. Founder at HandySolver Technologies..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !fullName.trim()}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span>{isLoading ? 'Saving Profile...' : 'Complete Profile & Continue'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
};
