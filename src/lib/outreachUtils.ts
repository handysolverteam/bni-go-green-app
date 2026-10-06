import { Member, Nudge } from '../types';
import { levelUpPlan, trafficLight, getScoringConfig } from './scoringEngine';

export const CAT_LABELS: Record<string, string> = {
  attendance: 'Attendance',
  ceu: 'CEU',
  oneToOnes: '1-2-1s',
  referrals: 'Referrals',
  visitors: 'Visitors',
  tyfcb: 'TYFCB',
  sponsors: 'Sponsors',
};

/**
 * Universal date formatter for the application frontend.
 * Converts strings like "2026-08-12", "12/8/2026", ISO dates, etc. to "12 Aug 2026".
 */
export const formatDisplayDate = (dateVal?: string | Date | null): string => {
  if (!dateVal) return '';

  try {
    let d: Date;

    if (dateVal instanceof Date) {
      d = dateVal;
    } else {
      const str = String(dateVal).trim();
      if (!str) return '';

      // Handle slash separated dates: DD/MM/YYYY or D/M/YYYY
      if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          const p3 = parseInt(parts[2], 10);
          if (p3 > 1000) {
            d = new Date(p3, p2 - 1, p1);
          } else if (p1 > 1000) {
            d = new Date(p1, p2 - 1, p3);
          } else {
            d = new Date(str);
          }
        } else {
          d = new Date(str);
        }
      } else if (str.includes('-')) {
        const parts = str.split('T')[0].split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const day = parseInt(parts[2], 10);
          d = new Date(y, m - 1, day);
        } else {
          d = new Date(str);
        }
      } else {
        d = new Date(str);
      }
    }

    if (isNaN(d.getTime())) {
      return String(dateVal);
    }

    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    return `${day} ${month} ${year}`;
  } catch (e) {
    return String(dateVal);
  }
};

/**
 * Formats report upload timestamps or ISO dates to "12 Aug 2026, 10:33 AM".
 */
export const formatDisplayDateTime = (dateVal?: string | Date | null): string => {
  if (!dateVal) return '';

  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);

    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    return `${day} ${month} ${year}, ${timeStr}`;
  } catch (e) {
    return String(dateVal);
  }
};

export const substituteKeywords = (templateText: string, data: Record<string, string>): string => {
  let result = templateText;
  Object.entries(data).forEach(([key, val]) => {
    const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
    result = result.replace(reg, val);
  });
  return result;
};

const TITLE_WORDS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'rev', 'hon', 'shri', 'smt', 'sri', 'smt']);
const SHORT_WORDS = new Set(['de', 'di', 'da', 'du', 'del', 'la', 'le', 'el', 'al', 'van', 'von', 'o', 'mac', 'mc', 'ibn', 'bin', 'abu']);

export const getFirstName = (name?: string | null): string => {
  if (!name) return 'Member';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Member';
  if (words.length === 1) return words[0];

  const first = words[0].replace(/\.+$/, '');
  const firstLower = first.toLowerCase();
  const isTitle = TITLE_WORDS.has(firstLower);
  const isShort = SHORT_WORDS.has(firstLower) || firstLower.length <= 2;

  if ((isTitle || isShort) && words.length >= 2) {
    return `${first} ${words[1]}`;
  }
  return first;
};

