import React from 'react';

// Renders Chapter AI replies. The engines emit WhatsApp-style text (*bold*, "1. " lists, "• " bullets,
// a closing "❓ ..." question), so this turns that structure into headings, rows and a follow-up
// callout instead of one wall of text. Emails and phone numbers become tap-to-use links.

const INLINE = /(\*[^*\n]+\*|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+?\d[\d\s-]{8,}\d)/g;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE = /^\+?\d[\d\s-]{8,}\d$/;

const renderInline = (text: string): React.ReactNode[] =>
  text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i} className="font-extrabold">{part.slice(1, -1)}</strong>;
    }
    if (EMAIL.test(part)) {
      return <a key={i} href={`mailto:${part}`} className="underline decoration-dotted underline-offset-2 hover:text-emerald-400 break-all">{part}</a>;
    }
    if (PHONE.test(part)) {
      return <a key={i} href={`tel:${part.replace(/[\s-]/g, '')}`} className="underline decoration-dotted underline-offset-2 hover:text-emerald-400 whitespace-nowrap">{part}</a>;
    }
    return part;
  });

export const ChatMessageBody: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  let headingDone = false;

  return (
    <div className="font-sans leading-relaxed space-y-1">
      {lines.map((raw, i) => {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) return <div key={i} className="h-1.5" aria-hidden="true" />;

        // Closing question -> highlighted follow-up prompt.
        if (line.trimStart().startsWith('❓')) {
          return (
            <div key={i} className="mt-2 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[0.95em] font-semibold" data-chat-part="followup">
              {renderInline(line.trim())}
            </div>
          );
        }

        // First line of the reply is its title.
        if (!headingDone) {
          headingDone = true;
          return (
            <div key={i} className="text-sm sm:text-base font-black pb-1.5 mb-1 border-b border-white/10" data-chat-part="heading">
              {renderInline(line.trim())}
            </div>
          );
        }

        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (numbered) {
          return (
            <div key={i} className="flex items-start gap-2.5 pt-1" data-chat-part="numbered">
              <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center">{numbered[1]}</span>
              <span className="flex-1 min-w-0">{renderInline(numbered[2])}</span>
            </div>
          );
        }

        const bullet = line.match(/^\s*[•-]\s+(.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1" data-chat-part="bullet">
              <span className="mt-[0.45em] w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-400/70" />
              <span className="flex-1 min-w-0">{renderInline(bullet[1])}</span>
            </div>
          );
        }

        // Indented detail lines (e.g. an email/phone under a numbered member).
        if (/^\s{2,}\S/.test(raw)) {
          return <div key={i} className="pl-[30px] text-[0.95em] opacity-90" data-chat-part="detail">{renderInline(line.trim())}</div>;
        }

        return <div key={i} data-chat-part="text">{renderInline(line)}</div>;
      })}
    </div>
  );
};
