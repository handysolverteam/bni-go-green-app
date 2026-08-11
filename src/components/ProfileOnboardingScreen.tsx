import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { UserCheck, ArrowRight, Camera } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useAuth } from '../context/AuthContext';
import { UserProfileExtended } from '../types';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
];

interface ProfileOnboardingScreenProps {
  onProfileCompleted: (profile: UserProfileExtended) => void;
}

export const ProfileOnboardingScreen: React.FC<ProfileOnboardingScreenProps> = ({ onProfileCompleted }) => {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.photoURL || PRESET_AVATARS[0]);
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
      avatar_url: avatarUrl,
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
          <h1 className="text-2xl font-black text-white">Complete Your Profile</h1>
          <p className="text-xs text-slate-400">Set up your avatar and profile details to get started.</p>
        </div>

        <GlassCard glow className="p-6 space-y-4 border-white/10 shadow-2xl">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Avatar Selector */}
          <div className="flex flex-col items-center space-y-2 pb-2">
            <div className="relative">
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover ring-4 ring-emerald-500/40 shadow-xl"
              />
            </div>
            <div className="flex items-center space-x-2 pt-1">
              {PRESET_AVATARS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(url)}
                  className={`w-7 h-7 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === url ? 'border-emerald-400 scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt="Preset" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">WhatsApp Phone</label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Business Category</label>
                <input
                  type="text"
                  placeholder="e.g. Real Estate"
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