export const buildMemberTemplateData = (member: Member): Record<string, string> => {
  const score = member.score ?? 0;
  const label = member.trafficLight?.label || 'Grey';
  const emoji = member.trafficLight?.emoji || (label === 'Green' ? '🟢' : label === 'Amber' ? '🟡' : label === 'Red' ? '🔴' : '⚪');
  const ptsToGreen = Math.max(0, 70 - score);
  const breakdown = member.breakdown || {};

  // Attendance
  const attVal = breakdown.attendance?.value ?? member.AttendanceRate ?? 1;
  const attPts = breakdown.attendance?.points ?? member.AttendanceScore ?? 10;
  const attRateStr = (attVal * 100).toFixed(0);
  const attTargetStr = attPts >= 10 ? 'max achieved' : 'next: 96%+ for 10 pts';

  // CEU
  const ceuVal = breakdown.ceu?.value ?? member.CEURate ?? member.CEU ?? 0;
  const ceuPts = breakdown.ceu?.points ?? member.CEUScore ?? 0;
  const ceuTargetStr = ceuPts >= 10 ? 'max achieved' : 'next: 0.5 for 10 pts';

  // 1-2-1s
  const otoVal = breakdown.oneToOnes?.value ?? member.OneToOneRate ?? member.OneToOnes ?? 0;
  const otoPts = breakdown.oneToOnes?.points ?? member.OneToOneScore ?? 0;
  const otoTargetStr = otoPts >= 20 ? 'max achieved' : 'next: 1.0 for 20 pts';

  // Referrals
  const refVal = breakdown.referrals?.value ?? member.ReferralsGivenRate ?? member.RGT ?? 0;
  const refPts = breakdown.referrals?.points ?? member.ReferralsGivenScore ?? 0;
  const refTargetStr = refPts >= 25 ? 'max achieved' : 'next: 0.75 for 15 pts; max: 1.25 for 25 pts';

  // Visitors
  const visVal = member.V ?? breakdown.visitors?.value ?? 0;
  const visPts = breakdown.visitors?.points ?? member.VisitorScore ?? 0;
  const visTargetStr = visPts >= 25 ? 'max achieved' : 'next: 4 for 20 pts; max: 5 for 25 pts';

  // TYFCB
  const tyfcbVal = member.TYFCB ?? breakdown.tyfcb?.value ?? 0;
  const tyfcbPts = breakdown.tyfcb?.points ?? member.TYFCBScore ?? 0;
  const tyfcbTargetStr = tyfcbPts >= 5 ? 'max achieved' : 'next: Rs 6,25,000 for 4 pts; max: Rs 12,50,000 for 5 pts';

  // Sponsors
  const sponVal = member.Sponsors ?? breakdown.sponsors?.value ?? 0;
  const sponPts = breakdown.sponsors?.points ?? member.SponsorScore ?? 0;
  const sponTargetStr = sponPts >= 5 ? 'max achieved' : 'next: 1 for 5 pts';

  // Format Nudges List
  const steps: string[] = [];
  let stepIdx = 1;

  if (tyfcbPts < 5) {
    const targetAmt = 625000;
    const diff = Math.max(0, targetAmt - Number(tyfcbVal));
    steps.push(`${stepIdx++}. - TYFCB (${tyfcbPts}/5 pts): TYFCB: generate Rs ${diff.toLocaleString('en-IN')} more closed business (+1 pts)`);
  }
  if (ceuPts < 10) {
    steps.push(`${stepIdx++}. - CEU (${ceuPts}/10 pts): CEU: reach 0.5 per week (+5 pts)`);
  }
  if (refPts < 25) {
    steps.push(`${stepIdx++}. - Referrals (${refPts}/25 pts): Referrals given: reach 0.75 per week (+5 pts)`);
  }

  const secondarySteps: string[] = [];
  if (visPts < 25) {
    secondarySteps.push(`- Visitors (${visPts}/25 pts): Visitors: bring 1 more visitor(s) (+5 pts)`);
  }
  if (sponPts < 5) {
    secondarySteps.push(`- Sponsors (${sponPts}/5 pts): Sponsors: sponsor at least 1 member (+5 pts)`);
  }

  let nudgesList = steps.join('\n\n');
  if (secondarySteps.length > 0) {
    if (nudgesList) nudgesList += '\n\nOther ways to increase points:\n';
    else nudgesList = 'Other ways to increase points:\n';
    nudgesList += secondarySteps.join('\n');
  }
  if (!nudgesList) {
    nudgesList = '• Maintain current score to stay in Green status!';
  }

  return {
    name: getFirstName(member.Name) || 'Member',
    score: String(score),
    traffic_light: `${emoji} ${label}`,
    pts_to_green: String(ptsToGreen),
    nudges_list: nudgesList,

    attendance_rate: attRateStr,
    attendance_pts: String(attPts),
    attendance_target: attTargetStr,

    ceu_current: typeof ceuVal === 'number' ? ceuVal.toFixed(2) : String(ceuVal),
    ceu_pts: String(ceuPts),
    ceu_target: ceuTargetStr,

    one_to_ones_current: typeof otoVal === 'number' ? otoVal.toFixed(2) : String(otoVal),
    one_to_ones_pts: String(otoPts),
    one_to_ones_target: otoTargetStr,

    referrals_current: typeof refVal === 'number' ? refVal.toFixed(2) : String(refVal),
    referrals_pts: String(refPts),
    referrals_target: refTargetStr,

    visitors_current: String(visVal),
    visitors_pts: String(visPts),
    visitors_target: visTargetStr,

    tyfcb_current: `Rs ${Number(tyfcbVal).toLocaleString('en-IN')}`,
    tyfcb_pts: String(tyfcbPts),
    tyfcb_target: tyfcbTargetStr,

    sponsors_current: String(sponVal),
    sponsors_pts: String(sponPts),
    sponsors_target: sponTargetStr,

    // Legacy fallback keys
    present: String(member.P || 0),
    absent: String(member.A || 0),
    referrals: String(member.RGT || 0),
    tyfcb: `Rs ${(member.TYFCB || 0).toLocaleString('en-IN')}`,
    one_to_ones: String(member.OneToOnes || 0),
    ceu: String(member.CEU || 0),
    sponsors: String(member.Sponsors || 0),
    chapter: member.Chapter || 'Chapter',
  };
};

