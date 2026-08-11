import {
  ScoringConfig,
  Member,
  MetricSnapshot,
  Nudge,
  TrafficLightStatus,
  LevelUpPlan,
  CategoryBreakdown
} from '../types';

export const DEFAULTS: ScoringConfig = {
  attendance: {
    thresholds: [
      { t: 0.88, pts: 5 },
      { t: 0.96, pts: 10 },
    ],
  },
  ceu: {
    thresholds: [
      { t: 0.000001, pts: 5 },
      { t: 0.500001, pts: 10 },
    ],
  },
  oneToOnes: {
    thresholds: [
      { t: 0.25, pts: 5 },
      { t: 0.5, pts: 10 },
      { t: 0.75, pts: 15 },
      { t: 1, pts: 20 },
    ],
  },
  referrals: {
    thresholds: [
      { t: 0.25, pts: 5 },
      { t: 0.5, pts: 10 },
      { t: 0.75, pts: 15 },
      { t: 1, pts: 20 },
      { t: 1.25, pts: 25 },
    ],
  },
  tyfcb: {
    thresholds: [
      { t: 1, pts: 1 },
      { t: 85000, pts: 2 },
      { t: 210000, pts: 3 },
      { t: 625000, pts: 4 },
      { t: 1250000, pts: 5 },
    ],
  },
  visitors: {
    thresholds: [
      { t: 1, pts: 5 },
      { t: 2, pts: 10 },
      { t: 3, pts: 15 },
      { t: 4, pts: 20 },
      { t: 5, pts: 25 },
    ],
  },
  sponsors: {
    thresholds: [
      { t: 1, pts: 5 },
    ],
  },
  trafficLight: { green: 70, amber: 50, red: 30 },
};

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

