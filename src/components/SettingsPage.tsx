import React, { useState, useEffect } from 'react';
import { getScoringConfig, setScoringConfig, DEFAULTS } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { ConfirmationModal } from './ConfirmationModal';
import { Settings, Save, RotateCcw, ShieldCheck, Check, MessageSquare, Heart, Loader2, Phone, Mail, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { supabaseService } from '../services/supabaseService';
import { ScoringConfig, Member } from '../types';
import { PageHeader } from './PageHeader';
import { MessageTemplateEditor } from './MessageTemplateEditor';
import { MESSAGE_TIERS, normalizeTemplates, validateTemplate, type MessageTemplates } from '../lib/outreachUtils';

interface SettingsPageProps {
  orgId?: string;
  /** Chapter members, used only to render the WhatsApp message preview with real data. */
  members?: Member[];
  onSettingsSaved?: () => void;
}

interface CustomNumberStepperProps {
  value: number;
  onChange: (val: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  inputClassName?: string;
}

export const CustomNumberStepper: React.FC<CustomNumberStepperProps> = ({
  value,
  onChange,
  step = 1,
  min,
  max,
  className = '',
  inputClassName = '',
}) => {
  const handleIncrement = () => {
    const next = parseFloat((Number(value || 0) + step).toFixed(6));
    if (max !== undefined && next > max) return;
    onChange(next);
  };

  const handleDecrement = () => {
    const next = parseFloat((Number(value || 0) - step).toFixed(6));
    if (min !== undefined && next < min) return;
    onChange(next);
  };

  return (
    <div className={`flex items-center glass-input rounded-xl border border-white/10 px-2 py-1 overflow-hidden shrink-0 ${className}`}>
      <input
        type="number"
        step={step}
        value={isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className={`w-full bg-transparent border-0 outline-none text-xs font-black text-white focus:ring-0 p-0 ${inputClassName}`}
      />
      <div className="flex flex-col space-y-[2px] shrink-0 ml-1.5 border-l border-white/10 stepper-divider pl-1">
        <button
          type="button"
          onClick={handleIncrement}
          className="p-0.5 rounded-md stepper-btn transition-all cursor-pointer leading-none active:scale-95 flex items-center justify-center"
          title="Increase"
        >
          <ChevronUp className="w-2.5 h-2.5" />
        </button>
        <button
          type="button"
          onClick={handleDecrement}
          className="p-0.5 rounded-md stepper-btn transition-all cursor-pointer leading-none active:scale-95 flex items-center justify-center"
          title="Decrease"
        >
          <ChevronDown className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ orgId, members = [], onSettingsSaved }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [config, setConfigState] = useState<ScoringConfig>(getScoringConfig());
  const [signatureText, setSignatureText] = useState('Keep the momentum going! 💪');
  const [enableSignature, setEnableSignature] = useState(true);
  const [scoreTerm, setScoreTerm] = useState('Go Green');
  const [defaultCountryCode, setDefaultCountryCode] = useState('+91');
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplates>({});
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
        if ((res as any).scoreTerm) {
          setScoreTerm((res as any).scoreTerm);
        }
        if ((res as any).defaultCountryCode) {
          setDefaultCountryCode((res as any).defaultCountryCode);
        }
        setMessageTemplates(res.messageTemplates);
      }
      setIsLoadingSettings(false);
    };
    loadDbSettings();
  }, [orgId, user]);

  const handleSave = async () => {
    // A misspelled placeholder would otherwise go out to members verbatim, so refuse to save.
    // The editor already lists the exact problems under the box; this is the backstop.
    const brokenTier = MESSAGE_TIERS.find(t => {
      const text = messageTemplates[t];
      return text ? validateTemplate(text).length > 0 : false;
    });
    if (brokenTier) {
      showToast(`Fix the ${brokenTier} message template before saving — it has placeholder problems.`, 'error');
      return;
    }

    setScoringConfig(config);
    if (orgId && user?.uid) {
      const saved = await supabaseService.saveOrgSettings(
        orgId,
        user.uid,
        {
          green: config.trafficLight.green,
          amber: config.trafficLight.amber,
          red: config.trafficLight.red,
          signature: signatureText,
          enableSignature: enableSignature,
          scoreTerm: scoreTerm,
          defaultCountryCode: defaultCountryCode,
          messageTemplates,
        },
        config
      );
      if (!saved) {
        showToast('Could not save settings. Check your connection and permissions, then try again.', 'error');
        return;
      }
      // Blank templates are dropped on save (they mean "use auto"); mirror that here so the
      // tier badges show what will actually be used.
      setMessageTemplates(normalizeTemplates(messageTemplates));
    }
    setSavedSuccess(true);
    showToast('Scoring thresholds & custom settings saved!', 'success');
    if (onSettingsSaved) onSettingsSaved();
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleResetConfirm = async () => {
    setScoringConfig(DEFAULTS);
    setConfigState(DEFAULTS);
    setSignatureText('Keep the momentum going! 💪');
    setEnableSignature(true);
    // saveOrgSettings falls back to these when they aren't supplied, so the DB is reset to them
    // either way -- keep the form showing what was actually stored. Message templates are NOT
    // reset: this action is about scoring and the signature, and wiping wording someone
    // carefully wrote would be a nasty surprise.
    setScoreTerm('Go Green');
    setDefaultCountryCode('+91');
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
      <PageHeader
        icon={<Settings className="w-5 h-5" />}
        title="Scoring & Messages"
        right={
          <>
            {isLoadingSettings && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin mr-2 self-center sm:self-auto" />}

            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm sm:text-xs font-bold flex items-center justify-center space-x-1.5 border border-white/10 transition-all min-h-[44px] sm:min-h-0"
            >
              <RotateCcw className="w-4 h-4 text-amber-400" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={handleSave}
              className="w-full sm:w-auto px-5 py-3 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-sm sm:text-xs font-black flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all min-h-[44px] sm:min-h-0"
            >
              {savedSuccess ? <Check className="w-4 h-4 text-slate-950" /> : <Save className="w-4 h-4" />}
              <span>{savedSuccess ? 'Saved to DB!' : 'Save Settings'}</span>
            </button>
          </>
        }
      />

      {/* 1. WhatsApp Signature Card with Toggle Switch */}
      <GlassCard className="p-5 sm:p-6 space-y-4 border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">WhatsApp Outreach Messages</h3>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Default Country Code</label>
            <input
              type="text"
              value={defaultCountryCode}
              onChange={(e) => setDefaultCountryCode(e.target.value)}
              placeholder="+91"
              className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-bold text-emerald-300 border-emerald-500/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Score Term Label</label>
            <input
              type="text"
              value={scoreTerm}
              onChange={(e) => setScoreTerm(e.target.value)}
              placeholder="Go Green"
              className="w-full px-4 py-2.5 rounded-xl glass-input text-xs font-bold text-emerald-300 border-emerald-500/40"
            />
          </div>
        </div>

        {enableSignature && (
          <div className="space-y-1.5 pt-1 animate-fadeIn">
            <label className="text-xs font-bold text-slate-300">Custom Signature Text (Multiline Supported)</label>
            <textarea
              rows={4}
              value={signatureText}
              onChange={(e) => setSignatureText(e.target.value)}
              placeholder="Keep the momentum going! 💪&#10;Rahul Singh Matharu&#10;Vice President, BNI Influencers"
              className="w-full px-4 py-3 rounded-xl glass-input text-xs font-semibold text-white border-emerald-500/40 leading-relaxed resize-y whitespace-pre-wrap min-h-[90px]"
            />
          </div>
        )}

        {/* Message wording: auto-built by default, or the chapter's own template per tier */}
        <div className="pt-3 border-t border-white/10 space-y-3">
          <div className="space-y-1">
            <h4 className="text-xs font-black text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Message Wording</span>
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              By default every message is built automatically from the member's live score. Switch a tier to
              custom to write your own wording — fields like the member's name, score and action plan are
              filled in for each person.
            </p>
          </div>
          <MessageTemplateEditor
            templates={messageTemplates}
            onChange={setMessageTemplates}
            members={members}
            signature={enableSignature ? signatureText.trim() : ''}
            scoreTerm={scoreTerm || 'Go Green'}
          />
        </div>

        {/* How Messages Are Auto-Generated */}
        {/* <div className="pt-3 border-t border-white/10 space-y-2.5">
          <h4 className="text-xs font-black text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>How Messages Are Generated</span>
          </h4>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            No manual templates needed — every message is auto-built per member from their live scoring data. The structure is fixed; only the values change.
          </p>
          <div className="space-y-1.5">
            {[
              ['Greeting', 'Uses the member first name only (titles & surnames skipped).'],
              ['Score header', 'Current PALMS score /100 with their traffic light tier & emoji.'],
              ['Action plan', 'Tier-based — Green: keep improving; Amber/Red: points needed to move up, shown as "just do this", "pick any one", or "do all steps".'],
              ['Extra opportunities', 'Other ways to increase points, listed with the gain per action.'],
              ['Scoring snapshot', 'Current vs target for Attendance, CEU, 1-2-1s, Referrals, Visitors, TYFCB and Sponsors.'],
              ['Signature', 'Appends your custom signature text above the Handysolver credit.'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 p-2 rounded-xl bg-slate-900/40 border border-white/5">
                <span className="text-[10px] font-black uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 shrink-0 w-32 text-center">
                  {k}
                </span>
                <span className="text-[11px] text-slate-300 leading-relaxed pt-0.5">{v}</span>
              </div>
            ))}
          </div>
        </div> */}
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
            <CustomNumberStepper
              value={config.trafficLight.green}
              onChange={(val) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, green: val } })}
              inputClassName="text-sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <label className="text-xs font-bold text-amber-400">🟡 Amber $\ge$</label>
            <CustomNumberStepper
              value={config.trafficLight.amber}
              onChange={(val) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, amber: val } })}
              inputClassName="text-sm"
            />
          </div>

          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
            <label className="text-xs font-bold text-rose-400">🔴 Red $\ge$</label>
            <CustomNumberStepper
              value={config.trafficLight.red}
              onChange={(val) => setConfigState({ ...config, trafficLight: { ...config.trafficLight, red: val } })}
              inputClassName="text-sm"
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
                <CustomNumberStepper
                  step={0.01}
                  value={tier.t}
                  onChange={(val) => updateTier('attendance', idx, 't', val)}
                  className="w-24"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('attendance', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
                <CustomNumberStepper
                  step={0.1}
                  value={tier.t}
                  onChange={(val) => updateTier('ceu', idx, 't', val)}
                  className="w-24"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('ceu', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
                <CustomNumberStepper
                  step={0.05}
                  value={tier.t}
                  onChange={(val) => updateTier('oneToOnes', idx, 't', val)}
                  className="w-24"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('oneToOnes', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
                <CustomNumberStepper
                  step={0.05}
                  value={tier.t}
                  onChange={(val) => updateTier('referrals', idx, 't', val)}
                  className="w-24"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('referrals', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
                <CustomNumberStepper
                  step={10000}
                  value={tier.t}
                  onChange={(val) => updateTier('tyfcb', idx, 't', val)}
                  className="w-28"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('tyfcb', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
                <CustomNumberStepper
                  value={tier.t}
                  onChange={(val) => updateTier('visitors', idx, 't', val)}
                  className="w-24"
                />
                <span className="text-slate-500">&rarr;</span>
                <CustomNumberStepper
                  value={tier.pts}
                  onChange={(val) => updateTier('visitors', idx, 'pts', val)}
                  className="w-16"
                  inputClassName="text-emerald-400 font-bold"
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
              <div className="w-full h-full bg-[#001D39] rounded-[14px] flex items-center justify-center">
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
