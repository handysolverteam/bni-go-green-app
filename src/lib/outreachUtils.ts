import { Member } from '../types';

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
    name: member.Name || 'Member',
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

export const UNIVERSAL_DEFAULT_TEMPLATE_TEXT = `Hi {{name}}!

Your BNI Go Green Score: {{score}}/100 {{traffic_light}}

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
