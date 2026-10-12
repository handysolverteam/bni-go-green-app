import { describe, it, expect } from 'vitest';
import { analyzeLocalChapterQuery } from '../localAiEngine';
import type { Member } from '../../types';

// Regression cover for 2026-10-10: "give me top three user" matched no branch and fell through
// to the generic chapter overview instead of ranking anyone.
const mk = (
  Name: string,
  score: number,
  extra: Record<string, unknown> = {},
  label = 'Green',
) => ({ Name, score, trafficLight: { label }, ...extra }) as unknown as Member;

const members = [
  mk('Asha Mehta', 90, { OneToOnes: 2, TYFCB: 1000, ReferralsGivenRate: 1 }),
  mk('Asha Mehta', 90, { OneToOnes: 2, TYFCB: 1000, ReferralsGivenRate: 1 }), // same person, 2nd report
  mk('Bala Rao', 80, { OneToOnes: 9, TYFCB: 500, ReferralsGivenRate: 7 }),
  mk('Chitra Nair', 70, { OneToOnes: 4, TYFCB: 250, ReferralsGivenRate: 3 }, 'Amber'),
  mk('Dev Shah', 20, { OneToOnes: 1, TYFCB: 10, ReferralsGivenRate: 0 }, 'Red'),
];

const snapshot = { organization: { name: 'Influencers' } as any, members, importLogs: [], templates: [] };
const ask = (q: string, canSeeContactDetails = true) =>
  analyzeLocalChapterQuery(q, snapshot, null, [], { canSeeContactDetails, roleLabel: 'Admin' });

describe('local AI: ranked leaderboards', () => {
  it('answers "give me top three user" with an actual ranking, not the generic overview', () => {
    const r = ask('give me top three user');
    expect(r).toContain('Asha Mehta');
    expect(r).toContain('Bala Rao');
    expect(r).toContain('Chitra Nair');
    expect(r).not.toContain('Dev Shah');
    expect(r).not.toContain('What would you like me to analyze'); // the old fallback menu
  });

  it('lists each person once even when they appear in several reports', () => {
    const r = ask('top 3 members');
    expect(r.match(/Asha Mehta/g)).toHaveLength(1);
  });

  it('ranks by a named metric instead of score', () => {
    const r = ask('top 2 members by 1-to-1s');
    const bala = r.indexOf('Bala Rao');
    const chitra = r.indexOf('Chitra Nair');
    expect(bala).toBeGreaterThan(-1);
    expect(chitra).toBeGreaterThan(-1);
    expect(bala).toBeLessThan(chitra); // Bala has 9, Chitra 4
    expect(r).not.toContain('Asha Mehta'); // only 2 asked for; Asha has just 2
  });

  it('supports bottom/worst ordering', () => {
    const r = ask('bottom 2 members');
    expect(r).toContain('Dev Shah');
    expect(r).not.toContain('Asha Mehta');
  });

  it('filters by zone when asked', () => {
    const r = ask('top 5 red zone members');
    expect(r).toContain('Dev Shah');
    expect(r).not.toContain('Bala Rao');
  });

  it('refuses per-member TYFCB ranking for restricted roles', () => {
    expect(ask('top 3 members by tyfcb', false)).toContain('Admins');
    expect(ask('top 3 members by tyfcb', true)).toContain('Asha Mehta');
  });

  it('does not hijack template requests that happen to say "top"', () => {
    const r = ask('create a whatsapp template for the top member');
    expect(r).not.toContain('🏆');
  });
});
