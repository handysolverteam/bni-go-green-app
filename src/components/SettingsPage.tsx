import React, { useState, useEffect } from 'react';
import { getScoringConfig, setScoringConfig, DEFAULTS } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { Settings, Save, RotateCcw, ShieldCheck, Check, MessageSquare, Heart, Loader2, Phone, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseService } from '../services/supabaseService';
import { ScoringConfig } from '../types';

interface SettingsPageProps {
  orgId?: string;
  onSettingsSaved?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ orgId, onSettingsSaved }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [config, setConfigState] = useState<ScoringConfig>(getScoringConfig());
  const [signatureText, setSignatureText] = useState('Keep the momentum going! 💪');
  const [enableSignature, setEnableSignature] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);

  // Fetch persisted settings from Supabase on mount
  useEffect(() => {
    if (!orgId || !user?.uid) return;
    const loadDbSettings = async () => {
      setIsLoadingSettings(true);
      const res = await supabaseService.fetchOrgSettings(orgId, user.uid);
      if (res) {
        if (res.scoringConfig) {
          setConfigState(res.scoringConfig);
          setScoringConfig(res.scoringConfig);
        }
        if (res.signature) {
          setSignatureText(res.signature);
        }
        if (res.enableSignature !== undefined) {
          setEnableSignature(Boolean(res.enableSignature));
        }
      }
      setIsLoadingSettings(false);
    };
    loadDbSettings();
  }, [orgId, user]);

  const handleSave = async () => {
    setScoringConfig(config);
    if (orgId && user?.uid) {
      await supabaseService.saveOrgSettings(
        orgId,
        user.uid,
        {
          green: config.trafficLight.green,
          amber: config.trafficLight.amber,
          red: config.trafficLight.red,
          signature: signatureText,
          enableSignature: enableSignature,
        },
        config
      );
    }
    setSavedSuccess(true);
    showToast('Scoring thresholds & custom signature settings saved!', 'success');
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleResetConfirm = async () => {
    setScoringConfig(DEFAULTS);
    setConfigState(DEFAULTS);
    setSignatureText('Keep the momentum going! 💪');
    setEnableSignature(true);
    setShowResetConfirm(false);
    if (orgId && user?.uid) {
      await supabaseService.saveOrgSettings(
        orgId,
        user.uid,
        {
          green: DEFAULTS.trafficLight.green,
          amber: DEFAULTS.trafficLight.amber,
          red: DEFAULTS.trafficLight.red,
          signature: 'Keep the momentum going! 💪',
          enableSignature: true,
        },
        DEFAULTS
      );
    }
    setSavedSuccess(true);
    showToast('Scoring thresholds reset to default standards', 'warning');
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const updateTier = (category: keyof ScoringConfig, index: number, field: 't' | 'pts', value: number) => {
    if (category === 'trafficLight') return;
    const currentTiers = [...config[category].thresholds];
    currentTiers[index] = { ...currentTiers[index], [field]: value };
    setConfigState({
      ...config,
      [category]: { thresholds: currentTiers }
    });
  };

  return (
    <div className="space-y-6 w-full pb-12">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-400" />
            <span>Scoring & Message Settings</span>
          </h2>
          <p className="text-xs text-slate-400">Configure 100-Point scoring threshold tiers and WhatsApp outreach signatures.</p>
        </div>

        <div className="flex items-center space-x-2">
          {isLoadingSettings && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin mr-2" />}

          <button
            onClick={() => setShowResetConfirm(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center space-x-1.5 border border-white/10 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
          >
            {savedSuccess ? <Check className="w-4 h-4 text-slate-950" /> : <Save className="w-4 h-4" />}
            <span>{savedSuccess ? 'Saved to DB!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* 1. WhatsApp Signature Card with Toggle Switch */}
      <GlassCard className="p-5 sm:p-6 space-y-4 border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">WhatsApp Message Signature</h3>
              <p className="text-[11px] text-slate-400">Append custom closing signature to outbound WhatsApp messages</p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            onClick={() => setEnableSignature(!enableSignature)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              enableSignature ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-800'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                enableSignature ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {enableSignature && (
          <div className="space-y-1.5 pt-1 animate-fadeIn">
            <label className="text-xs font-bold text-slate-300">Custom Signature Text</label>
            <input
              type="text"
              value={signatureText}
              onChange={(e) => setSignatureText(e.target.value)}
              placeholder="Keep the momentum going! 💪"
              className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-semibold text-white border-emerald-500/40"
            />
          </div>
        )}
      </GlassCard>

      {/* 2. Traffic Light Thresholds */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Traffic Light Thresholds</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <label className="text-xs font-bold text-emerald-400">🟢 Green $\ge$</label>
            <input
              type="number"
              value={config.trafficLight.green}
              onChange={(e) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, green: Number(e.target.value) } })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-black text-white"
            />
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <label className="text-xs font-bold text-amber-400">🟡 Amber $\ge$</label>
            <input
              type="number"
              value={config.trafficLight.amber}
              onChange={(e) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, amber: Number(e.target.value) } })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-black text-white"
            />
          </div>

          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
            <label className="text-xs font-bold text-rose-400">🔴 Red $\ge$</label>
            <input
              type="number"
              value={config.trafficLight.red}
              onChange={(e) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, red: Number(e.target.value) } })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-black text-white"
            />
          </div>
        </div>
      </GlassCard>

      {/* 3. Category Threshold Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Attendance Rate */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">Attendance Rate</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 10 pts</span>
          </div>
          <div className="space-y-2">
            {config.attendance.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min rate:</span>
                <input
                  type="number"
                  step="0.01"
                  value={tier.t}
                  onChange={(e) => updateTier('attendance', idx, 't', Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('attendance', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* CEU per week */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">CEU per week</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 10 pts</span>
          </div>
          <div className="space-y-2">
            {config.ceu.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min CEU/wk:</span>
                <input
                  type="number"
                  step="0.000001"
                  value={tier.t}
                  onChange={(e) => updateTier('ceu', idx, 't', Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('ceu', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* 1-2-1s per week */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">1-2-1s per week</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 20 pts</span>
          </div>
          <div className="space-y-2">
            {config.oneToOnes.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min 1-2-1/wk:</span>
                <input
                  type="number"
                  step="0.05"
                  value={tier.t}
                  onChange={(e) => updateTier('oneToOnes', idx, 't', Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('oneToOnes', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Referrals per week */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">Referrals per week</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 25 pts</span>
          </div>
          <div className="space-y-2">
            {config.referrals.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min refs/wk:</span>
                <input
                  type="number"
                  step="0.05"
                  value={tier.t}
                  onChange={(e) => updateTier('referrals', idx, 't', Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('referrals', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* TYFCB */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">TYFCB Closed Business</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 5 pts</span>
          </div>
          <div className="space-y-2">
            {config.tyfcb.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min Rs:</span>
                <input
                  type="number"
                  value={tier.t}
                  onChange={(e) => updateTier('tyfcb', idx, 't', Number(e.target.value))}
                  className="w-28 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('tyfcb', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Visitors */}
        <GlassCard className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-white text-sm">Visitors Brought</h4>
            <span className="text-xs font-extrabold text-emerald-400">Max 25 pts</span>
          </div>
          <div className="space-y-2">
            {config.visitors.thresholds.map((tier, idx) => (
              <div key={idx} className="flex items-center space-x-2 text-xs">
                <span className="text-slate-400 w-24">Min visitors:</span>
                <input
                  type="number"
                  value={tier.t}
                  onChange={(e) => updateTier('visitors', idx, 't', Number(e.target.value))}
                  className="w-24 px-2 py-1 rounded glass-input font-bold"
                />
                <span className="text-slate-500">&rarr;</span>
                <input
                  type="number"
                  value={tier.pts}
                  onChange={(e) => updateTier('visitors', idx, 'pts', Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded glass-input font-bold text-emerald-400"
                />
                <span className="text-slate-400">pts</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Handysolver Modern Footer Credit Card */}
      <GlassCard glow className="p-5 sm:p-6 rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-emerald-950/20 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3.5 text-center sm:text-left">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-[2px] shadow-lg shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="text-xs sm:text-sm font-medium text-slate-300 flex items-center justify-center sm:justify-start gap-1.5 flex-wrap">
                <span>Made with</span>
                <Heart className="w-4 h-4 text-rose-500 fill-current animate-pulse shrink-0" />
                <span>by</span>
                <strong className="text-white font-black text-sm sm:text-base">Handysolver</strong>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 font-semibold mt-0.5 flex items-center justify-center sm:justify-start gap-1 flex-wrap">
                <span className="text-emerald-400 font-bold">Rahul Singh Matharu</span>
                <span>&bull;</span>
                <span className="text-slate-300">BNI Influencers</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto shrink-0">
            <a
              href="tel:+919910662331"
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold border border-white/10 flex items-center justify-center space-x-2 transition-all hover:border-emerald-500/40 active:scale-95 shadow-sm"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>+91 9910662331</span>
            </a>

            <a
              href="mailto:connect@handysolver.com"
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold border border-white/10 flex items-center justify-center space-x-2 transition-all hover:border-teal-500/40 active:scale-95 shadow-sm"
            >
              <Mail className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>connect@handysolver.com</span>
            </a>
          </div>
        </div>
      </GlassCard>

      {/* Confirmation Modal for Reset */}
      <ConfirmationModal
        isOpen={showResetConfirm}
        type="reset"
        onConfirm={handleResetConfirm}
        onClose={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
