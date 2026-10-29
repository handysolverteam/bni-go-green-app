import { describe, expect, it } from 'vitest';
import { buildTrafficRows, firstLastKey, makeResolver, nameKey, sortTrafficRows } from '../calc';
import { exportCsv, exportLines } from '../export';
import { chapterMatches, detectReportKind, prepareTrafficReport } from '../import';
import { attendancePoints, lightFor, MAX_POINTS, pointsFor } from '../score';
import type { PalmsWeekRecord, SponsorWeekRecord } from '../types';
import { findConflict, meetingDateOf, rollingWindow, spanDays, validateWeekRange } from '../weeks';
import { ALL_WEEKS, buildTrafficView, CUSTOM_RANGE, LAST_6_MONTHS, listWeeks } from '../window';

// ---------------------------------------------------------------------------------------------------------------------
// scoring tiers (BNI's 100-point rules)
// ---------------------------------------------------------------------------------------------------------------------
describe('scoring tiers', () => {
  it('attendance: <88% 0, 88% 5, 96% 10, on the whole percent rounded half-down', () => {
    expect(pointsFor('attendance', 0.879)).toBe(0);
    expect(pointsFor('attendance', 0.88)).toBe(5);
    expect(pointsFor('attendance', 0.96)).toBe(10);
    expect(attendancePoints(22 / 23)).toBe(10); // 95.65% -> 96%
    expect(attendancePoints(14 / 16)).toBe(0); // 87.5% -> 87%
    expect(attendancePoints(25 / 27)).toBe(5);
  });

  it('CEU, 121, referrals, TYFCB, visitors and sponsors tiers', () => {
    expect(pointsFor('ceu', 0)).toBe(0);
    expect(pointsFor('ceu', 0.0741)).toBe(5);
    expect(pointsFor('ceu', 0.5556)).toBe(10);
    expect(pointsFor('oneToOne', 0.25)).toBe(5);
    expect(pointsFor('oneToOne', 1)).toBe(20);
    expect(pointsFor('referrals', 1.25)).toBe(25);
    expect(pointsFor('tyfcb', 84999)).toBe(1);
    expect(pointsFor('tyfcb', 1250000)).toBe(5);
    expect(pointsFor('visitors', 4)).toBe(20);
    expect(pointsFor('visitors', 9)).toBe(25);
    expect(pointsFor('sponsors', 2)).toBe(5);
  });

  it('maximum points add up to 100 and colours switch at 70 / 50 / 30', () => {
    expect(Object.values(MAX_POINTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect([100, 70, 69, 50, 49, 30, 29].map(lightFor)).toEqual(['green', 'green', 'amber', 'amber', 'red', 'red', 'grey']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// weeks + windows
// ---------------------------------------------------------------------------------------------------------------------
describe('week helpers', () => {
  it('counts days inclusively and finds the Wednesday of a weekly range', () => {
    expect(spanDays('2026-10-08', '2026-10-14')).toBe(7);
    expect(spanDays('2026-10-14', '2026-10-14')).toBe(1);
    expect(spanDays('2026-10-14', '2026-10-08')).toBe(0);
    expect(meetingDateOf('2026-10-08', '2026-10-14')).toBe('2026-10-14'); // Wed 14 Oct
    expect(meetingDateOf('2026-10-07', '2026-10-13')).toBe('2026-10-07'); // Wed 7 Oct
    expect(meetingDateOf('2026-10-07', '2026-10-14')).toBe('2026-10-14'); // two Wednesdays -> the end
  });

  it('accepts one week and refuses a long range with a clear message', () => {
    expect(validateWeekRange('2026-10-08', '2026-10-14')).toBeNull();
    expect(validateWeekRange('2026-03-31', '2026-10-14')).toMatch(/one week per import/);
    expect(validateWeekRange(null, '2026-10-14')).toMatch(/From:\/To:/);
  });

  it('finds an overlapping week that is not the same week', () => {
    const existing = [{ from: '2026-10-01', to: '2026-10-07' }];
    expect(findConflict(existing, { from: '2026-10-01', to: '2026-10-07' })).toBeNull(); // same week = replace
    expect(findConflict(existing, { from: '2026-10-05', to: '2026-10-11' })).toEqual(existing[0]);
    expect(findConflict(existing, { from: '2026-10-08', to: '2026-10-14' })).toBeNull();
  });

  it('last 6 months: day after the same date 6 months earlier (BNI: 31 Mar – 30 Sep, 8 Apr – 7 Oct)', () => {
    expect(rollingWindow('2026-09-30')).toEqual({ from: '2026-03-31', to: '2026-09-30' });
    expect(rollingWindow('2026-10-07')).toEqual({ from: '2026-04-08', to: '2026-10-07' });
    expect(rollingWindow('2026-08-31')).toEqual({ from: '2026-03-01', to: '2026-08-31' });
    expect(rollingWindow('nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------------------------------------------------
describe('names', () => {
  it('firstLastKey drops the middle initial; the resolver never merges namesakes', () => {
    expect(firstLastKey('Ranjan K Sapra')).toBe(firstLastKey('Ranjan  Sapra'));
    expect(nameKey('  Neha   Goel ')).toBe('neha goel');
    const resolve = makeResolver(['Ranjan K Sapra', 'Amit Gupta', 'Amit K Gupta']);
    expect(resolve('ranjan  sapra')).toBe('ranjan k sapra');
    expect(resolve('Amit Gupta')).toBe('amit gupta');
    expect(resolve('Amit R Gupta')).toBeNull();
    expect(resolve('Nobody Here')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// scoring a window from weekly lines
// ---------------------------------------------------------------------------------------------------------------------
const palmsLine = (o: Partial<PalmsWeekRecord> & { meetingDate: string }): PalmsWeekRecord => ({
  weekFrom: o.meetingDate,
  weekTo: o.meetingDate,
  memberName: 'Amit Gupta',
  p: 0, a: 0, l: 0, m: 0, s: 0, rgi: 0, rgo: 0, rri: 0, rro: 0, visitors: 0, oneToOnes: 0, tyfcb: 0, ceu: 0, t: 0,
  ...o,
});
const sponsorLine = (o: Partial<SponsorWeekRecord> & { meetingDate: string }): SponsorWeekRecord => ({
  weekFrom: o.meetingDate,
  weekTo: o.meetingDate,
  sponsor: 'Pranati Bajaj',
  sponsored: 'Dheeraj Parcha',
  sponsoredChapter: 'Alchemist',
  applicationDate: o.meetingDate,
  ...o,
});

describe('buildTrafficRows', () => {
  const window = { from: '2026-03-31', to: '2026-10-14' };

  it('adds the weekly lines: weeks = P+A+L+M+S, attendance = (weeks − A)/weeks, rates per week', () => {
    // Garima Agarwal in BNI's 14 Oct 2026 report: P24 A2 L0 M2 S1 (29 weeks), RGI12 RGO7, V4, 1-2-1 25, TYFCB 181650, CEU 15.
    // Split over three weekly reports that add up to the same totals.
    const lines = [
      palmsLine({ memberName: 'Garima Agarwal', meetingDate: '2026-04-01', p: 10, a: 1, m: 1, rgi: 5, rgo: 3, visitors: 2, oneToOnes: 10, tyfcb: 100000, ceu: 6 }),
      palmsLine({ memberName: 'Garima Agarwal', meetingDate: '2026-04-08', p: 10, a: 1, m: 1, s: 1, rgi: 5, rgo: 2, visitors: 1, oneToOnes: 8, tyfcb: 50000, ceu: 5 }),
      palmsLine({ memberName: 'Garima Agarwal', meetingDate: '2026-04-15', p: 4, rgi: 2, rgo: 2, visitors: 1, oneToOnes: 7, tyfcb: 31650, ceu: 4 }),
    ];
    const [g] = buildTrafficRows({ palms: lines, sponsors: [], window, meetings: 3 });
    expect(g.weeks).toBe(29);
    expect(g.attendance.rate).toBeCloseTo(27 / 29, 12);
    expect(g.attendance.score).toBe(5);
    expect(g.ceu.rate).toBeCloseTo(15 / 29, 12);
    expect(g.ceu.score).toBe(10);
    expect(g.oneToOne.score).toBe(15);
    expect(g.referrals.rate).toBeCloseTo(19 / 29, 12);
    expect(g.referrals.score).toBe(10);
    expect(g.tyfcb.amount).toBe(181650);
    expect(g.tyfcb.score).toBe(2);
    expect(g.visitors.count).toBe(4);
    expect(g.visitors.score).toBe(20);
    expect(g.total).toBe(5 + 10 + 15 + 10 + 2 + 20 + 0);
    expect(g.color).toBe('amber');
  });

  it('sponsors: counted once even when two weekly reports list it, matched by first + last name, window-limited', () => {
    const palms = [
      palmsLine({ memberName: 'Pranati Bajaj', meetingDate: '2026-07-08', p: 1 }),
      palmsLine({ memberName: 'Ranjan K Sapra', meetingDate: '2026-07-08', p: 1 }),
      palmsLine({ memberName: 'Komal Gupta', meetingDate: '2026-07-08', p: 1 }),
    ];
    const sponsors = [
      sponsorLine({ meetingDate: '2026-07-08', applicationDate: '2026-07-07' }),
      sponsorLine({ meetingDate: '2026-07-15', applicationDate: '2026-07-07' }), // same sponsorship in the next weekly file
      sponsorLine({ meetingDate: '2026-07-08', sponsor: 'Ranjan Sapra', sponsored: 'Yoginder Kalra', sponsoredChapter: 'Influencers', applicationDate: '2026-05-20' }),
      sponsorLine({ meetingDate: '2026-07-08', sponsor: 'Komal Gupta', sponsored: 'Old Application', applicationDate: '2026-01-02' }), // before the window
      sponsorLine({ meetingDate: '2026-07-08', sponsor: 'BNI Website', sponsored: 'Annie Jain', applicationDate: '2026-07-01' }), // not a member
      sponsorLine({ meetingDate: '2026-07-08', sponsor: '', sponsored: '', applicationDate: null }), // "nobody sponsored" marker
    ];
    const rows = buildTrafficRows({ palms, sponsors, window, meetings: 1 });
    const by = (n: string) => rows.find((r) => r.name === n)!.sponsors;
    expect(by('Pranati Bajaj')).toEqual({ count: 1, score: 5 });
    expect(by('Ranjan K Sapra')).toEqual({ count: 1, score: 5 });
    expect(by('Komal Gupta')).toEqual({ count: 0, score: 0 });
  });

  it('no letters at all: weeks fall back to the imported meetings, attendance 0 and a note', () => {
    const [r] = buildTrafficRows({ palms: [palmsLine({ memberName: 'Neha Goel', meetingDate: '2026-04-01', oneToOnes: 2 })], sponsors: [], window, meetings: 2 });
    expect(r.weeks).toBe(2);
    expect(r.attendance).toEqual({ rate: null, score: 0 });
    expect(r.oneToOne.rate).toBe(1);
    expect(r.notes.join(' ')).toMatch(/no attendance letters/);
  });

  it('joined part-way: fewer lettered weeks than the window are divided by their own count and noted', () => {
    const [r] = buildTrafficRows({ palms: [palmsLine({ meetingDate: '2026-04-01', p: 12 })], sponsors: [], window, meetings: 27 });
    expect(r.weeks).toBe(12);
    expect(r.attendance.rate).toBe(1);
    expect(r.notes.join(' ')).toMatch(/12 lettered weeks of 27/);
  });

  it('leave, medical and substitute all count as attended; highest total first', () => {
    const rows = sortTrafficRows(
      buildTrafficRows({
        palms: [
          palmsLine({ memberName: 'B Low', meetingDate: '2026-04-01', p: 20, a: 1, l: 1, m: 2, s: 2 }),
          palmsLine({ memberName: 'A High', meetingDate: '2026-04-01', p: 26, visitors: 6, oneToOnes: 40, rgi: 40, tyfcb: 2000000, ceu: 30 }),
        ],
        sponsors: [],
        window,
        meetings: 26,
      }),
    );
    expect(rows.map((r) => r.name)).toEqual(['A High', 'B Low']);
    expect(rows[1].attendance.rate).toBeCloseTo(25 / 26, 12);
    expect(rows[1].attendance.score).toBe(10);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// the screen's window selection
// ---------------------------------------------------------------------------------------------------------------------
describe('buildTrafficView', () => {
  // Weekly Wednesday reports from 1 Apr to 14 Oct 2026 (29 weeks); one member who is present every week.
  const wednesdays: string[] = [];
  for (let t = Date.UTC(2026, 3, 1); t <= Date.UTC(2026, 9, 14); t += 7 * 86400000) wednesdays.push(new Date(t).toISOString().slice(0, 10));
  const palms = wednesdays.map((d) => palmsLine({ meetingDate: d, p: 1, oneToOnes: 1, visitors: 1 }));
  const sponsors = wednesdays.map((d) => sponsorLine({ meetingDate: d, sponsor: 'Amit Gupta', sponsored: `Person ${d}`, applicationDate: d }));

  it('lists every imported week, oldest first, with what was imported for it', () => {
    const weeks = listWeeks(palms, sponsors);
    expect(weeks).toHaveLength(29);
    expect(weeks[0]).toMatchObject({ meetingDate: '2026-04-01', hasPalms: true, members: 1, hasSponsorReport: true, sponsored: 1 });
  });

  it('one row per MEETING DATE: PALMS for 28 – 28 Oct and Sponsor for 22 – 28 Oct are the same meeting', () => {
    const p = [palmsLine({ meetingDate: '2026-10-28', weekFrom: '2026-10-28', weekTo: '2026-10-28', p: 1 })];
    const s = [sponsorLine({ meetingDate: '2026-10-28', weekFrom: '2026-10-22', weekTo: '2026-10-28', sponsor: '', sponsored: '', sponsoredChapter: null, applicationDate: null })];
    const weeks = listWeeks(p, s);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      meetingDate: '2026-10-28',
      hasPalms: true,
      palmsFrom: '2026-10-28',
      palmsTo: '2026-10-28',
      hasSponsorReport: true,
      sponsorFrom: '2026-10-22',
      sponsorTo: '2026-10-28',
      weekFrom: '2026-10-22',
      weekTo: '2026-10-28',
    });
    // The Sponsor report covers that meeting, so the screen does not warn that it is missing.
    expect(buildTrafficView({ palms: p, sponsors: s }).sponsorWeeksMissing).toBe(0);
    // Only the PALMS report imported -> the warning stays.
    expect(buildTrafficView({ palms: p, sponsors: [] }).sponsorWeeksMissing).toBe(1);
  });

  it('default = last 6 months anchored on the newest week (15 Apr – 14 Oct = 27 weeks), with BNI-style rates', () => {
    const v = buildTrafficView({ palms, sponsors });
    expect(v.choice).toBe(LAST_6_MONTHS);
    expect(v.from).toBe('2026-04-15');
    expect(v.to).toBe('2026-10-14');
    expect(v.meetings).toBe(27);
    expect(v.rows[0].weeks).toBe(27);
    expect(v.rows[0].visitors.count).toBe(27);
    expect(v.rows[0].sponsors.count).toBe(27);
    expect(v.options[0].label).toBe('Last 6 months (27 weeks)');
    expect(v.sponsorWeeksMissing).toBe(0);
  });

  it('all weeks, one week and a custom range', () => {
    expect(buildTrafficView({ palms, sponsors, choice: ALL_WEEKS }).meetings).toBe(29);
    const one = buildTrafficView({ palms, sponsors, choice: 'week:2026-09-02' });
    expect(one.meetings).toBe(1);
    expect(one.rows[0].visitors.count).toBe(1);
    const custom = buildTrafficView({ palms, sponsors, choice: CUSTOM_RANGE, custom: { from: '2026-06-01', to: '2026-06-30' } });
    expect(custom.meetings).toBe(4); // Wednesdays 3, 10, 17 and 24 June
  });

  it('an unknown choice falls back to the last 6 months; nothing imported is empty', () => {
    expect(buildTrafficView({ palms, sponsors, choice: 'week:2099-01-01' }).choice).toBe(LAST_6_MONTHS);
    const none = buildTrafficView({ palms: [], sponsors: [] });
    expect(none.empty).toBe(true);
    expect(none.rows).toEqual([]);
  });

  it('flags the weeks of the window that have no Sponsor Report', () => {
    const v = buildTrafficView({ palms, sponsors: sponsors.slice(0, 20) });
    expect(v.sponsorWeeksMissing).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// importing the two BNI .xls (SpreadsheetML) files
// ---------------------------------------------------------------------------------------------------------------------
type Cell = string | number;
// A row of BNI's parameter block: the label in column 1 and the value far to the right (ss:Index), like the real files.
const raw = (label: string, value: string): string =>
  `<Row><Cell><Data ss:Type="String">${label}</Data></Cell><Cell ss:Index="11"><Data ss:Type="String">${value}</Data></Cell></Row>`;
const sheet = (rows: (Cell[] | string)[]): string =>
  '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
  '<Worksheet ss:Name="Report"><Table>' +
  rows.map((r) => (typeof r === 'string' ? r : `<Row>${r.map((c) => `<Cell><Data ss:Type="${typeof c === 'number' ? 'Number' : 'String'}">${c}</Data></Cell>`).join('')}</Row>`)).join('') +
  '</Table></Worksheet></Workbook>';
const params = (chapter: string, from: string, to: string): (Cell[] | string)[] => [
  ['Parameters'],
  raw('Chapter:', chapter),
  raw('From:', `${from}T00:00:00.000`),
  raw('To:', `${to}T00:00:00.000`),
];
const palmsFile = (chapter: string, from: string, to: string): string =>
  sheet([
    ['Chapter ► Summary PALMS Report'],
    ...params(chapter, from, to),
    ['First Name', 'Last Name', 'P', 'A', 'L', 'M', 'S', 'RGI', 'RGO', 'RRI', 'RRO', 'V', '1-2-1', 'TYFCB', 'CEU', 'T'],
    ['Garima', 'Agarwal', 1, 0, 0, 0, 0, 2, 1, 0, 0, 1, 3, 50000, 2, 0],
    ['Rajesh Kumar', 'Agarwal', 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, '-', 0, 0],
    ['Visitors', '', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ['Total', '', 1, 1, 0, 0, 0, 2, 1, 0, 0, 1, 3, 50000, 2, 0],
  ]);
const sponsorFile = (chapter: string, from: string, to: string, withRow = true): string =>
  sheet([
    ['Chapter ► Sponsor Report'],
    ...params(chapter, from, to),
    ['Sponsor First Name', 'Sponsor Last Name', 'Total Members Sponsored', 'Sponsored First Name', 'Sponsored Last Name', 'Sponsored Region', 'Sponsored Chapter', 'Application Date'],
    ...(withRow ? [['Pranati', 'Bajaj', 1, 'Dheeraj', 'Parcha', 'Gurgaon', 'Alchemist', '2026-10-09T00:00:00.000']] : []),
  ]);

describe('importing the BNI reports', () => {
  const none = { existingPalms: [], existingSponsors: [] };

  it('recognises each report', () => {
    expect(detectReportKind(palmsFile('Influencers', '2026-10-08', '2026-10-14'))).toBe('palms');
    expect(detectReportKind(sponsorFile('Influencers', '2026-10-08', '2026-10-14'))).toBe('sponsor');
    expect(detectReportKind(sheet([['Something else']]))).toBeNull();
  });

  it('prepares a PALMS week: members only (Visitors / Total rows skipped), blank TYFCB = 0, meeting = the Wednesday', () => {
    const r = prepareTrafficReport('palms.xls', palmsFile('Influencers', '2026-10-08', '2026-10-14'), { ...none, orgNames: ['BNI Influencers', 'Influencers'] });
    expect(r.ok).toBe(true);
    if (!r.ok || r.report.kind !== 'palms') throw new Error('expected a PALMS report');
    expect(r.report.meetingDate).toBe('2026-10-14');
    expect(r.report.replaces).toBe(false);
    expect(r.report.rows.map((x) => x.memberName)).toEqual(['Garima Agarwal', 'Rajesh Kumar Agarwal']);
    expect(r.report.rows[0]).toMatchObject({ p: 1, rgi: 2, rgo: 1, visitors: 1, oneToOnes: 3, tyfcb: 50000, ceu: 2 });
    expect(r.report.rows[1].tyfcb).toBe(0);
  });

  it('prepares a Sponsor week, and a week with nobody sponsored is still importable', () => {
    const r = prepareTrafficReport('s.xls', sponsorFile('Influencers', '2026-10-08', '2026-10-14'), none);
    expect(r.ok && r.report.kind === 'sponsor' && r.report.rows[0]).toMatchObject({ sponsor: 'Pranati Bajaj', sponsored: 'Dheeraj Parcha', sponsoredChapter: 'Alchemist', applicationDate: '2026-10-09' });
    const empty = prepareTrafficReport('s.xls', sponsorFile('Influencers', '2026-10-08', '2026-10-14', false), none);
    expect(empty.ok && empty.report.rows).toEqual([]);
  });

  it('refuses another chapter, a multi-week report, an overlap, and a non-BNI file', () => {
    expect(prepareTrafficReport('p.xls', palmsFile('Stars', '2026-10-08', '2026-10-14'), { ...none, orgNames: ['BNI Influencers'] })).toMatchObject({ ok: false, error: expect.stringMatching(/not your chapter/) });
    expect(prepareTrafficReport('p.xls', palmsFile('Influencers', '2026-03-31', '2026-10-14'), none)).toMatchObject({ ok: false, error: expect.stringMatching(/one week per import/) });
    const overlap = prepareTrafficReport('p.xls', palmsFile('Influencers', '2026-10-08', '2026-10-14'), { existingPalms: [{ from: '2026-10-05', to: '2026-10-11' }], existingSponsors: [] });
    expect(overlap).toMatchObject({ ok: false, error: expect.stringMatching(/overlaps the already imported week/) });
    expect(prepareTrafficReport('x.xls', sheet([['hello']]), none)).toMatchObject({ ok: false, error: expect.stringMatching(/not a Traffic Lights report/) });
  });

  it('the same week imported again replaces it', () => {
    const r = prepareTrafficReport('p.xls', palmsFile('Influencers', '2026-10-08', '2026-10-14'), { existingPalms: [{ from: '2026-10-08', to: '2026-10-14' }], existingSponsors: [] });
    expect(r.ok && r.report.replaces).toBe(true);
  });

  it('chapter names compare without "BNI" and punctuation', () => {
    expect(chapterMatches('Influencers', ['BNI Influencers'])).toBe(true);
    expect(chapterMatches('BNI Influencers, Gurgaon, India', ['Influencers'])).toBe(true);
    expect(chapterMatches('Stars', ['BNI Influencers'])).toBe(false);
    expect(chapterMatches('Stars', [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------------------------------------------------
describe('export', () => {
  it('writes one line per member with numbers as numbers and rates to 4 decimals', () => {
    const rows = buildTrafficRows({
      palms: [palmsLine({ memberName: 'Garima "G" Agarwal', meetingDate: '2026-04-01', p: 24, a: 2, m: 2, s: 1, rgi: 12, rgo: 7, visitors: 4, oneToOnes: 25, tyfcb: 181650, ceu: 15 })],
      sponsors: [],
      window: { from: '2026-03-31', to: '2026-10-14' },
      meetings: 29,
    });
    const [line] = exportLines(rows);
    expect(line.slice(0, 5)).toEqual([1, 'Garima "G" Agarwal', 62, 'Amber', 0.931]);
    expect(line[6]).toBe(0.5172);
    expect(line[12]).toBe(181650);
    const csv = exportCsv(rows, 'TITLE', 'WINDOW').split('\n');
    expect(csv[0]).toBe('"TITLE"');
    expect(csv[3]).toContain('"Garima ""G"" Agarwal"');
  });
});