export function buildSnapshotLines(member: Member): string[] {
  const d = buildMemberTemplateData(member);

  const line = (label: string, currentText: string, ptsKey: string, target: string, cat: string) => {
    const b = member.breakdown?.[cat];
    const pts = b ? `${b.points}/${b.max} pts` : d[ptsKey];
    return `- *${label}*\n  Current: ${currentText}\n  Points: ${pts}\n  Target: ${target}`;
  };

  return [
    line('Attendance', `rate: ${d.attendance_rate}%`, 'attendance_pts', d.attendance_target, 'attendance'),
    line('CEU', `per week: ${d.ceu_current}`, 'ceu_pts', d.ceu_target, 'ceu'),
    line('1-2-1s', `per week: ${d.one_to_ones_current}`, 'one_to_ones_pts', d.one_to_ones_target, 'oneToOnes'),
    line('Referrals', `given per week: ${d.referrals_current}`, 'referrals_pts', d.referrals_target, 'referrals'),
    line('Visitors', `brought: ${d.visitors_current}`, 'visitors_pts', d.visitors_target, 'visitors'),
    line('TYFCB', `closed business: ${d.tyfcb_current}`, 'tyfcb_pts', d.tyfcb_target, 'tyfcb'),
    line('Sponsors', `sponsored: ${d.sponsors_current}`, 'sponsors_pts', d.sponsors_target, 'sponsors'),
  ];
}

/**
 * The "what to do next" part of a message: the tier-specific plan (perfect score / keep improving
 * / just do this / do all of these) followed by any other ways to gain points. Driven by
 * levelUpPlan(), so it follows the chapter's own scoring thresholds -- unlike the static
 * `nudges_list` in buildMemberTemplateData, whose targets are hardcoded.
 */
