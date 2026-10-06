import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatMessageBody } from '../ChatMessageBody';

const render = (text: string) => renderToStaticMarkup(<ChatMessageBody text={text} />);

describe('ChatMessageBody', () => {
  const reply = [
    '📇 *Top-Scoring 2 Members — Contact Details (Influencers)*',
    '',
    '1. *Asha Mehta* — 🟢 90/100 pts',
    '   ✉️ asha@x.com',
    '   📱 +91 98765 43210',
    '',
    '• *Average:* 60.8',
    '❓ *Would you like me to draft a message?*',
  ].join('\n');

  it('styles title, numbered rows, details, bullets and the follow-up separately', () => {
    const html = render(reply);
    for (const part of ['heading', 'numbered', 'detail', 'bullet', 'followup']) {
      expect(html).toContain(`data-chat-part="${part}"`);
    }
  });

  it('turns emails and phone numbers into links', () => {
    const html = render(reply);
    expect(html).toContain('href="mailto:asha@x.com"');
    expect(html).toContain('href="tel:+919876543210"');
  });

  it('renders *bold* and never injects markup', () => {
    const html = render('*Title*\n<img src=x onerror=alert(1)> *b*');
    expect(html).toContain('<strong');
    expect(html).not.toContain('<img');
  });

  it('does not treat short numbers like scores as phones', () => {
    expect(render('Title\nScore 60.8 / 100 pts')).not.toContain('tel:');
  });
});
