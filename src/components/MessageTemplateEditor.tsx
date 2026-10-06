import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Eye, RotateCcw, Wand2 } from 'lucide-react';
import type { Member } from '../types';
import {
  MAX_TEMPLATE_LENGTH,
  MESSAGE_TIERS,
  STARTER_TEMPLATES,
  TEMPLATE_PLACEHOLDER_GROUPS,
  buildMemberMessage,
  renderTemplateMessage,
  validateTemplate,
  type MessageTemplates,
  type MessageTier,
} from '../lib/outreachUtils';

interface MessageTemplateEditorProps {
  /**
   * The draft. A tier being PRESENT (even as an empty string) means "custom message on" -- that
   * lets someone switch it on and clear the box without silently flipping back to auto. Blank
   * entries are dropped when saved, so they fall back to the auto-built message.
   */
  templates: MessageTemplates;
  onChange: (next: MessageTemplates) => void;
  /** Real chapter members, used to render the live preview. */
  members: Member[];
  /** The signature as members will see it (already empty if the signature toggle is off). */
  signature: string;
  scoreTerm: string;
}

const TIER_META: Record<MessageTier, { emoji: string; active: string; dot: string }> = {
  Green: { emoji: '🟢', active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50', dot: 'bg-emerald-400' },
  Amber: { emoji: '🟡', active: 'bg-amber-500/20 text-amber-300 border-amber-500/50', dot: 'bg-amber-400' },
  Red: { emoji: '🔴', active: 'bg-rose-500/20 text-rose-300 border-rose-500/50', dot: 'bg-rose-400' },
  Grey: { emoji: '⚪', active: 'bg-slate-500/25 text-slate-200 border-slate-400/50', dot: 'bg-slate-400' },
};

const memberKey = (m: Member) => m.id ?? m.Name;
const tierOf = (m: Member): MessageTier => (m.trafficLight?.label ?? 'Grey') as MessageTier;

/** WhatsApp-style rendering of `*bold*` -- plain text nodes only, so no HTML injection surface. */
const renderWhatsAppText = (text: string): React.ReactNode[] =>
  text.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*[^*\n]+\*)/g).map((part, j) =>
        /^\*[^*\n]+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong> : <React.Fragment key={j}>{part}</React.Fragment>,
      )}
    </React.Fragment>
  ));