export function buildActionPlanText(member: Member): string {
  const score = member.score ?? 0;
  const plan = levelUpPlan(member);
  const allOpportunities = member.nudges || [];

  const ptsOf = (cat: string) => member.breakdown?.[cat]?.points;
  const maxOf = (cat: string) => member.breakdown?.[cat]?.max;

  const labelOf = (n: Nudge) => CAT_LABELS[n.category] || n.category;

  const optionLine = (n: Nudge) => {
    const current = ptsOf(n.category);
    const max = maxOf(n.category);
    const newTotal = score + n.gain;
    const newLight = trafficLight(newTotal);
    let line = '';
    if (Number.isFinite(current) && Number.isFinite(max)) line += `📊 *${labelOf(n)}*: ${current}/${max} pts\n`;
    line += `  → ${n.action}\n`;
    line += `  ✅ New total: *${newTotal}/100* ${newLight.emoji} ${newLight.label}\n`;
    return line;
  };

  const stepLine = (n: Nudge) => {
    const current = ptsOf(n.category);
    const max = maxOf(n.category);
    let line = '';
    if (Number.isFinite(current) && Number.isFinite(max)) line += `📊 *${labelOf(n)}*: ${current}/${max} pts\n`;
    line += `  → ${n.action} → *+${n.gain} pts*\n`;
    return line;
  };

  const compactOpportunityLine = (n: Nudge) => {
    const current = ptsOf(n.category);
    const max = maxOf(n.category);
    const pts = Number.isFinite(current) && Number.isFinite(max) ? ` (${current}/${max} pts)` : '';
    return `• *${labelOf(n)}*${pts}: ${n.action} → *+${n.gain} pts*`;
  };

  let msg = '';

  if (plan.stayGreen) {
    if (plan.nudgesForLevel.length === 0) {
      msg += `🏆 Perfect score! You're the BNI champion — keep leading the way!\n`;
    } else {
      msg += `✅ You're in the Green! Keep improving with any of these:\n\n`;
      plan.nudgesForLevel.forEach((n, i) => {
        msg += `*Option ${i + 1}*\n` + optionLine(n) + '\n';
      });
    }
  } else {
    const eachCoversGap = plan.nudgesForLevel.every(n => n.gain >= plan.pointsNeeded);

    if (plan.nudgesForLevel.length === 0) {
      msg += `Keep improving your weekly activity to move up from ${plan.from}.\n`;
    } else if (eachCoversGap && plan.nudgesForLevel.length === 1) {
      msg += `🎯 To reach *${plan.to}* (need *+${plan.pointsNeeded} pts*), just do this:\n\n`;
      msg += optionLine(plan.nudgesForLevel[0]) + '\n';
    } else if (eachCoversGap) {
      msg += `🎯 To reach *${plan.to}* (need *+${plan.pointsNeeded} pts*), pick *any one*:\n\n`;
      plan.nudgesForLevel.forEach((n, i) => {
        msg += `*Option ${i + 1}*\n` + optionLine(n) + '\n';
      });
    } else {
      msg += `🎯 To reach *${plan.to}* (need *+${plan.pointsNeeded} pts*), do *all* of these:\n\n`;
      plan.nudgesForLevel.forEach((n, i) => {
        msg += `*Step ${i + 1}*\n` + stepLine(n) + '\n';
      });
      const newTotal = score + plan.nudgesForLevel.reduce((s, n) => s + n.gain, 0);
      const newLight = trafficLight(newTotal);
      msg += `✅ Combined new total: *${newTotal}/100* ${newLight.emoji} ${newLight.label}\n`;
    }
  }

  const primaryCategories = new Set(plan.nudgesForLevel.map(n => n.category));
  const extraOpportunities = allOpportunities.filter(n => !primaryCategories.has(n.category));
  if (extraOpportunities.length > 0) {
    msg += `\n📈 ${plan.stayGreen ? 'All available ways to improve:' : 'Other ways to increase points:'}\n`;
    extraOpportunities.forEach(n => {
      msg += `${compactOpportunityLine(n)}\n`;
    });
  }

  return msg;
}

/** Current-vs-target breakdown for every scoring category, as a titled block. */
export function buildSnapshotText(member: Member): string {
  const snapshotLines = buildSnapshotLines(member);
  if (snapshotLines.length === 0) return '';

  let msg = `\n📋 Current scoring snapshot:\n`;
  snapshotLines.forEach(l => {
    msg += `${l}\n`;
  });
  return msg;
}

export function buildMemberMessage(member: Member, options?: { signature?: string; scoreTerm?: string }): string {
  const firstName = getFirstName(member.Name);
  const score = member.score ?? 0;
  const light = member.trafficLight || { label: 'Grey', emoji: '⚪', color: '#9ca3af' };
  const scoreTerm = options?.scoreTerm || 'Go Green';

  let msg = `Hi ${firstName}! 👋\n\n`;
  msg += `Your ${scoreTerm} Score: *${score}/100* ${light.emoji} ${light.label}\n\n`;
  msg += buildActionPlanText(member);
  msg += buildSnapshotText(member);

  const signature = String(options?.signature || '').trim();
  msg += signature
    ? `\n${signature}\n\nMade with 🧡 by Handysolver`
    : `\nMade with 🧡 by Handysolver`;
  return msg;
}

// ─── Custom message templates ────────────────────────────────────────────────────────────────
//
// Admins can replace the auto-built message for a traffic-light tier with their own wording built
// from {{placeholders}} (Settings -> WhatsApp Outreach Messages). A tier with no template keeps
// using buildMemberMessage, so nothing changes until someone opts in.

export const MESSAGE_TIERS = ['Green', 'Amber', 'Red', 'Grey'] as const;
export type MessageTier = (typeof MESSAGE_TIERS)[number];
export type MessageTemplates = Partial<Record<MessageTier, string>>;

/** Stored on the org row and fetched with every Settings/Outreach load, so keep it bounded. */
export const MAX_TEMPLATE_LENGTH = 4000;

/**
 * Every placeholder a template may use, grouped for the editor's insert chips. This is the single
 * source of truth for validation too: anything not listed here is rejected rather than risk a
 * literal "{{nmae}}" reaching a member's WhatsApp.
 *
 * Deliberately omits the legacy `*_target` keys -- buildMemberTemplateData derives those from
 * hardcoded thresholds, so they'd be wrong for any chapter with custom scoring.
 */
