import React, { useState } from 'react';
import { getScoringConfig, setScoringConfig, DEFAULTS } from '../lib/scoringEngine';
import { GlassCard } from './GlassCard';
import { Settings, Save, RotateCcw, Database, ShieldCheck, Check } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [config, setConfigState] = useState(getScoringConfig());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setScoringConfig(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleReset = () => {
    setScoringConfig(DEFAULTS);
    setConfigState(DEFAULTS);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-400" />
            <span>Scoring & System Settings</span>
          </h2>
          <p className="text-xs text-slate-400">Customize PALMS 100-Point Scoring thresholds and view Supabase cloud integration status.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center space-x-1 border border-white/10 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
          >
            {savedSuccess ? <Check className="w-4 h-4 text-slate-950" /> : <Save className="w-4 h-4" />}
            <span>{savedSuccess ? 'Saved!' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Traffic Light Threshold Boundaries */}
      <GlassCard className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Traffic Light Score Thresholds (0 – 100 Points)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
            <label className="text-xs font-bold text-emerald-400">🟢 Green Minimum Score</label>
            <input
              type="number"
              value={config.trafficLight.green}
              onChange={(e) => setConfigState({
                ...config,
                trafficLight: { ...config.trafficLight, green: Number(e.target.value) }
              })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-bold text-white"
            />
            <p className="text-[11px] text-slate-400">Members $\ge$ {config.trafficLight.green} pts are Green</p>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <label className="text-xs font-bold text-amber-400">🟡 Amber Minimum Score</label>
            <input
              type="number"
              value={config.trafficLight.amber}
              onChange={(e) => setConfigState({
                ...config,
                trafficLight: { ...config.trafficLight, amber: Number(e.target.value) }
              })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-bold text-white"
            />
            <p className="text-[11px] text-slate-400">Scores {config.trafficLight.amber} – {config.trafficLight.green - 1} pts are Amber</p>
          </div>

          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
            <label className="text-xs font-bold text-rose-400">🔴 Red Minimum Score</label>
            <input
              type="number"
              value={config.trafficLight.red}
              onChange={(e) => setConfigState({
                ...config,
                trafficLight: { ...config.trafficLight, red: Number(e.target.value) }
              })}
              className="w-full px-3 py-2 rounded-lg glass-input text-sm font-bold text-white"
            />
            <p className="text-[11px] text-slate-400">Scores {config.trafficLight.red} – {config.trafficLight.amber - 1} pts are Red</p>
          </div>
        </div>
      </GlassCard>

      {/* Supabase Cloud Status Card */}
      <GlassCard glow className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Supabase Cloud Database</h3>
              <p className="text-xs text-slate-400">Project ID: oleckbfrkpmoikpkjcpa</p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Connected
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-white/5 font-mono text-xs text-slate-300 space-y-1">
          <div><span className="text-slate-500">API URL:</span> https://oleckbfrkpmoikpkjcpa.supabase.co/rest/v1/</div>
          <div><span className="text-slate-500">Status:</span> Authenticated via Supabase Anon & Publishable Key</div>
        </div>
      </GlassCard>
    </div>
  );
};