export const MessageTemplateEditor: React.FC<MessageTemplateEditorProps> = ({
  templates,
  onChange,
  members,
  signature,
  scoreTerm,
}) => {
  const [tier, setTier] = useState<MessageTier>('Green');
  const [previewKey, setPreviewKey] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const text = templates[tier];
  const isCustom = text !== undefined;
  const hasContent = Boolean(text && text.trim());
  const problems = useMemo(() => (text ? validateTemplate(text) : []), [text]);

  const setTierText = (value: string | undefined) => {
    const next = { ...templates };
    if (value === undefined) delete next[tier];
    else next[tier] = value;
    onChange(next);
  };

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const el = textareaRef.current;
    const current = text ?? '';
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (next.length > MAX_TEMPLATE_LENGTH) return;
    setTierText(next);
    // Put the caret right after the inserted token once React has re-rendered the new value.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Preview a member of the selected tier when there is one, so the sample matches what that
  // tier's recipients actually get; otherwise fall back to anyone so the editor is still useful.
  const tierMembers = useMemo(() => members.filter(m => tierOf(m) === tier), [members, tier]);
  const previewMember =
    tierMembers.find(m => memberKey(m) === previewKey) ?? tierMembers[0] ?? members[0] ?? null;

  const previewText = useMemo(() => {
    if (!previewMember) return null;
    const options = { signature, scoreTerm };
    // Render this tier's draft directly rather than via buildOutreachMessage: that picks the
    // template by the PREVIEWED MEMBER's tier, which would show the wrong tier's text whenever
    // no member of the selected tier exists and we've fallen back to someone else.
    return hasContent
      ? renderTemplateMessage(previewMember, text as string, options)
      : buildMemberMessage(previewMember, options);
  }, [previewMember, hasContent, text, signature, scoreTerm]);

  return (
    <div className="space-y-3.5">
      {/* Tier tabs */}
      <div className="flex flex-wrap gap-2">
        {MESSAGE_TIERS.map(t => {
          const meta = TIER_META[t];
          const selected = t === tier;
          const custom = Boolean(templates[t]?.trim());
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 ${
                selected ? meta.active : 'text-slate-400 border-white/10 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{meta.emoji}</span>
              <span>{t}</span>
              <span
                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                  custom ? 'bg-white/15 text-white' : 'bg-transparent text-slate-500'
                }`}
              >
                {custom ? 'Custom' : 'Auto'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom on/off for the selected tier */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/40 border border-white/5">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-200">Custom message for {tier} members</p>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isCustom
              ? 'Your wording is used for every member in this tier.'
              : 'Using the auto-built message: score, a step-by-step plan and a scoring snapshot.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isCustom}
          aria-label={`Custom message for ${tier} members`}
          onClick={() => setTierText(isCustom ? undefined : STARTER_TEMPLATES[tier])}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            isCustom ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-800'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              isCustom ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {isCustom && (
        <div className="space-y-3 animate-fadeIn">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-300">Message</label>
              <button
                type="button"
                onClick={() => setTierText(STARTER_TEMPLATES[tier])}
                className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset to starter</span>
              </button>
            </div>
            <textarea
              ref={textareaRef}
              rows={9}
              value={text}
              maxLength={MAX_TEMPLATE_LENGTH}
              onChange={e => setTierText(e.target.value)}
              placeholder={'Hi {{name}}! 👋\n\nYour score is *{{score}}/100*…'}
              spellCheck
              className="w-full px-4 py-3 rounded-xl glass-input text-xs font-medium text-white border-emerald-500/40 leading-relaxed resize-y whitespace-pre-wrap min-h-[160px] font-mono"
            />
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Use <span className="text-slate-300">*bold*</span> for WhatsApp bold. Tap a field below to insert it at the cursor.
              </p>
              <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                {(text ?? '').length}/{MAX_TEMPLATE_LENGTH}
              </span>
            </div>
          </div>

          {problems.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1" role="alert">
              <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Fix these before saving</span>
              </p>
              <ul className="text-[11px] text-rose-200 space-y-0.5 list-disc list-inside">
                {problems.map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {!hasContent && (
            <p className="text-[11px] text-amber-300/90">
              This is empty, so members in this tier will get the auto-built message.
            </p>
          )}

          {/* Placeholder chips */}
          <div className="space-y-2">
            {TEMPLATE_PLACEHOLDER_GROUPS.map(group => (
              <div key={group.title} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 w-full sm:w-28 shrink-0">
                  {group.title}
                </span>
                {group.items.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => insertPlaceholder(item.key)}
                    title={`{{${item.key}}}`}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 transition-all active:scale-95"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live preview */}
      <div className="space-y-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-black text-slate-300 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span>Live preview</span>
          </h4>
          {previewMember && tierMembers.length > 1 && (
            <select
              value={memberKey(previewMember)}
              onChange={e => setPreviewKey(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg glass-input text-[11px] font-bold text-slate-200 max-w-[60%]"
              aria-label="Preview as member"
            >
              {tierMembers.map(m => (
                <option key={memberKey(m)} value={memberKey(m)}>
                  {m.Name} — {m.score ?? 0}/100
                </option>
              ))}
            </select>
          )}
        </div>

        {!previewMember ? (
          <p className="text-[11px] text-slate-400 p-3 rounded-xl bg-slate-900/40 border border-white/5">
            Import a report to see a live preview with a real member's data.
          </p>
        ) : (
          <>
            {tierOf(previewMember) !== tier && (
              <p className="text-[11px] text-amber-300/90 flex items-start gap-1.5">
                <Wand2 className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  No {tier} members in your current data, so this previews with {previewMember.Name} (
                  {tierOf(previewMember)}). Their numbers will differ from a real {tier} member's.
                </span>
              </p>
            )}
            <div className="rounded-2xl p-3 sm:p-4 bg-[#0b141a] border border-white/10">
              <div className="max-w-md ml-auto rounded-xl rounded-tr-sm px-3 py-2 bg-[#005c4b] text-[#e9edef] text-[13px] leading-relaxed break-words shadow-md">
                {renderWhatsAppText(previewText ?? '')}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
