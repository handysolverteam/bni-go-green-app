import React, { useState } from 'react';
import { Organization } from '../types';
import { Copy, Check, Share2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { getWhatsAppUrl } from '../lib/whatsappUtils';

interface OrgShareWidgetProps {
  org: Organization | null;
  className?: string;
  defaultCountryCode?: string;
}

export const OrgShareWidget: React.FC<OrgShareWidgetProps> = ({
  org,
  className = '',
  defaultCountryCode = '+91'
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!org?.code) return null;

  const orgName = org.name || 'our chapter';
  const joinUrl = `https://www.handychapter.com/?join=${encodeURIComponent(org.code)}`;
  // Body WITHOUT the link. navigator.share() appends `url` itself, so putting the link in
  // `text` as well made most share targets (WhatsApp included) render it twice.
  const inviteBody = `🤝 *Join ${orgName} on HandyChapter!*

Connect with our chapter to view performance reports, scores, and outreach tracking.

Organization Join Code: ${org.code}

Tap the link below to automatically join:`;

  // The WhatsApp deep link takes a single text blob, so that path carries the link inline.
  const inviteMsg = `${inviteBody}
${joinUrl}`;

  const handleCopyLinkWithCode = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    showToast('Chapter invite link copied to clipboard!', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const openWhatsAppFallback = () => {
    const url = getWhatsAppUrl('', inviteMsg, defaultCountryCode);
    window.open(url, '_blank');
    showToast('Sharing invite link!', 'info');
  };

  const handleShareWhatsApp = () => {
    if (!navigator.share) {
      openWhatsAppFallback();
      return;
    }

    navigator.share({
      title: `Join ${orgName} on HandyChapter`,
      text: inviteBody,
      url: joinUrl,
    })
      .then(() => showToast('Sharing invite link!', 'info'))
      .catch((err) => {
        // Dismissing the native share sheet rejects with AbortError — that is the user
        // declining to share, not a failure, so do not force WhatsApp open behind them.
        if (err?.name === 'AbortError') return;
        openWhatsAppFallback();
      });
  };

  return (
    <div className={`p-3 sm:p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 flex items-center justify-between space-x-4 shrink-0 shadow-inner ${className}`}>
      <div>
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
          Chapter Invite Code
        </span>
        <span className="font-mono text-xl sm:text-2xl font-black text-emerald-400 tracking-widest">
          {org.code}
        </span>
      </div>
      <div className="flex items-center space-x-1.5 shrink-0">
        <button
          type="button"
          onClick={handleCopyLinkWithCode}
          className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-all shrink-0 active:scale-95 flex items-center justify-center cursor-pointer"
          title="Copy Invite Link with Code"
        >
          {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition-all shrink-0 active:scale-95 flex items-center justify-center shadow-md shadow-emerald-500/20 cursor-pointer"
          title="Share Invite Code via WhatsApp"
        >
          <Share2 className="w-5 h-5 text-slate-950" />
        </button>
      </div>
    </div>
  );
};
