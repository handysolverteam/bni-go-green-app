import React, { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { OutreachTemplate } from '../types';
import { supabaseService, DEFAULT_OUTREACH_TEMPLATES } from '../services/supabaseService';
import { useToast } from '../context/ToastContext';
import {
  FileText, Plus, Edit, Trash2, Check, Sparkles, Tag, Eye, RefreshCw, Copy, Layers
} from 'lucide-react';

interface TemplateManagerPageProps {
  orgId?: string;
  onSelectTemplate?: (template: OutreachTemplate) => void;
}

const DYNAMIC_KEYWORDS = [
  { label: 'Member Name', key: '{{name}}' },
  { label: 'PALMS Score', key: '{{score}}' },
  { label: 'Traffic Light Tier', key: '{{traffic_light}}' },
  { label: 'Present Count', key: '{{present}}' },
  { label: 'Absent Count', key: '{{absent}}' },
  { label: 'Referrals Given', key: '{{referrals}}' },
  { label: 'TYFCB Amount', key: '{{tyfcb}}' },
  { label: 'One-to-Ones', key: '{{one_to_ones}}' },
  { label: 'CEU Units', key: '{{ceu}}' },
  { label: 'Sponsors', key: '{{sponsors}}' },
  { label: 'Chapter Name', key: '{{chapter}}' },
];

const SAMPLE_MEMBER = {
  name: 'Neraj K Anand',
  score: '78',
  traffic_light: 'Green',
  present: '12',
  absent: '1',
  referrals: '45',
  tyfcb: '₹12,50,000',
  one_to_ones: '8',
  ceu: '15',
  sponsors: '3',
  chapter: 'Influencers',
};

export const substituteKeywords = (templateText: string, data: Record<string, string>): string => {
  let result = templateText;
  Object.entries(data).forEach(([key, val]) => {
    const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(reg, val);
  });
  return result;
};

export const TemplateManagerPage: React.FC<TemplateManagerPageProps> = ({ orgId, onSelectTemplate }) => {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Editor states
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [targetStatus, setTargetStatus] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadTemplates = async () => {
    setIsLoading(true);
    const data = await supabaseService.fetchOutreachTemplates(orgId);
    setTemplates(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadTemplates();
  }, [orgId]);

  const handleOpenNew = () => {
    setEditingId(null);
    setTemplateName('');
    setTargetStatus('All');
    setMessageTemplate('Hi {{name}}, your PALMS score in BNI {{chapter}} is {{score}} ({{traffic_light}} Tier). Keep up the great momentum!');
    setIsEditing(true);
  };

  const handleOpenEdit = (t: OutreachTemplate) => {
    setEditingId(t.id);
    setTemplateName(t.name);
    setTargetStatus(t.status_target || 'All');
    setMessageTemplate(t.message_template);
    setIsEditing(true);
  };

  const handleInsertKeyword = (keyword: string) => {
    setMessageTemplate(prev => prev + ' ' + keyword);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateName.trim() || !messageTemplate.trim()) {
      showToast('Please enter both template name and message template', 'error');
      return;
    }

    setIsSaving(true);
    const success = await supabaseService.saveOutreachTemplate({
      id: editingId || undefined,
      org_id: orgId,
      name: templateName.trim(),
      status_target: targetStatus,
      message_template: messageTemplate.trim(),
    });

    if (success) {
      showToast(`Template "${templateName}" saved successfully!`, 'success');
      setIsEditing(false);
      await loadTemplates();
    } else {
      showToast('Failed to save template in database', 'error');
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete template "${name}"?`)) {
      const success = await supabaseService.deleteOutreachTemplate(id);
      if (success) {
        showToast(`Template "${name}" deleted`, 'warning');
        await loadTemplates();
      } else {
        showToast('Failed to delete template', 'error');
      }
    }
  };

  const previewRendered = substituteKeywords(messageTemplate || 'Select or type a template...', SAMPLE_MEMBER);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            <span>WhatsApp Outreach Templates</span>
          </h2>
          <p className="text-xs text-slate-400">
            Manage dynamic message templates for chapter members with automated keyword substitution (e.g. {"{{name}}"}, {"{{score}}"})
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Template</span>
        </button>
      </div>

      {/* Editor App Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <GlassCard className="w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 border-t sm:border border-emerald-500/40 bg-slate-900/95 shadow-2xl rounded-t-3xl sm:rounded-3xl">
            {/* Mobile Drag Handle */}
            <div className="w-12 h-1.5 rounded-full bg-slate-700/60 mx-auto -mt-1 sm:hidden shrink-0" />
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <span>{editingId ? 'Edit Outreach Template' : 'Create New Outreach Template'}</span>
              </h3>
              <button
                onClick={() => setIsEditing(false)}
                className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-300">Template Title *</label>
                  <input
                    type="text"
                    required
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g. 🟢 Green Tier Leadership Celebration"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Target PALMS Tier *</label>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold text-white bg-slate-900"
                  >
                    <option value="All">🌐 All Tiers (General)</option>
                    <option value="Green">🟢 Green (70+ Score)</option>
                    <option value="Amber">🟡 Amber (50-69 Score)</option>
                    <option value="Red">🔴 Red (30-49 Score)</option>
                    <option value="Grey">⚪ Grey (&lt;30 Score)</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Keywords Buttons */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Insert Dynamic Member Keywords (Click to append):</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DYNAMIC_KEYWORDS.map(kw => (
                    <button
                      key={kw.key}
                      type="button"
                      onClick={() => handleInsertKeyword(kw.key)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[11px] font-mono font-bold border border-emerald-500/30 transition-all active:scale-95"
                    >
                      {kw.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template Text Editor */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Message Template Text *</label>
                <textarea
                  required
                  rows={4}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="Type your WhatsApp message template here..."
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-mono text-white leading-relaxed"
                />
              </div>

              {/* Live Sample Member Preview */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-2">
                <div className="text-[11px] font-extrabold uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Live Sample Member Preview (Substitution Test):</span>
                </div>
                <p className="text-xs text-slate-200 font-sans leading-relaxed whitespace-pre-wrap bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20">
                  {previewRendered}
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

      {/* Templates Skeletons / Cards List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <GlassCard key={i} className="p-6 space-y-4 animate-pulse border-white/10">
              <div className="flex justify-between items-center">
                <div className="h-5 bg-slate-800/80 rounded-md w-2/3" />
                <div className="h-4 bg-slate-800/50 rounded-full w-1/4" />
              </div>
              <div className="h-16 bg-slate-950/80 rounded-xl w-full" />
              <div className="h-14 bg-emerald-500/5 rounded-xl w-full" />
            </GlassCard>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => {
          const sampleText = substituteKeywords(t.message_template, SAMPLE_MEMBER);

          return (
            <GlassCard key={t.id} className="p-5 space-y-4 border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-black text-white">{t.name}</h3>
                      {t.is_default && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                          System Default
                        </span>
                      )}
                    </div>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      t.status_target === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      t.status_target === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      t.status_target === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      t.status_target === 'Grey' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30' :
                      'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                    }`}>
                      Target: {t.status_target} Tier
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleOpenEdit(t)}
                      className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                      title="Edit Template"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {!t.is_default && (
                      <button
                        onClick={() => handleDelete(t.id, t.name)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Template Code:</div>
                  <p className="text-xs font-mono text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-white/5 whitespace-pre-wrap leading-relaxed">
                    {t.message_template}
                  </p>
                </div>

                {/* <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase text-emerald-400">Sample Member Preview:</div>
                  <p className="text-xs font-sans text-slate-300 bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/20 whitespace-pre-wrap leading-relaxed">
                    {sampleText}
                  </p>
                </div> */}
              </div>

              {/* {onSelectTemplate && (
                <button
                  onClick={() => onSelectTemplate(t)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs border border-emerald-500/30 flex items-center justify-center space-x-1.5 transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Use This Template for Outreach</span>
                </button>
              )} */}
            </GlassCard>
          );
        })}
        </div>
      )}
    </div>
  );
};
