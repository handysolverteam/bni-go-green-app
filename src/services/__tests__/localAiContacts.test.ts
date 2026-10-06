import { describe, it, expect } from 'vitest';
import { analyzeLocalChapterQuery } from '../localAiEngine';
import type { Member } from '../../types';

const mk = (Name: string, score: number, Phone: string, Email: string, label = 'Green') =>
  ({ Name, score, Phone, Email, trafficLight: { label } }) as unknown as Member;

const members = [
  mk('Asha Mehta', 90, '+911111111111', 'asha@x.com'),
  mk('Asha Mehta', 90, '+911111111111', 'asha@x.com'), // same person, second report
  mk('Bala Rao', 80, '+912222222222', 'bala@x.com'),
  mk('Chitra Nair', 70, '+913333333333', 'chitra@x.com', 'Amber'),
  mk('Dev Shah', 20, '+914444444444', 'dev@x.com', 'Red'),
];
const snapshot = { organization: { name: 'Influencers' } as any, members, importLogs: [], templates: [] };
const ask = (q: string, canSeeContactDetails = true) =>
  analyzeLocalChapterQuery(q, snapshot, null, [], { canSeeContactDetails, roleLabel: 'Admin' });

describe('local AI: ranked contact lists', () => {
  it('answers "top three users email and phone" with the three best, once each', () => {
    const r = ask("give me top three users' email address and phone numbers");
    expect(r).toContain('asha@x.com');
    expect(r).toContain('+912222222222');
    expect(r).toContain('chitra@x.com');
    expect(r).not.toContain('dev@x.com');
    expect(r.match(/Asha Mehta/g)).toHaveLength(1);
  });

  it('honours bottom/lowest and numeric counts', () => {
    const r = ask('lowest 1 member phone number');
    expect(r).toContain('Dev Shah');
    expect(r).not.toContain('Asha');
    expect(r).not.toContain('dev@x.com'); // email not asked for
  });

  it('filters by zone', () => {
    const r = ask('red zone members email');
    expect(r).toContain('dev@x.com');
    expect(r).not.toContain('bala@x.com');
  });

  it('still refuses for members without contact access', () => {
    expect(ask("top three users' email", false)).toContain('Admins');
  });
});