export function num(v: any): number {
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export function parseDateValue(value: any): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  if (typeof value === 'number' && isFinite(value)) {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  const raw = String(value).trim();
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const parsed = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

let CFG: ScoringConfig = clone(DEFAULTS);

export function setScoringConfig(config: Partial<ScoringConfig>) {
  CFG = { ...clone(DEFAULTS), ...config };
}

export function getScoringConfig(): ScoringConfig {
  return clone(CFG);
}

export function observedWeeks(member: Member): number {
  return num(member?.P) + num(member?.A) + num(member?.S) + num(member?.M);
}

export function reportWeeks(member: Member): number {
  const from = parseDateValue(member?.reportFromDate);
  const to = parseDateValue(member?.reportToDate);
  if (from && to) {
    const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
    if (days > 0) return Math.max(1, Math.ceil((days + 1) / 7));
  }
  const observed = observedWeeks(member);
  return observed > 0 ? observed : 26;
}

export function effectiveWeeks(member: Member): number {
  const observed = observedWeeks(member);
  const report = reportWeeks(member);
  return observed > 0 && observed < report ? observed : report;
}

export function safeRate(value: any, weeks: number): number {
  return weeks > 0 ? num(value) / weeks : 0;
}

export function directRate(member: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = member?.[key];
    if (value !== undefined && value !== null && value !== '') return num(value);
  }
  return null;
}

export function attendanceRate(member: Member): number {
  const explicit = member?.AttendanceRate ?? (member as any)?.attendanceRate ?? (member as any)?.['Attendance Rate'];
  if (explicit !== undefined && explicit !== '') {
    const value = num(explicit);
    return value > 1 ? value / 100 : value;
  }
  const present = num(member?.P) + num(member?.S) + num(member?.M);
  const total = present + num(member?.A);
  return total > 0 ? present / total : 0;
}

export function oneToOnes(member: Member): number {
  return num(member?.OneToOnes ?? (member as any)?.oneToOnes ?? (member as any)?.RRT ?? (member as any)?.['1-2-1']);
}

export function calcFromThresholds(value: number, thresholds: { t: number; pts: number }[]): number {
  let pts = 0;
  for (const tier of thresholds) {
    if (value >= tier.t) pts = tier.pts;
  }
  return pts;
}

export function nextThreshold(value: number, thresholds: { t: number; pts: number }[], currentPoints: number) {
  return thresholds.find(tier => value < tier.t && tier.pts > currentPoints) || null;
}

export function formatRate(value: number): string {
  return Number(value.toFixed(2)).toString();
}

export function formatCurrency(value: number): string {
  return `₹${num(value).toLocaleString('en-IN')}`;
}

export function metricSnapshot(member: Member): MetricSnapshot {
  const weeks = effectiveWeeks(member);
  const ceuRate = directRate(member, ['CEURate', 'ceuRate', 'CEU Rate']);
  const oneToOneRate = directRate(member, ['OneToOneRate', 'oneToOneRate', '121 Rate', '1-2-1 Rate']);
  const referralsRate = directRate(member, ['ReferralsGivenRate', 'referralsGivenRate', 'Referrals Given Rate']);
  return {
    weeks,
    effectiveWeeks: weeks,
    reportWeeks: reportWeeks(member),
    observedWeeks: observedWeeks(member),
    attendanceRate: attendanceRate(member),
    ceuRate: ceuRate !== null ? ceuRate : safeRate(member?.CEU, weeks),
    oneToOneRate: oneToOneRate !== null ? oneToOneRate : safeRate(oneToOnes(member), weeks),
    referralsRate: referralsRate !== null ? referralsRate : safeRate(member?.RGT, weeks),
    tyfcb: num(member?.TYFCB),
    visitors: num(member?.V),
    sponsors: num(member?.Sponsors),
  };
}

export function trafficLight(score: number): TrafficLightStatus {
  if (score >= CFG.trafficLight.green) return { label: 'Green', emoji: '🟢', color: '#22c55e' };
  if (score >= CFG.trafficLight.amber) return { label: 'Amber', emoji: '🟡', color: '#f59e0b' };
  if (score >= CFG.trafficLight.red) return { label: 'Red', emoji: '🔴', color: '#ef4444' };
  return { label: 'Grey', emoji: '⚪', color: '#9ca3af' };
}

const SCORING_RULES = {
  attendance: {
    get max() { return CFG.attendance.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).attendanceRate; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.attendance.thresholds); },
    nudge(m: Member): Nudge | null {
      const current = this.value(m);
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const next = nextThreshold(current, CFG.attendance.thresholds, cur);
      if (!next) return null;
      return { action: `Attendance: improve attendance rate to ${(next.t * 100).toFixed(0)}%`, gain: next.pts - cur, category: 'attendance' };
    }
  },
  ceu: {
    get max() { return CFG.ceu.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).ceuRate; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.ceu.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const next = nextThreshold(this.value(m), CFG.ceu.thresholds, cur);
      if (!next) return null;
      return { action: `CEU: reach ${formatRate(next.t)} CEUs per week`, gain: next.pts - cur, category: 'ceu' };
    }
  },
  oneToOnes: {
    get max() { return CFG.oneToOnes.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).oneToOneRate; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.oneToOnes.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const next = nextThreshold(this.value(m), CFG.oneToOnes.thresholds, cur);
      if (!next) return null;
      return { action: `1-2-1s: reach ${formatRate(next.t)} 1-2-1s per week`, gain: next.pts - cur, category: 'oneToOnes' };
    }
  },
  referrals: {
    get max() { return CFG.referrals.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).referralsRate; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.referrals.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const next = nextThreshold(this.value(m), CFG.referrals.thresholds, cur);
      if (!next) return null;
      return { action: `Referrals given: reach ${formatRate(next.t)} per week`, gain: next.pts - cur, category: 'referrals' };
    }
  },
  tyfcb: {
    get max() { return CFG.tyfcb.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).tyfcb; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.tyfcb.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const current = this.value(m);
      const next = nextThreshold(current, CFG.tyfcb.thresholds, cur);
      if (!next) return null;
      return { action: `TYFCB: generate ${formatCurrency(next.t - current)} more closed business`, gain: next.pts - cur, category: 'tyfcb' };
    }
  },
  visitors: {
    get max() { return CFG.visitors.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).visitors; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.visitors.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      const current = this.value(m);
      const next = nextThreshold(current, CFG.visitors.thresholds, cur);
      if (!next) return null;
      return { action: `Visitors: bring ${next.t - current} more visitor(s)`, gain: next.pts - cur, category: 'visitors' };
    }
  },
  sponsors: {
    get max() { return CFG.sponsors.thresholds.at(-1)?.pts ?? 0; },
    value(m: Member) { return metricSnapshot(m).sponsors; },
    calc(m: Member) { return calcFromThresholds(this.value(m), CFG.sponsors.thresholds); },
    nudge(m: Member): Nudge | null {
      const cur = this.calc(m);
      if (cur >= this.max) return null;
      return { action: 'Sponsors: sponsor at least 1 member', gain: this.max - cur, category: 'sponsors' };
    }
  }
};

