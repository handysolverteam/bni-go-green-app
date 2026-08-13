import React, { useState, useEffect } from 'react';
import { GlassCard } from './GlassCard';
import { OutreachTemplate } from '../types';
import { supabaseService, DEFAULT_OUTREACH_TEMPLATES } from '../services/supabaseService';
import { useToast } from '../context/ToastContext';
import { substituteKeywords } from '../lib/outreachUtils';
import {
  FileText, Plus, Edit, Trash2, Check, Sparkles, Tag, Eye, RefreshCw, Copy, Layers, Save
} from 'lucide-react';

interface TemplateManagerPageProps {
  orgId?: string;
  onSelectTemplate?: (template: OutreachTemplate) => void;
}

const DYNAMIC_KEYWORDS = [
  { label: 'Member Name', key: '{{name}}' },
  { label: 'PALMS Score', key: '{{score}}' },
  { label: 'Traffic Light Tier', key: '{{traffic_light}}' },
  { label: 'Points to Green', key: '{{pts_to_green}}' },
  { label: 'Action Steps Nudges', key: '{{nudges_list}}' },
  { label: 'Attendance Rate', key: '{{attendance_rate}}' },
  { label: 'Attendance Points', key: '{{attendance_pts}}' },
  { label: 'Attendance Target', key: '{{attendance_target}}' },
  { label: 'CEU Current', key: '{{ceu_current}}' },
  { label: 'CEU Points', key: '{{ceu_pts}}' },
  { label: 'CEU Target', key: '{{ceu_target}}' },
  { label: '1-2-1s Current', key: '{{one_to_ones_current}}' },
  { label: '1-2-1s Points', key: '{{one_to_ones_pts}}' },
  { label: '1-2-1s Target', key: '{{one_to_ones_target}}' },
  { label: 'Referrals Current', key: '{{referrals_current}}' },
  { label: 'Referrals Points', key: '{{referrals_pts}}' },
  { label: 'Referrals Target', key: '{{referrals_target}}' },
  { label: 'Visitors Current', key: '{{visitors_current}}' },
  { label: 'Visitors Points', key: '{{visitors_pts}}' },
  { label: 'Visitors Target', key: '{{visitors_target}}' },
  { label: 'TYFCB Current', key: '{{tyfcb_current}}' },
  { label: 'TYFCB Points', key: '{{tyfcb_pts}}' },
  { label: 'TYFCB Target', key: '{{tyfcb_target}}' },
  { label: 'Sponsors Current', key: '{{sponsors_current}}' },
  { label: 'Sponsors Points', key: '{{sponsors_pts}}' },
  { label: 'Sponsors Target', key: '{{sponsors_target}}' },
];

const SAMPLE_MEMBER = {
  name: 'Neraj K Anand',
  score: '78',
  traffic_light: 'Green',
  pts_to_green: '0',
  nudges_list: '1. - Maintain 100% Attendance Rate',
  attendance_rate: '100',
  attendance_pts: '10',
  attendance_target: 'max achieved',
  ceu_current: '0.85',
  ceu_pts: '5',
  ceu_target: 'next: 1.0 for 10 pts',
  one_to_ones_current: '2.50',
  one_to_ones_pts: '20',
  one_to_ones_target: 'max achieved',
  referrals_current: '1.40',
  referrals_pts: '25',
  referrals_target: 'max achieved',
  visitors_current: '5',
  visitors_pts: '25',
  visitors_target: 'max achieved',
  tyfcb_current: 'Rs 12,50,000',
  tyfcb_pts: '5',
  tyfcb_target: 'max achieved',
  sponsors_current: '2',
  sponsors_pts: '5',
  sponsors_target: 'max achieved',
  present: '12',
  absent: '1',
  referrals: '45',
  tyfcb: '₹12,50,000',
  one_to_ones: '8',
  ceu: '15',
  sponsors: '3',
  chapter: 'Influencers',
};

