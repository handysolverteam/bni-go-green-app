import React, { useState } from 'react';
import { UserProfileExtended, Organization, OrgMember } from '../types';
import { GlassCard } from './GlassCard';
import { User, ShieldCheck, Building2, Save, Check, Copy, Camera, Upload, Link } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useToast } from '../context/ToastContext';

interface ProfilePageProps {
  profile: UserProfileExtended | null;
  org: Organization | null;
  orgMember: OrgMember | null;
  onProfileUpdated: (updated: UserProfileExtended) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ profile, org, orgMember, onProfileUpdated }) => {
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80');
  const [category, setCategory] = useState(profile?.business_category || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [showCustomUrlInput, setShowCustomUrlInput] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const newAvatar = event.target.result as string;
          setAvatarUrl(newAvatar);

          if (profile?.user_id) {
            const updated: UserProfileExtended = {
              ...profile,
              full_name: fullName.trim() || profile.full_name || 'Member',
              phone: phone.trim() || profile.phone || '',
              avatar_url: newAvatar,
              business_category: category.trim() || profile.business_category || '',
              bio: bio.trim() || profile.bio || '',
              is_profile_completed: true,
            };
            const ok = await supabaseService.saveUserProfile(updated);
            if (ok) {
              onProfileUpdated(updated);
              showToast('New profile photo uploaded & saved to database!', 'success');
              return;
            }
          }
          showToast('New profile photo loaded!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyCode = () => {
    if (org?.code) {
      navigator.clipboard.writeText(org.code);
      setCopiedCode(true);
      showToast('Invite code copied to clipboard!', 'info');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.user_id) return;

    if (!fullName.trim()) {
      showToast('Please enter your Full Name', 'error');
      return;
    }

    if (!phone.trim()) {
      showToast('WhatsApp Phone number is compulsory', 'error');
      return;
    }

    setIsLoading(true);
    const updated: UserProfileExtended = {
      ...profile,
      full_name: fullName.trim(),
      phone: phone.trim(),
      avatar_url: avatarUrl,
      business_category: category.trim(),
      bio: bio.trim(),
      is_profile_completed: true,
    };

    const ok = await supabaseService.saveUserProfile(updated);
    if (ok) {
      onProfileUpdated(updated);
      setSavedSuccess(true);
      showToast('Profile photo & details updated in database!', 'success');
      setTimeout(() => setSavedSuccess(false), 2000);
    } else {
      showToast('Failed to save profile. Check database connection.', 'error');
    }
    setIsLoading(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Profile Banner Card */}
      <GlassCard glow className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative group">
              <img
                src={avatarUrl}
                alt="Profile Avatar"
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/50 shadow-lg"
              />
              <label className="absolute inset-0 rounded-2xl bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-all">
                <Camera className="w-5 h-5 text-white" />
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
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

          {/* Org Code Widget */}
          {org?.code && (
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex items-center space-x-3">
              <div>
                <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Chapter Invite Code</div>
                <div className="text-base font-black text-emerald-400 tracking-widest">{org.code}</div>
              </div>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                title="Copy Invite code"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Edit Form */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <span>Edit Profile & Avatar Photo</span>
        </h3>

        {/* Upload Action Bar */}
        <div className="flex items-center space-x-3 pt-1">
          <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center space-x-1.5 cursor-pointer border border-white/10 transition-all">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Upload Custom Photo</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setShowCustomUrlInput(!showCustomUrlInput)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center space-x-1.5 border border-white/10 transition-all"
          >
            <Link className="w-4 h-4 text-teal-400" />
            <span>Image URL</span>
          </button>
        </div>

        {showCustomUrlInput && (
          <input
            type="url"
            placeholder="Paste image URL..."
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs font-semibold text-white animate-fadeIn"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
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
              <label className="text-xs font-bold text-slate-300">WhatsApp Phone *</label>
              <input
                type="tel"
                inputMode="numeric"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300">Business Category</label>
            <input
              type="text"
              placeholder="e.g. Digital Marketing / Real Estate"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl glass-input text-xs font-semibold"
            />
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