export function scoreBreakdown(member: Member) {
  const breakdown: Record<string, CategoryBreakdown> = {};
  let total = 0;
  const metrics = metricSnapshot(member);

  for (const [cat, rule] of Object.entries(SCORING_RULES)) {
    const pts = rule.calc(member);
    breakdown[cat] = { points: pts, max: rule.max, value: rule.value(member) };
    total += pts;
  }

  return { breakdown, total, metrics };
}

export function generateNudges(member: Member): Nudge[] {
  const nudges: Nudge[] = [];
  for (const rule of Object.values(SCORING_RULES)) {
    const n = rule.nudge(member);
    if (n) nudges.push(n);
  }
  nudges.sort((a, b) => b.gain - a.gain);
  return nudges;
}

export function scoreMember(member: Member): Member {
  const { breakdown, total, metrics } = scoreBreakdown(member);
  const light = trafficLight(total);
  const weeksObserved = observedWeeks(member);
  const nudges = generateNudges(member).filter(n => {
    const b = breakdown[n.category];
    return !b || b.points < b.max;
  });

  return {
    ...member,
    activeWeeks: metrics.weeks,
    isProrated: false,
    observedWeeks: weeksObserved,
    score: total,
    breakdown,
    metrics,
    trafficLight: light,
    nudges
  };
}

export function levelUpPlan(member: Member): LevelUpPlan {
  const score = member.score || 0;
  const nudges = member.nudges || [];
  const tl = CFG.trafficLight;

  let from = 'Grey';
  let to: string | null = null;
  let target = 0;

  if (score >= tl.green) { from = 'Green'; to = null; target = 0; }
  else if (score >= tl.amber) { from = 'Amber'; to = 'Green'; target = tl.green; }
  else if (score >= tl.red) { from = 'Red'; to = 'Amber'; target = tl.amber; }
  else { from = 'Grey'; to = 'Red'; target = tl.red; }

  if (!to) {
    const easiest = [...nudges].sort((a, b) => a.gain - b.gain).slice(0, 3);
    return {
      from: 'Green', to: null, pointsNeeded: 0,
      nudgesForLevel: easiest, stayGreen: true,
    };
  }

  const pointsNeeded = target - score;
  const singleCovering = nudges
    .filter(n => n.gain >= pointsNeeded)
    .sort((a, b) => a.gain - b.gain);

  if (singleCovering.length > 0) {
    return { from, to, pointsNeeded, nudgesForLevel: [singleCovering[0]], accumulated: singleCovering[0].gain, stayGreen: false };
  }

  const byGainAsc = [...nudges].sort((a, b) => a.gain - b.gain);
  let accumulated = 0;
  const nudgesForLevel: Nudge[] = [];
  for (const n of byGainAsc) {
    if (accumulated >= pointsNeeded) break;
    nudgesForLevel.push(n);
    accumulated += n.gain;
  }

  return { from, to, pointsNeeded, nudgesForLevel, accumulated, stayGreen: false };
}