export const TemplateManagerPage: React.FC<TemplateManagerPageProps> = ({ orgId, onSelectTemplate }) => {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Editor & Card Expand states
  const [expandedTemplates, setExpandedTemplates] = useState<Record<string, boolean>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [targetStatus, setTargetStatus] = useState<'All' | 'Green' | 'Amber' | 'Red' | 'Grey'>('All');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedTemplates(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
    <div className="space-y-2 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-400" />
            <span>WhatsApp Templates</span>
          </h2>
        </div>

        <button
          onClick={handleOpenNew}
          className="w-full sm:w-auto px-5 py-3 sm:py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm sm:text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all min-h-[44px] sm:min-h-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Template</span>
        </button>
      </div>

      {isEditing && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setIsEditing(false); }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/25 backdrop-blur-md animate-fadeIn cursor-pointer"
        >
          <GlassCard className="w-full max-w-2xl max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 border-t sm:border border-emerald-500/40 bg-slate-900/95 shadow-2xl rounded-t-3xl sm:rounded-3xl cursor-default">
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
                  <label className="text-xs font-bold text-slate-300">Template Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Green Tier Leadership Nudge"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Target Score Tier</label>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-bold text-white bg-slate-900"
                  >
                    <option value="All">🌐 All Tiers</option>
                    <option value="Green">🟢 Green Tier</option>
                    <option value="Amber">🟡 Amber Tier</option>
                    <option value="Red">🔴 Red Tier</option>
                    <option value="Grey">⚪ Grey Tier</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Message Body Template *</label>
                  <span className="text-[10px] text-slate-400">Use dynamic keywords below</span>
                </div>
                <textarea
                  required
                  rows={6}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="Dear {{name}}, congratulations on your {{score}}/100 score in BNI {{chapter}}..."
                  className="w-full p-3.5 rounded-xl glass-input text-xs font-mono text-white leading-relaxed resize-y"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Available Dynamic Keywords (Click to Insert):</div>
                <div className="flex flex-wrap gap-1.5">
                  {['{{name}}', '{{score}}', '{{traffic_light}}', '{{present}}', '{{absent}}', '{{referrals}}', '{{tyfcb}}', '{{one_to_ones}}', '{{ceu}}', '{{sponsors}}', '{{chapter}}'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setMessageTemplate(prev => `${prev} ${tag}`)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-bold transition-all"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                <div className="text-[10px] font-extrabold uppercase text-emerald-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Live Rendered Sample Preview:</span>
                </div>
                <div className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed p-2.5 rounded-lg bg-slate-950/90 border border-white/5">
                  {previewRendered}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            </form>
          </GlassCard>
        </div>
      )}

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
            const isExpanded = Boolean(expandedTemplates[t.id]);
            const isLongText = t.message_template.length > 180 || t.message_template.split('\n').length > 5;
            const displayText = (!isExpanded && isLongText)
              ? t.message_template.slice(0, 180).trim() + '...'
              : t.message_template;

            return (
              <GlassCard key={t.id} className="p-5 space-y-4 border-white/10 hover:border-emerald-500/40 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="text-sm font-black text-white">{t.name}</h3>
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          t.status_target === 'Green' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          t.status_target === 'Amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          t.status_target === 'Red' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          t.status_target === 'Grey' ? 'bg-slate-500/20 text-slate-400 border border-slate-500/30' :
                          'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                        }`}>
                          Target: {t.status_target} Tier
                        </span>
                        {t.is_default && (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                            ⚡ System Default
                          </span>
                        )}
                      </div>
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

                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Raw Message Template:</div>
                      {isLongText && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(t.id)}
                          className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'Show Less' : 'Show More'}</span>
                          <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                        </button>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {displayText}
                    </p>
                    {isLongText && !isExpanded && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(t.id)}
                        className="text-[11px] font-bold text-emerald-400 hover:underline pt-1 block"
                      >
                        ... Show More
                      </button>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
