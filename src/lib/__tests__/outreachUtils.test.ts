import { describe, it, expect, afterEach } from 'vitest';
import {
  buildMemberMessage,
  buildOutreachMessage,
  renderTemplateMessage,
  validateTemplate,
  normalizeTemplates,
  buildActionPlanText,
  getFirstName,
  STARTER_TEMPLATES,
  TEMPLATE_PLACEHOLDER_GROUPS,
  MESSAGE_TIERS,
  MAX_TEMPLATE_LENGTH,
} from '../outreachUtils';
import { scoreMember, setScoringConfig, getScoringConfig } from '../scoringEngine';
import type { Member } from '../../types';

// Realistic raw rows -- everything else (score, tier, breakdown, nudges) is derived by the real
// scoring engine, so these exercise the same path production members take.
// One fixture per branch of the action-plan generator (scores/tiers noted are the defaults):
//   perfect    100 Green  -> "Perfect score" branch
//   greenOpts   89 Green  -> "You're in the Green! Keep improving with any of these"
//   amberOne    68 Amber  -> a single nudge covers the gap: "just do this"
//   amberAll    63 Amber  -> no single nudge covers it: "do all of these"
//   red         33 Red    -> "do all of these" toward Amber, with extra opportunities
//   grey         0 Grey   -> lowest tier
const raw = {
  perfect: { Name: 'Dr. Asha Mehta', Chapter: 'Influencers', P: 24, A: 0, S: 0, M: 0, CEU: 18, OneToOnes: 30, RGT: 40, V: 6, TYFCB: 1500000, Sponsors: 1 },
  greenOpts: { Name: 'Prof Vikram Rao', Chapter: 'Influencers', P: 24, A: 0, S: 0, M: 0, CEU: 18, OneToOnes: 30, RGT: 36, V: 4, TYFCB: 900000, Sponsors: 0 },
  amberOne: { Name: 'Sneha Kapoor', Chapter: 'Influencers', P: 22, A: 2, S: 0, M: 0, CEU: 12, OneToOnes: 22, RGT: 24, V: 4, TYFCB: 600000, Sponsors: 0 },
  amberAll: { Name: 'Imran Qureshi', Chapter: 'Influencers', P: 22, A: 2, S: 0, M: 0, CEU: 12, OneToOnes: 22, RGT: 24, V: 3, TYFCB: 600000, Sponsors: 0 },
  red: { Name: 'Rahul Singh Matharu', Chapter: 'Influencers', P: 18, A: 6, S: 0, M: 0, CEU: 6, OneToOnes: 10, RGT: 14, V: 2, TYFCB: 300000, Sponsors: 0 },
  grey: { Name: 'Neeraj', Chapter: 'Influencers', P: 6, A: 18, S: 0, M: 0, CEU: 0, OneToOnes: 1, RGT: 1, V: 0, TYFCB: 0, Sponsors: 0 },
} satisfies Record<string, Member>;

const members = Object.fromEntries(
  Object.entries(raw).map(([k, m]) => [k, scoreMember(m)]),
) as Record<keyof typeof raw, Member>;

describe('fixtures', () => {
  it('cover more than one traffic-light tier (guards against the fixtures drifting)', () => {
    const tiers = new Set(Object.values(members).map(m => m.trafficLight?.label));
    expect(tiers.size).toBeGreaterThanOrEqual(2);
  });
});

// Characterization tests: pin the auto-built message byte-for-byte so a refactor of the
// generator can be proven behaviour-preserving.
describe('buildMemberMessage (auto-built message)', () => {
  for (const key of Object.keys(members) as Array<keyof typeof members>) {
    it(`${key}: with signature and custom score term`, () => {
      expect(
        buildMemberMessage(members[key], { signature: 'Keep going!\nAsha, Admin', scoreTerm: 'Go Green' }),
      ).toMatchSnapshot();
    });

    it(`${key}: without signature`, () => {
      expect(buildMemberMessage(members[key], { signature: '' })).toMatchSnapshot();
    });
  }
});

// ─── Custom templates ────────────────────────────────────────────────────────────────────────

const tierOf = (m: Member) => m.trafficLight?.label;

afterEach(() => setScoringConfig({})); // back to defaults whatever a test changed

