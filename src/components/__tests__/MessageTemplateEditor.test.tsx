import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageTemplateEditor } from '../MessageTemplateEditor';
import { scoreMember } from '../../lib/scoringEngine';
import { getFirstName, type MessageTemplates } from '../../lib/outreachUtils';
import type { Member } from '../../types';

// Server-render smoke tests: no DOM library is installed, so these cover every visible STATE of
// the editor (what renders, which warnings appear) rather than click interactions. The editor
// opens on the Green tab, so most cases are Green.

const green = scoreMember({ Name: 'Dr. Asha Mehta', P: 24, A: 0, CEU: 18, OneToOnes: 30, RGT: 40, V: 6, TYFCB: 1500000, Sponsors: 1 } as Member);
const amber = scoreMember({ Name: 'Sneha Kapoor', P: 22, A: 2, CEU: 12, OneToOnes: 22, RGT: 24, V: 4, TYFCB: 600000, Sponsors: 0 } as Member);

const render = (props: Partial<React.ComponentProps<typeof MessageTemplateEditor>> = {}) =>
  renderToStaticMarkup(
    <MessageTemplateEditor
      templates={{}}
      onChange={() => {}}
      members={[green, amber]}
      signature="Asha, Admin"
      scoreTerm="Go Green"
      {...props}
    />,
  );

describe('MessageTemplateEditor', () => {
  it('shows all four tiers, each marked Auto when nothing is customised', () => {
    const html = render();
    for (const tier of ['Green', 'Amber', 'Red', 'Grey']) expect(html).toContain(`<span>${tier}</span>`);
    expect(html.match(/>Auto</g)).toHaveLength(4);
    expect(html).not.toContain('>Custom<');
  });

  it('auto tier: previews the auto-built message for a member of that tier, with no editor box', () => {
    const html = render();
    expect(html).toContain('Using the auto-built message');
    expect(html).toContain(`Hi ${getFirstName(green.Name)}!`);
    expect(html).toContain('Go Green Score');
    expect(html).not.toContain('<textarea');
  });

  it('custom tier: shows the textarea, the Custom badge, and previews the custom wording', () => {
    const templates: MessageTemplates = { Green: 'GREEN-WORDING for {{name}}, score {{score}}' };
    const html = render({ templates });
    expect(html).toContain('<textarea');
    expect(html).toContain('>Custom<');
    expect(html).toContain(`GREEN-WORDING for ${getFirstName(green.Name)}, score ${green.score}`);
    // The signature and credit are still appended around custom wording.
    expect(html).toContain('Asha, Admin');
    expect(html).toContain('Made with 🧡 by Handysolver');
  });

  it('offers insert chips for every placeholder group once a tier is custom', () => {
    const html = render({ templates: { Green: 'x' } });
    for (const title of ['Member', 'Score', 'What to do next', 'By category', 'Closing']) {
      expect(html).toContain(title);
    }
    expect(html).toContain('title="{{name}}"');
    expect(html).toContain('title="{{nudges_list}}"');
  });

  it('flags a misspelled placeholder and still renders the preview without leaking it', () => {
    const html = render({ templates: { Green: 'Hi {{nmae}}' } });
    expect(html).toContain('Fix these before saving');
    expect(html).toContain('Unknown placeholder {{nmae}}');
    expect(html).toContain('role="alert"');
  });

  it('does not show the problems box for a valid template', () => {
    const html = render({ templates: { Green: 'Hi {{name}}' } });
    expect(html).not.toContain('Fix these before saving');
  });

  it('custom but empty: warns, and previews the auto-built message instead of a blank bubble', () => {
    const html = render({ templates: { Green: '' } });
    expect(html).toContain('<textarea');
    expect(html).toContain('members in this tier will get the auto-built message');
    expect(html).toContain('Go Green Score');
    // Nothing has been typed, so the tab is not claiming to be customised.
    expect(html).not.toContain('>Custom<');
  });

  it('with no members at all: explains the preview needs data rather than crashing', () => {
    const html = render({ members: [] });
    expect(html).toContain('Import a report to see a live preview');
  });

  it('with no member in the selected tier: says so and previews with someone else, with the right tier\'s wording', () => {
    const html = render({ members: [amber], templates: { Green: 'GREEN-ONLY {{name}}' } });
    expect(html).toContain('No Green members in your current data');
    expect(html).toContain(getFirstName(amber.Name));
    // Must show the GREEN draft even though the stand-in member is Amber.
    expect(html).toContain(`GREEN-ONLY ${getFirstName(amber.Name)}`);
  });

  it('escapes template text rather than injecting it as markup', () => {
    const html = render({ templates: { Green: '<img src=x onerror=alert(1)> {{name}}' } });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('renders WhatsApp *bold* as bold in the preview', () => {
    const html = render({ templates: { Green: 'Score: *{{score}}/100*' } });
    expect(html).toContain(`<strong>${green.score}/100</strong>`);
  });

  it('hides the signature from the preview when there is none (signature toggle off)', () => {
    const html = render({ templates: { Green: 'Hello' }, signature: '' });
    expect(html).not.toContain('Asha, Admin');
    expect(html).toContain('Made with 🧡 by Handysolver');
  });
});