export const TEMPLATE_PLACEHOLDER_GROUPS: ReadonlyArray<{
  title: string;
  items: ReadonlyArray<{ key: string; label: string }>;
}> = [
  {
    title: 'Member',
    items: [
      { key: 'name', label: 'First name' },
      { key: 'chapter', label: 'Chapter' },
    ],
  },
  {
    title: 'Score',
    items: [
      { key: 'score', label: 'Score' },
      { key: 'score_term', label: 'Score label' },
      { key: 'traffic_light', label: 'Tier' },
      { key: 'pts_to_green', label: 'Points to Green' },
    ],
  },
  {
    title: 'What to do next',
    items: [
      { key: 'nudges_list', label: 'Action plan' },
      { key: 'snapshot', label: 'Scoring snapshot' },
    ],
  },
  {
    title: 'By category',
    items: [
      { key: 'attendance_rate', label: 'Attendance %' },
      { key: 'attendance_pts', label: 'Attendance pts' },
      { key: 'ceu_current', label: 'CEU / week' },
      { key: 'ceu_pts', label: 'CEU pts' },
      { key: 'one_to_ones_current', label: '1-2-1s / week' },
      { key: 'one_to_ones_pts', label: '1-2-1s pts' },
      { key: 'referrals_current', label: 'Referrals / week' },
      { key: 'referrals_pts', label: 'Referrals pts' },
      { key: 'visitors_current', label: 'Visitors' },
      { key: 'visitors_pts', label: 'Visitors pts' },
      { key: 'tyfcb_current', label: 'TYFCB' },
      { key: 'tyfcb_pts', label: 'TYFCB pts' },
      { key: 'sponsors_current', label: 'Sponsors' },
      { key: 'sponsors_pts', label: 'Sponsors pts' },
    ],
  },
  {
    title: 'Closing',
    items: [{ key: 'signature', label: 'Your signature' }],
  },
];

const KNOWN_PLACEHOLDERS = new Set(TEMPLATE_PLACEHOLDER_GROUPS.flatMap(g => g.items.map(i => i.key)));

const PLACEHOLDER_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
// `{name}` -- one brace each side. The leading group stands in for a lookbehind (older Safari).
const SINGLE_BRACE_RE = /(^|[^{])\{([a-z0-9_]+)\}(?!\})/gi;

/**
 * Plain-language problems with a template, empty when it's safe to save. Catches the mistakes
 * that would otherwise ship to members verbatim: unknown/misspelled placeholders, `{name}`
 * written with single braces, and stray `{{` / `}}`.
 */
export function validateTemplate(template: string): string[] {
  const problems: string[] = [];

  const unknown = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    if (!KNOWN_PLACEHOLDERS.has(m[1].toLowerCase())) unknown.add(m[1]);
  }
  unknown.forEach(key => problems.push(`Unknown placeholder {{${key}}}`));

  const rest = template.replace(PLACEHOLDER_RE, '');
  const singles = new Set<string>();
  for (const m of rest.matchAll(SINGLE_BRACE_RE)) singles.add(m[2]);
  singles.forEach(key => problems.push(`{${key}} needs double braces: {{${key}}}`));

  if (/\{\{|\}\}/.test(rest)) {
    problems.push('Stray "{{" or "}}" — a placeholder looks like {{name}}');
  }

  return problems;
}

/**
 * Cleans templates read from storage: known tiers only, non-blank strings only, length-capped.
 * The org `settings` column is free-form JSON, so never trust its shape.
 */
export function normalizeTemplates(raw: unknown): MessageTemplates {
  if (!raw || typeof raw !== 'object') return {};
  const out: MessageTemplates = {};
  for (const tier of MESSAGE_TIERS) {
    const value = (raw as Record<string, unknown>)[tier];
    if (typeof value === 'string' && value.trim()) out[tier] = value.slice(0, MAX_TEMPLATE_LENGTH);
  }
  return out;
}