describe('validateTemplate', () => {
  it('accepts every catalogue placeholder, in any case and with inner spaces', () => {
    const all = TEMPLATE_PLACEHOLDER_GROUPS.flatMap(g => g.items.map(i => `{{${i.key}}}`)).join(' ');
    expect(validateTemplate(all)).toEqual([]);
    expect(validateTemplate('Hi {{Name}} and {{ score }}')).toEqual([]);
  });

  it('accepts plain text and the empty string', () => {
    expect(validateTemplate('')).toEqual([]);
    expect(validateTemplate('No placeholders here 👋')).toEqual([]);
  });

  it('flags a misspelled placeholder instead of letting it reach a member', () => {
    expect(validateTemplate('Hi {{nmae}}')).toEqual(['Unknown placeholder {{nmae}}']);
  });

  it('flags the legacy *_target keys, which are wrong for custom scoring', () => {
    expect(validateTemplate('{{ceu_target}}')).toEqual(['Unknown placeholder {{ceu_target}}']);
  });

  it('flags single-brace placeholders', () => {
    expect(validateTemplate('Hi {name}')).toEqual(['{name} needs double braces: {{name}}']);
  });

  it('flags stray double braces', () => {
    expect(validateTemplate('Hi {{name')).toEqual(['Stray "{{" or "}}" — a placeholder looks like {{name}}']);
    expect(validateTemplate('Hi name}}')).toHaveLength(1);
  });

  it('reports each unknown placeholder once', () => {
    expect(validateTemplate('{{x}} {{x}} {{y}}')).toEqual(['Unknown placeholder {{x}}', 'Unknown placeholder {{y}}']);
  });
});

describe('normalizeTemplates', () => {
  it('returns {} for anything that is not an object', () => {
    for (const bad of [null, undefined, 'x', 42, true]) expect(normalizeTemplates(bad)).toEqual({});
  });

  it('keeps known tiers with real text and drops everything else', () => {
    expect(
      normalizeTemplates({ Green: 'hi', Amber: '   ', Red: '', Grey: 5, Purple: 'nope', Blue: null }),
    ).toEqual({ Green: 'hi' });
  });

  it('caps length so a pasted wall of text cannot bloat the org row', () => {
    const out = normalizeTemplates({ Red: 'x'.repeat(MAX_TEMPLATE_LENGTH + 500) });
    expect(out.Red).toHaveLength(MAX_TEMPLATE_LENGTH);
  });
});