/** Fills a template's placeholders for one member. Unknown placeholders render as nothing. */
export function renderTemplateMessage(
  member: Member,
  template: string,
  options?: { signature?: string; scoreTerm?: string },
): string {
  const score = member.score ?? 0;
  const signature = String(options?.signature || '').trim();

  const data: Record<string, string> = {
    ...buildMemberTemplateData(member),
    // buildMemberTemplateData hardcodes the Green cutoff (70) and the action-plan targets, so
    // take these from the live scoring engine instead -- they must follow the chapter's config.
    pts_to_green: String(Math.max(0, getScoringConfig().trafficLight.green - score)),
    nudges_list: buildActionPlanText(member).trim(),
    snapshot: buildSnapshotText(member).trim(),
    score_term: options?.scoreTerm || 'Go Green',
    signature,
  };

  // One pass over the template: values are inserted as-is, never re-scanned, so a signature
  // containing "{{score}}" (or "$&") can't expand or corrupt anything.
  let body = template.replace(PLACEHOLDER_RE, (_match, key: string) => data[key.toLowerCase()] ?? '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  // Same contract as the auto-built message: the signature always lands somewhere. A template
  // that wants it mid-message uses {{signature}}; otherwise it's appended.
  const placesSignatureItself = /\{\{\s*signature\s*\}\}/i.test(template);
  if (signature && !placesSignatureItself) body += `\n\n${signature}`;

  return `${body}\n\nMade with 🧡 by Handysolver`;
}

/**
 * The one entry point for "the message to send this member": their tier's custom template if the
 * chapter has set one, otherwise the auto-built message. Every outreach surface should call this
 * rather than buildMemberMessage directly, so a template change applies everywhere at once.
 */
export function buildOutreachMessage(
  member: Member,
  options?: { signature?: string; scoreTerm?: string; templates?: MessageTemplates },
): string {
  const tier = (member.trafficLight?.label ?? 'Grey') as MessageTier;
  const template = options?.templates?.[tier];
  if (template && template.trim()) return renderTemplateMessage(member, template, options);
  return buildMemberMessage(member, options);
}

/**
 * Ready-made starting points for the editor's "Use a starter" button. They lean on live data
 * ({{nudges_list}}, {{pts_to_green}}) rather than baking in advice like "book 1 One-to-One",
 * which would be wrong for any member whose gap is elsewhere.
 */
export const STARTER_TEMPLATES: Record<MessageTier, string> = {
  Green: `Hi {{name}}! 👋

Your {{score_term}} Score: *{{score}}/100* {{traffic_light}}

You're doing great — thank you for being such a strong part of our chapter! 🌟

{{nudges_list}}`,
  Amber: `Hi {{name}}! 👋

Your {{score_term}} Score: *{{score}}/100* {{traffic_light}}

You're so close — just *{{pts_to_green}} pts* away from Green! 🚀

{{nudges_list}}

{{snapshot}}`,
  Red: `Hi {{name}}! 👋

Your {{score_term}} Score: *{{score}}/100* {{traffic_light}}

We value having you in the chapter and want to help you move up. A few focused steps this week will make a real difference:

{{nudges_list}}`,
  Grey: `Hi {{name}}! 👋

Your {{score_term}} Score: *{{score}}/100* {{traffic_light}}

We've missed seeing you at the chapter and would love to get you back on track. Here's where to start:

{{nudges_list}}

Reach out any time if you'd like to catch up over a 1-2-1. 🤝`,
};

export const UNIVERSAL_DEFAULT_TEMPLATE_TEXT = `Hi {{name}}!

Your Go Green Score: {{score}}/100 {{traffic_light}}

To reach Green, you need +{{pts_to_green}} pts.
Do these steps:

{{nudges_list}}

Current scoring snapshot:
- Attendance
  Current: rate: {{attendance_rate}}%
  Points: {{attendance_pts}}/10 pts
  Target: {{attendance_target}}

- CEU
  Current: per week: {{ceu_current}}
  Points: {{ceu_pts}}/10 pts
  Target: {{ceu_target}}

- 1-2-1s
  Current: per week: {{one_to_ones_current}}
  Points: {{one_to_ones_pts}}/20 pts
  Target: {{one_to_ones_target}}

- Referrals
  Current: given per week: {{referrals_current}}
  Points: {{referrals_pts}}/25 pts
  Target: {{referrals_target}}

- Visitors
  Current: brought: {{visitors_current}}
  Points: {{visitors_pts}}/25 pts
  Target: {{visitors_target}}

- TYFCB
  Current: closed business: {{tyfcb_current}}
  Points: {{tyfcb_pts}}/5 pts
  Target: {{tyfcb_target}}

- Sponsors
  Current: sponsored: {{sponsors_current}}
  Points: {{sponsors_pts}}/5 pts
  Target: {{sponsors_target}}`;