describe('renderTemplateMessage', () => {
  const m = members.amberOne;

  it('fills placeholders from the member', () => {
    const out = renderTemplateMessage(m, 'Hi {{name}}, you scored {{score}}/100 {{traffic_light}}');
    expect(out).toContain(`Hi ${getFirstName(m.Name)}, you scored ${m.score}/100 ${m.trafficLight?.emoji} ${tierOf(m)}`);
  });

  it('renders unknown placeholders as nothing rather than leaking them', () => {
    const out = renderTemplateMessage(m, 'Hi {{name}}{{nmae}}!');
    expect(out).toContain(`Hi ${getFirstName(m.Name)}!`);
    expect(out).not.toContain('{{');
  });

  it('uses the score label option, defaulting to "Go Green"', () => {
    expect(renderTemplateMessage(m, '{{score_term}}')).toContain('Go Green');
    expect(renderTemplateMessage(m, '{{score_term}}', { scoreTerm: 'Chapter Pulse' })).toContain('Chapter Pulse');
  });

  it('appends the signature when the template does not place it, then the credit line', () => {
    const out = renderTemplateMessage(m, 'Hello', { signature: 'Asha, Admin' });
    expect(out).toBe('Hello\n\nAsha, Admin\n\nMade with 🧡 by Handysolver');
  });

  it('does not duplicate the signature when the template places it with {{signature}}', () => {
    const out = renderTemplateMessage(m, 'Top\n\n{{signature}}\n\nBottom', { signature: 'Asha' });
    expect(out.match(/Asha/g)).toHaveLength(1);
    expect(out.indexOf('Asha')).toBeLessThan(out.indexOf('Bottom'));
  });

  it('omits the signature entirely when there is none (e.g. the toggle is off)', () => {
    expect(renderTemplateMessage(m, 'Hello', { signature: '' })).toBe('Hello\n\nMade with 🧡 by Handysolver');
  });

  it('inserts values literally -- no re-expansion of {{...}} and no $-pattern surprises', () => {
    const out = renderTemplateMessage(m, '{{signature}}', { signature: 'Pay $& {{score}} $1 $$' });
    expect(out).toContain('Pay $& {{score}} $1 $$');
  });

  it('collapses runs of blank lines (e.g. from an empty placeholder)', () => {
    const out = renderTemplateMessage(m, 'A\n\n\n\n{{nmae}}\n\n\nB');
    expect(out).not.toMatch(/\n{3,}/);
  });

  it('{{nudges_list}} is the same config-aware plan the auto-built message uses (modulo blank-line tidying)', () => {
    const tidy = (s: string) => s.replace(/\n{3,}/g, '\n\n');
    const out = renderTemplateMessage(m, '{{nudges_list}}');
    expect(out).toContain(tidy(buildActionPlanText(m).trim()));
  });

  it('{{nudges_list}} tracks a changed scoring config the way the auto-built message does', () => {
    const before = renderTemplateMessage(m, '{{nudges_list}}');
    // Raising the Green cutoff changes the gap, so a plan derived from the live config must change.
    setScoringConfig({ trafficLight: { ...getScoringConfig().trafficLight, green: getScoringConfig().trafficLight.green + 10 } });
    const after = renderTemplateMessage(scoreMember(raw.amberOne), '{{nudges_list}}');
    expect(after).not.toBe(before);
  });

  it("{{pts_to_green}} follows the chapter's own Green cutoff, not a hardcoded 70", () => {
    const greenCutoff = getScoringConfig().trafficLight.green;
    expect(renderTemplateMessage(m, '{{pts_to_green}}')).toContain(`${Math.max(0, greenCutoff - m.score!)}\n\n`);

    setScoringConfig({ trafficLight: { ...getScoringConfig().trafficLight, green: greenCutoff + 10 } });
    expect(renderTemplateMessage(m, '{{pts_to_green}}')).toContain(`${greenCutoff + 10 - m.score!}\n\n`);
  });

  it('{{pts_to_green}} is 0 for a member already in Green', () => {
    expect(renderTemplateMessage(members.perfect, '{{pts_to_green}}')).toMatch(/^0\n\n/);
  });

  it('resolves every catalogue placeholder to a real value for every fixture member', () => {
    const everything = TEMPLATE_PLACEHOLDER_GROUPS.flatMap(g => g.items.map(i => `${i.key}=({{${i.key}}})`)).join('\n');
    for (const member of Object.values(members)) {
      const out = renderTemplateMessage(member, everything, { signature: 'sig' });
      expect(out).not.toMatch(/\{\{|undefined|NaN/);
      // Nothing collapsed to an empty "()" -- every placeholder produced actual content.
      expect(out).not.toContain('=()');
    }
  });
});

describe('buildOutreachMessage', () => {
  const opts = { signature: 'sig', scoreTerm: 'Go Green' };

  it('falls back to the auto-built message when no template is set', () => {
    for (const member of Object.values(members)) {
      expect(buildOutreachMessage(member, opts)).toBe(buildMemberMessage(member, opts));
      expect(buildOutreachMessage(member, { ...opts, templates: {} })).toBe(buildMemberMessage(member, opts));
    }
  });

  it("uses the template for the member's own tier only", () => {
    const templates = { Amber: 'AMBER {{name}}' };
    const amber = members.amberOne;
    expect(tierOf(amber)).toBe('Amber');
    expect(buildOutreachMessage(amber, { ...opts, templates })).toContain(`AMBER ${getFirstName(amber.Name)}`);

    const grey = members.grey;
    expect(buildOutreachMessage(grey, { ...opts, templates })).toBe(buildMemberMessage(grey, opts));
  });

  it('treats a blank or whitespace-only template as unset', () => {
    const amber = members.amberOne;
    for (const blank of ['', '   ', '\n\n']) {
      expect(buildOutreachMessage(amber, { ...opts, templates: { Amber: blank } })).toBe(buildMemberMessage(amber, opts));
    }
  });
});

describe('STARTER_TEMPLATES', () => {
  it('cover every tier', () => {
    expect(Object.keys(STARTER_TEMPLATES).sort()).toEqual([...MESSAGE_TIERS].sort());
  });

  it('are valid, so the editor never offers a starter that fails its own validation', () => {
    for (const tier of MESSAGE_TIERS) expect(validateTemplate(STARTER_TEMPLATES[tier])).toEqual([]);
  });

  it('render cleanly for a member of their own tier', () => {
    for (const member of Object.values(members)) {
      const tier = tierOf(member) as keyof typeof STARTER_TEMPLATES;
      const out = renderTemplateMessage(member, STARTER_TEMPLATES[tier], { signature: 'sig' });
      expect(out).not.toMatch(/\{\{|undefined|NaN/);
      expect(out).toContain(getFirstName(member.Name));
    }
  });
});
