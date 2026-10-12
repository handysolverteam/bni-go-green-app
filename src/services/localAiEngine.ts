import { Member, Organization, UserProfileExtended, ChatMessage } from '../types';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { OrgSnapshot, ChatPermissions } from './geminiService';

export function analyzeLocalChapterQuery(
  prompt: string,
  snapshot: OrgSnapshot,
  userProfile?: UserProfileExtended | null,
  conversationHistory: ChatMessage[] = [],
  permissions?: ChatPermissions
): string {
  const lower = (prompt || '').toLowerCase().trim();
  const userName = userProfile?.full_name ? userProfile.full_name : 'Member';
  const firstName = userProfile?.full_name ? userProfile.full_name.split(' ')[0] : 'Member';
  const category = userProfile?.business_category || 'Member';

  const org = snapshot.organization;
  const members = snapshot.members || [];
  const importLogs = snapshot.importLogs || [];

  const orgName = org?.name || 'your chapter';
  const orgCode = org?.code || 'N/A';
  const orgCity = org?.city || 'N/A';
  const greenThreshold = org?.green_threshold || 70;
  const amberThreshold = org?.amber_threshold || 50;

  // Resolve permission flags — default to full access if not supplied
  const canSeeContacts = permissions?.canSeeContactDetails ?? true;
  const roleLabel = permissions?.roleLabel ?? 'Admin';
  const CONTACT_RESTRICTED_MSG = `🔒 Contact details and individual TYFCB amounts are available to chapter *Admins* only. I can show you zone summaries, scores, improvement tips, or report comparisons instead.`;

  // ─── EARLY PERMISSION GUARD ────────────────────────────────────────────────
  // This fires BEFORE any member-name matching, disambiguation, or affirmative
  // handling. Without it, a query like "email address of X" would slip through
  // to the member-name matcher, return a disambiguation card, and never refuse.
  if (!canSeeContacts) {
    const isRestrictedContactRequest =
      lower.includes('email') ||
      lower.includes('e-mail') ||
      lower.includes('mail id') ||
      lower.includes('mail address') ||
      lower.includes('phone number') ||
      lower.includes('phone no') ||
      lower.includes('mobile number') ||
      lower.includes('mobile no') ||
      lower.includes('contact number') ||
      lower.includes('contact no') ||
      lower.includes('contact detail') ||
      lower.includes('whatsapp number') ||
      lower.includes('whatsapp no') ||
      lower.includes('whatsapp contact') ||
      // TYFCB per-member questions (e.g. "how much tyfcb did X generate?")
      (lower.includes('tyfcb') && (lower.includes('who') || lower.includes('how much') || lower.includes('earn') || lower.includes('generated') || lower.includes('of ')));

    if (isRestrictedContactRequest) {
      return CONTACT_RESTRICTED_MSG;
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  const availableReports = importLogs.map(l => l.batch_name).filter((b: string) => Boolean(b) && b !== 'Master Roster');

  // Helper functions
  const getMemberName = (m: any) => m.Name || m.name || 'Member';
  // Phone is gated by permission tier: go_green committee members cannot see contact details.
  const getMemberPhone = (m: any): string => {
    if (!canSeeContacts) return '[contact restricted]';
    return m.Phone || m.phone || 'N/A';
  };
  const getMemberScore = (m: any) => m.score || 0;
  const getMemberZone = (m: any) => {
    const raw = m.trafficLight?.label || m.traffic_light || '';
    const str = String(raw).toLowerCase();
    if (str.includes('green')) return 'Green';
    if (str.includes('red')) return 'Red';
    return 'Amber';
  };

  const getZoneEmoji = (zoneStr: string) => {
    if (zoneStr === 'Green') return '🟢';
    if (zoneStr === 'Red') return '🔴';
    return '🟡';
  };

  const total = members.length;
  const g = members.filter(m => getMemberZone(m) === 'Green').length;
  const a = members.filter(m => getMemberZone(m) === 'Amber').length;
  const r = members.filter(m => getMemberZone(m) === 'Red').length;
  const avg = total > 0 ? members.reduce((sum, m) => sum + getMemberScore(m), 0) / total : 0;
  const tyfcb = members.reduce((sum, m) => sum + (m.TYFCB || (m as any).tyfcb || 0), 0);
  const total121 = members.reduce((sum, m) => sum + (m.OneToOnes || (m as any).one_to_ones || 0), 0);
  const totalRefs = members.reduce((sum, m) => sum + (m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0), 0);

  // --- Reusable Report Comparison Builder ---
  const buildReportComparison = (rA: string, rB: string): string => {
    const mAList = members.filter(m => (m.batch_name || (m as any).batch_name) === rA);
    const mBList = members.filter(m => (m.batch_name || (m as any).batch_name) === rB);

    const avgA = mAList.length > 0 ? mAList.reduce((s, m) => s + getMemberScore(m), 0) / mAList.length : 0;
    const avgB = mBList.length > 0 ? mBList.reduce((s, m) => s + getMemberScore(m), 0) / mBList.length : 0;
    const delta = avgB - avgA;

    const greenA = mAList.filter(m => getMemberZone(m) === 'Green').length;
    const greenB = mBList.filter(m => getMemberZone(m) === 'Green').length;
    const redA = mAList.filter(m => getMemberZone(m) === 'Red').length;
    const redB = mBList.filter(m => getMemberZone(m) === 'Red').length;
    const amberA = mAList.filter(m => getMemberZone(m) === 'Amber').length;
    const amberB = mBList.filter(m => getMemberZone(m) === 'Amber').length;

    const tyfcbA = mAList.reduce((s, m) => s + (m.TYFCB || (m as any).tyfcb || 0), 0);
    const tyfcbB = mBList.reduce((s, m) => s + (m.TYFCB || (m as any).tyfcb || 0), 0);
    const tyfcbDelta = tyfcbB - tyfcbA;

    const refs121A = mAList.reduce((s, m) => s + (m.OneToOnes || (m as any).one_to_ones || 0), 0);
    const refs121B = mBList.reduce((s, m) => s + (m.OneToOnes || (m as any).one_to_ones || 0), 0);

    const deltaArrow = delta > 0 ? '📈 +' : delta < 0 ? '📉 ' : '➡️ ';
    const tyfcbArrow = tyfcbDelta > 0 ? '📈' : tyfcbDelta < 0 ? '📉' : '➡️';

    // Members who improved zone (Amber/Red → Green)
    const improved = mBList.filter(m => {
      const zoneB = getMemberZone(m);
      const mA = mAList.find(ma => getMemberName(ma).toLowerCase() === getMemberName(m).toLowerCase());
      if (!mA) return false;
      const zoneA = getMemberZone(mA);
      return zoneA !== 'Green' && zoneB === 'Green';
    });
    // Members who declined zone (Green → Amber/Red)
    const declined = mBList.filter(m => {
      const zoneB = getMemberZone(m);
      const mA = mAList.find(ma => getMemberName(ma).toLowerCase() === getMemberName(m).toLowerCase());
      if (!mA) return false;
      const zoneA = getMemberZone(mA);
      return zoneA === 'Green' && zoneB !== 'Green';
    });

    let res = `📈 *Report Comparison: ${rA} ➔ ${rB}*\n\n` +
      `📊 *Chapter Score Movement:*\n` +
      `• *Avg Score (${rA}):* ${formatDecimal(avgA, 1)} pts\n` +
      `• *Avg Score (${rB}):* ${formatDecimal(avgB, 1)} pts\n` +
      `• *Score Delta:* ${deltaArrow}${formatDecimal(Math.abs(delta), 1)} pts ${delta > 0 ? '(Chapter improved! 🎉)' : delta < 0 ? '(Chapter declined ⚠️)' : '(No change)'}\n\n` +
      `🟢 *Green Zone:* ${greenA} → ${greenB} (${greenB >= greenA ? '+' : ''}${greenB - greenA} members)\n` +
      `🟡 *Amber Zone:* ${amberA} → ${amberB} (${amberB >= amberA ? '+' : ''}${amberB - amberA} members)\n` +
      `🔴 *Red Zone:* ${redA} → ${redB} (${redB >= redA ? '+' : ''}${redB - redA} members)\n\n` +
      `💰 *TYFCB Revenue:*\n` +
      `• *${rA}:* ${formatCurrency(tyfcbA)}\n` +
      `• *${rB}:* ${formatCurrency(tyfcbB)}\n` +
      `• *Revenue Delta:* ${tyfcbArrow} ${tyfcbDelta >= 0 ? '+' : ''}${formatCurrency(tyfcbDelta)}\n\n` +
      `🤝 *1-to-1 Meetings:* ${formatDecimal(refs121A, 1)} → ${formatDecimal(refs121B, 1)} total\n`;

    if (improved.length > 0) {
      res += `\n🌟 *Members Who Improved to Green Zone:*\n`;
      improved.forEach(m => { res += `• *${getMemberName(m)}* — now at ${getMemberScore(m)}/100 pts 🟢\n`; });
    }
    if (declined.length > 0) {
      res += `\n⚠️ *Members Who Dropped from Green Zone:*\n`;
      declined.forEach(m => { res += `• *${getMemberName(m)}* — now at ${getMemberScore(m)}/100 pts ${getZoneEmoji(getMemberZone(m))}\n`; });
    }

    res += `\n❓ *Would you like me to generate outreach messages for members who declined or dropped from Green Zone?*`;
    return res;
  };

  // 0. Ranked contact list: "give me top three users' email address and phone numbers",
  // "lowest 5 members phone", "red zone members email". Contact permission was already enforced
  // by the early guard above, so reaching here means the caller may see contact details.
  const wantsEmail = /e-?mail|mail id/.test(lower);
  const wantsPhone = /phone|mobile|whatsapp number|contact (number|no|detail)|number/.test(lower);
  const rankWord = /\b(top|best|highest|leading|bottom|lowest|worst|weakest)\b/.test(lower);
  const zoneWord = lower.includes('green') ? 'Green' : lower.includes('red') ? 'Red' : lower.includes('amber') ? 'Amber' : null;
  if ((wantsEmail || wantsPhone) && (rankWord || zoneWord) && members.length > 0) {
    const WORD_NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const numMatch = lower.match(/\b(\d{1,2})\b/) || lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const count = Math.min(Math.max(numMatch ? (WORD_NUMS[numMatch[1]] ?? parseInt(numMatch[1], 10)) : 5, 1), 25);
    const ascending = /\b(bottom|lowest|worst|weakest)\b/.test(lower);

    // The same person can appear in several imported reports -- list each person once.
    const seen = new Set<string>();
    const pool = members.filter(m => {
      if (zoneWord && getMemberZone(m) !== zoneWord) return false;
      const key = getMemberName(m).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const ranked = [...pool]
      .sort((x, y) => (ascending ? getMemberScore(x) - getMemberScore(y) : getMemberScore(y) - getMemberScore(x)))
      .slice(0, count);

    if (ranked.length === 0) {
      return `📭 *No ${zoneWord ?? ''} members found in ${orgName}.*\n\n❓ *Would you like to see the full member list instead?*`;
    }

    const label = zoneWord ? `${zoneWord} Zone` : ascending ? 'Lowest-Scoring' : 'Top-Scoring';
    let res = `📇 *${label} ${ranked.length} Member${ranked.length === 1 ? '' : 's'} — Contact Details (${orgName})*\n\n`;
    ranked.forEach((m, idx) => {
      const emailLine = wantsEmail ? `   ✉️ ${m.Email || (m as any).email || 'N/A'}\n` : '';
      const phoneLine = wantsPhone || !wantsEmail ? `   📱 ${getMemberPhone(m)}\n` : '';
      res += `${idx + 1}. *${getMemberName(m)}* — ${getZoneEmoji(getMemberZone(m))} ${getMemberScore(m)}/100 pts\n${emailLine}${phoneLine}\n`;
    });
    res += `❓ *Would you like me to draft a WhatsApp message for any of them?*`;
    return res;
  }

  // 0b. Ranked leaderboard — "top 3 users", "bottom 5 members", "top 3 by referrals",
  // "who are the weakest performers". Section 0 above only fires when the question ALSO asks
  // for contact details, and the single-member branches further down only match exact phrases
  // like "top scorer"/"top member" — so a plain "give me top three users" matched nothing and
  // fell all the way through to the generic chapter overview (reported 2026-10-10).
  const RANK_METRICS: Array<{ test: RegExp; key: string; label: string; get: (m: any) => number }> = [
    { test: /1[\s-]?to[\s-]?1|one[\s-]?to[\s-]?one|\b121\b|\b1-2-1\b/, key: '121', label: '1-to-1s', get: (m) => m.OneToOnes || m.one_to_ones || 0 },
    { test: /\bceu\b|education/, key: 'ceu', label: 'CEU credits', get: (m) => m.CEU || m.ceu || 0 },
    { test: /referral/, key: 'ref', label: 'referrals given', get: (m) => m.ReferralsGivenRate ?? m.RGT ?? m.referrals_given ?? 0 },
    { test: /\btyfcb\b|revenue|closed business|business closed/, key: 'tyfcb', label: 'TYFCB', get: (m) => m.TYFCB || m.tyfcb || 0 },
    { test: /visitor/, key: 'vis', label: 'visitors', get: (m) => m.V || m.visitors || 0 },
    { test: /absent|absence/, key: 'abs', label: 'absences', get: (m) => m.A || m.absent || 0 },
    { test: /present|attendance/, key: 'pres', label: 'times present', get: (m) => m.P || m.present || 0 },
    { test: /sponsor/, key: 'spo', label: 'sponsors', get: (m) => m.Sponsors || m.sponsors || 0 },
  ];

  const isRankQuery = /\b(top|best|highest|leading|bottom|lowest|worst|weakest|rank|ranking|leaderboard)\b/.test(lower);
  const isMessageRequest = /\btemplate\b|\bdraft\b|whatsapp message|\bnudge\b/.test(lower);

  if (isRankQuery && !isMessageRequest && !lower.includes('compare') && members.length > 0) {
    const rankMetric = RANK_METRICS.find(mt => mt.test.test(lower));

    // Per-member TYFCB is Admin-only. The early guard above misses this phrasing ("top 5 by
    // tyfcb" has no who/how much/earned), so it has to be re-checked here.
    if (rankMetric?.key === 'tyfcb' && !canSeeContacts) {
      return CONTACT_RESTRICTED_MSG;
    }

    const RANK_WORD_NUMS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const rankNumMatch = lower.match(/\b(\d{1,2})\b/) || lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const rankCount = Math.min(Math.max(rankNumMatch ? (RANK_WORD_NUMS[rankNumMatch[1]] ?? parseInt(rankNumMatch[1], 10)) : 5, 1), 25);
    const rankAscending = /\b(bottom|lowest|worst|weakest)\b/.test(lower);
    const valueOf = rankMetric ? rankMetric.get : getMemberScore;

    // One row per person — the same member has a row in every imported report.
    const rankSeen = new Set<string>();
    const rankPool = members.filter(m => {
      if (zoneWord && getMemberZone(m) !== zoneWord) return false;
      const key = getMemberName(m).trim().toLowerCase();
      if (rankSeen.has(key)) return false;
      rankSeen.add(key);
      return true;
    });

    const rankedList = [...rankPool]
      .sort((x, y) => (rankAscending ? valueOf(x) - valueOf(y) : valueOf(y) - valueOf(x)))
      .slice(0, rankCount);

    if (rankedList.length === 0) {
      return `📭 *No ${zoneWord ? zoneWord + ' Zone ' : ''}members found in ${orgName}.*\n\n❓ *Would you like to see the full member list instead?*`;
    }

    const metricLabel = rankMetric ? rankMetric.label : 'PALMS score';
    const formatValue = (m: any): string => {
      const v = valueOf(m);
      if (!rankMetric) return `${v}/100 pts`;
      if (rankMetric.key === 'tyfcb') return formatCurrency(v);
      return `${formatDecimal(v)} ${metricLabel}`;
    };

    let res = `🏆 *${rankAscending ? 'Bottom' : 'Top'} ${rankedList.length}${zoneWord ? ` — ${zoneWord} Zone` : ''} by ${metricLabel}*\n`;
    res += `_${orgName} · ${rankPool.length} members ranked_\n\n`;
    rankedList.forEach((m, idx) => {
      const rankMark = !rankAscending && idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `${idx + 1}.`;
      const scoreSuffix = rankMetric ? ` · ${getMemberScore(m)}/100 pts` : '';
      res += `${rankMark} *${getMemberName(m)}* — ${formatValue(m)}${scoreSuffix} ${getZoneEmoji(getMemberZone(m))}\n`;
    });

    res += `\n❓ *Want a deeper look at any of them, or the same list by a different metric (1-to-1s, referrals, CEU)?*`;
    return res;
  }

  // 1. Affirmative Response to previous AI counter-question ("yes", "sure", "ok", "do it", "yeah", "generate")
  const isAffirmative = ['yes', 'sure', 'ok', 'yeah', 'yep', 'do it', 'generate', 'send', 'please', 'go ahead'].some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + ','));

  // Detect compare-reports intent even if sentence starts with "yes" (e.g. "yes compare both report side by side")
  const isCompareReportsIntent =
    (lower.includes('compare') && (lower.includes('report') || lower.includes('both') || lower.includes('all'))) ||
    lower.includes('compare both') ||
    lower.includes('side by side') ||
    lower.includes('compare side');

  if (isCompareReportsIntent && availableReports.length >= 2) {
    return buildReportComparison(availableReports[availableReports.length - 1], availableReports[0]);
  }

  if (isAffirmative && conversationHistory && conversationHistory.length > 0) {
    const aiMessages = conversationHistory.filter(m => m.sender === 'ai');
    const lastAiMsg = aiMessages[aiMessages.length - 1]?.text || '';

    // ✅ CASE: User says yes after AI offered to compare reports or showed report list
    if (
      lastAiMsg.includes('compare') &&
      (lastAiMsg.includes('report') || lastAiMsg.includes('side-by-side') || lastAiMsg.includes('side by side') || lastAiMsg.includes('inspect details'))
    ) {
      if (availableReports.length >= 2) {
        return buildReportComparison(availableReports[availableReports.length - 1], availableReports[0]);
      } else if (availableReports.length === 1) {
        return `📄 *Only 1 report available: ${availableReports[0]}*\n\nI need at least 2 uploaded reports to run a side-by-side comparison. Please upload another report batch!\n\n❓ *Would you like me to inspect full details for ${availableReports[0]} instead?*`;
      }
    }

    // ✅ CASE: User says yes after AI showed generic report list (which also asks about compare)
    if (lastAiMsg.includes('inspect details for a specific report')) {
      if (availableReports.length >= 2) {
        return buildReportComparison(availableReports[availableReports.length - 1], availableReports[0]);
      }
    }

    // Green zone congratulation template
    if (lastAiMsg.includes('congratulate') || (lastAiMsg.includes('Green') && lastAiMsg.includes('WhatsApp'))) {
      const greenMembers = members.filter(m => getMemberZone(m) === 'Green');
      const topGreen = greenMembers[0];
      const topName = topGreen ? getMemberName(topGreen) : 'Member';
      const topScore = topGreen ? getMemberScore(topGreen) : 0;
      return `💬 *WhatsApp Congratulation Template for Green Leaders*\n\n` +
        `Hi ${topName} 🌟\n\n` +
        `Congratulations! You are leading in the *GREEN Zone* with *${topScore}/100 points* in our *${orgName}* chapter! 🟢\n\n` +
        `Thank you for your outstanding contribution! Your dedication to 1-to-1 meetings and referrals is setting the benchmark. Keep up the incredible momentum! 🚀\n\n` +
        `❓ *Would you like me to customize this for each Green member individually?*`;
    }

    // Red zone support template
    if (lastAiMsg.includes('support invitation') || lastAiMsg.includes('support nudge') || (lastAiMsg.includes('Red') && (lastAiMsg.includes('draft') || lastAiMsg.includes('WhatsApp') || lastAiMsg.includes('invitation')))) {
      const redMembers = members.filter(m => getMemberZone(m) === 'Red');
      const topRed = redMembers[0];
      const redName = topRed ? getMemberName(topRed) : 'Member';
      const redScore = topRed ? getMemberScore(topRed) : 0;
      return `💬 *WhatsApp Support Template for Red Zone Members*\n\n` +
        `Hi ${redName} 👋\n\n` +
        `We noticed you are currently at *${redScore}/100 points* in our *${orgName}* chapter report.\n\n` +
        `We are here to support your business growth! Let us schedule a quick 1-to-1 catch-up call this week. Completing just 1 extra CEU module or booking 1 One-to-One meeting will start moving you towards the Green Zone! 💪\n\n` +
        `❓ *Would you like me to pair these Red members with Green zone mentors?*`;
    }

    // Check if previous AI message was about a specific member (e.g. Abhay Goenka)
    const memberInPrevMsg = members.find(m => {
      const name = getMemberName(m);
      return name && name.length > 2 && lastAiMsg.includes(name);
    });

    if (memberInPrevMsg) {
      const name = getMemberName(memberInPrevMsg);
      const score = getMemberScore(memberInPrevMsg);
      const zone = getMemberZone(memberInPrevMsg);
      const phone = getMemberPhone(memberInPrevMsg);

      return `💬 *WhatsApp Outreach Message for ${name}*\n` +
        `*Target Member:* ${name} (Score: ${score}/100 pts, ${zone} Zone | 📱 ${phone})\n\n` +
        `Hi ${name} 👋\n\n` +
        `Great effort in our recent ${availableReports[0] || 'PALMS'} performance report! You are currently at *${score}/100 points* in our *${orgName}* chapter.\n\n` +
        `You are just a few steps away from elevating your performance! 🚀 Completing 1 CEU module or booking 1 One-to-One meeting this week will boost your score.\n\n` +
        `Let us reach new heights together! 💪\n\n` +
        `❓ *Would you like me to generate an outreach template for another member or inspect chapter statistics?*`;
    }
  }

  const matchedMembers = members.filter(m => {
    const fullName = getMemberName(m).toLowerCase().trim();
    if (!fullName || fullName.length < 2) return false;
    // Exact full-name match
    if (lower.includes(fullName)) return true;
    // First-name or last-name partial match
    const nameParts = fullName.split(/\s+/);
    return nameParts.some((part: string) => part.length >= 3 && lower.includes(part));
  });
  const isTemplateRequest =
    lower.includes('template') ||
    lower.includes('draft message') ||
    lower.includes('create message') ||
    lower.includes('create template') ||
    lower.includes('nudge') ||
    lower.includes('whatsapp message') ||
    lower.includes('outreach message');

  if (isTemplateRequest && matchedMembers.length > 0) {
    const targetMember = matchedMembers[0];
    const name = getMemberName(targetMember);
    const score = getMemberScore(targetMember);
    const zone = getMemberZone(targetMember);
    const phone = getMemberPhone(targetMember);
    const emoji = getZoneEmoji(zone);

    return `💬 *WhatsApp Outreach Message Template for ${name}*\n` +
      `*Target Member:* ${name} (Score: ${emoji} ${score}/100 pts, ${zone} Zone | 📱 ${phone})\n\n` +
      `Hi ${name} 👋\n\n` +
      `Great effort in our recent performance report! You are currently at *${score}/100 points* (${zone} Zone) in our *${orgName}* chapter.\n\n` +
      `You are just a few steps away from elevating your performance! 🚀 Completing 1 CEU module or booking 1 One-to-One meeting this week will boost your score.\n\n` +
      `Let us reach new heights together! 💪\n\n` +
      `❓ *Would you like me to generate a 1-to-1 invitation template for another member or inspect chapter statistics?*`;
  }

  // 3. Multi-Member Comparison / Side-by-Side Analysis Query
  const isExplicitComparison =
    lower.includes('compare') ||
    lower.includes('comprasion') ||
    lower.includes('versus') ||
    lower.includes('vs') ||
    lower.includes('difference');

  if (
    isExplicitComparison &&
    matchedMembers.length >= 2 &&
    getMemberName(matchedMembers[0]).toLowerCase() !== getMemberName(matchedMembers[1]).toLowerCase()
  ) {
    const m1 = matchedMembers[0];
    const m2 = matchedMembers[1];

    const n1 = getMemberName(m1);
    const n2 = getMemberName(m2);
    const s1 = getMemberScore(m1);
    const s2 = getMemberScore(m2);
    const z1 = getMemberZone(m1);
    const z2 = getMemberZone(m2);
    const p1 = getMemberPhone(m1);
    const p2 = getMemberPhone(m2);

    const o1 = m1.OneToOnes || (m1 as any).one_to_ones || 0;
    const o2 = m2.OneToOnes || (m2 as any).one_to_ones || 0;

    const c1 = m1.CEU || (m1 as any).ceu || 0;
    const c2 = m2.CEU || (m2 as any).ceu || 0;

    const r1 = m1.ReferralsGivenRate ?? m1.RGT ?? (m1 as any).referrals_given ?? 0;
    const r2 = m2.ReferralsGivenRate ?? m2.RGT ?? (m2 as any).referrals_given ?? 0;

    const t1 = m1.TYFCB || (m1 as any).tyfcb || 0;
    const t2 = m2.TYFCB || (m2 as any).tyfcb || 0;

    return `📊 *Detailed Member Comparison: ${n1} vs ${n2}*\n` +
      `*Chapter:* ${orgName} | *Report:* ${m1.batch_name || (m1 as any).batch_name || 'Latest'}\n\n` +
      `👤 *1. ${n1}:*\n` +
      `• *PALMS Score:* ${getZoneEmoji(z1)} *${s1}/100 pts* (${z1} Zone)\n` +
      `• *1-to-1 Meetings:* ${formatDecimal(o1, 1)} / wk\n` +
      `• *CEU Credits:* ${formatDecimal(c1, 1)} / wk\n` +
      `• *Referrals Given:* ${formatDecimal(r1, 1)} / wk\n` +
      `• *TYFCB Business:* ${formatCurrency(t1)}\n` +
      `• *Phone Contact:* ${p1}\n\n` +
      `👤 *2. ${n2}:*\n` +
      `• *PALMS Score:* ${getZoneEmoji(z2)} *${s2}/100 pts* (${z2} Zone)\n` +
      `• *1-to-1 Meetings:* ${formatDecimal(o2, 1)} / wk\n` +
      `• *CEU Credits:* ${formatDecimal(c2, 1)} / wk\n` +
      `• *Referrals Given:* ${formatDecimal(r2, 1)} / wk\n` +
      `• *TYFCB Business:* ${formatCurrency(t2)}\n` +
      `• *Phone Contact:* ${p2}\n\n` +
      `💡 *Comparison Summary:*\n` +
      (s1 > s2
        ? `*${n1}* leads by *${s1 - s2} points* overall with higher score metrics.`
        : s2 > s1
        ? `*${n2}* leads by *${s2 - s1} points* overall with higher score metrics.`
        : `Both members are tied at *${s1} points*!`) +
      `\n\n❓ *Would you like me to generate a 1-to-1 invitation template to pair ${n1} and ${n2}?*`;
  }

  // 3. Full Member Directory Query
  if (
    lower.includes('member list') ||
    lower.includes('list members') ||
    lower.includes('all members') ||
    lower.includes('show members') ||
    lower.includes('members list') ||
    lower === 'members'
  ) {
    let res = `📋 *Full Member Directory for ${orgName} (${total} Members)*\n\n`;

    members.forEach((m, idx) => {
      const name = getMemberName(m);
      const score = getMemberScore(m);
      const zone = getMemberZone(m);
      const emoji = getZoneEmoji(zone);
      const phoneDisplay = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
      res += `${idx + 1}. *${name}* — ${emoji} ${score} pts${phoneDisplay}\n`;
    });

    res += `\n❓ *Would you like me to inspect 1-to-1s or CEU details for any member above?*`;
    return res;
  }

  // 4. Greetings & Capabilities Questions
  if (
    lower === 'hi' ||
    lower === 'hello' ||
    lower === 'hey' ||
    lower.includes('what can you do') ||
    lower.includes('help') ||
    lower.includes('who are you') ||
    lower.includes('capabilities')
  ) {
    return `👋 *Hello ${firstName}! I am Chapter AI for ${orgName}.*\n\n` +
      `Here is how I can assist you with your chapter data:\n\n` +
      `• 🔍 *Member Audits*: Ask about any member by name (e.g. *"How is Rahul doing?"*) for their score, 1-to-1s, and referrals.\n` +
      `• 📊 *Member Comparison*: Compare two members (e.g. *"Compare Abhay Goenka and Abhay Mehta"*).\n` +
      `• 📋 *Member List*: Ask for *"member list"* to view all ${total} chapter members.\n` +
      `• 🟢 *Green Zone Leaders*: View members with scores >= ${greenThreshold} pts.\n` +
      `• 🔴 *Red Zone Support*: View members needing outreach (Score < ${amberThreshold} pts).\n` +
      `• 🟡 *Amber Candidates*: View candidates close to Green status.\n` +
      `• 💰 *TYFCB Revenue*: Track closed business generated in ${orgName}.\n` +
      `• 📋 *Attendance Audit*: Track absences, substitutes, and medical leaves.\n` +
      `• 🎓 *CEU Education*: View CEU completion status and education leaderboard.\n` +
      `• 📄 *Report Batches*: List uploaded reports and compare report-over-report trends.\n` +
      `• 🏆 *Top/Bottom Scorer*: Find the highest or lowest scoring member.\n\n` +
      `❓ *What would you like me to look up for ${orgName} right now?*`;
  }

  // 5. Organization & User Profile Info Query
  if (
    lower.includes('organization') ||
    lower.includes('my name') ||
    lower.includes('org info') ||
    lower.includes('my info') ||
    lower.includes('chapter info') ||
    lower.includes('about my chapter') ||
    lower.includes('my profile')
  ) {
    const reportListStr = availableReports.length > 0 ? availableReports.join(', ') : 'Latest Report';

    return `🏢 *Chapter AI Summary for ${userName}*\n\n` +
      `👤 *Your Profile:* ${userName} (${category})\n` +
      `🏢 *Chapter:* ${orgName} (Code: ${orgCode} • ${orgCity})\n` +
      `📋 *Tracked Reports:* ${availableReports.length} (${reportListStr})\n\n` +
      `📊 *${orgName} Quick Stats:*\n` +
      `• *Total Tracked Members:* ${total} members\n` +
      `• *Average PALMS Score:* ${formatDecimal(avg, 1)} / 100 pts\n` +
      `• *Zone Breakdown:* 🟢 ${g} Green | 🟡 ${a} Amber | 🔴 ${r} Red\n` +
      `• *Total Business (TYFCB):* ${formatCurrency(tyfcb)}\n` +
      `• *Total 1-to-1 Meetings:* ${formatDecimal(total121, 1)} completed\n\n` +
      `❓ *Would you like me to list your chapter's Green leaders or check a specific member's scorecard?*`;
  }

  // 6. Direct Member Name Lookup (Single Member)
  const matchedMember = members.find(m => {
    const fullName = getMemberName(m).toLowerCase().trim();
    if (!fullName || fullName.length < 2) return false;
    if (lower.includes(fullName)) return true;
    const nameParts = fullName.split(/\s+/);
    return nameParts.some((part: string) => part.length >= 3 && lower.includes(part));
  });

  if (matchedMembers.length === 1 && matchedMember) {
    const name = getMemberName(matchedMember);
    const score = getMemberScore(matchedMember);
    const zone = getMemberZone(matchedMember);
    const emoji = getZoneEmoji(zone);
    const refs = matchedMember.ReferralsGivenRate ?? matchedMember.RGT ?? (matchedMember as any).referrals_given ?? 0;
    const oneToOnes = matchedMember.OneToOnes || (matchedMember as any).one_to_ones || 0;
    const ceu = matchedMember.CEU || (matchedMember as any).ceu || 0;
    const memberTyfcb = matchedMember.TYFCB || (matchedMember as any).tyfcb || 0;

    const phoneDisplay = canSeeContacts ? `📱 *Phone:* ${getMemberPhone(matchedMember)}\n\n` : '';
    const tyfcbDisplay = canSeeContacts
      ? `• *TYFCB Business:* ${formatCurrency(memberTyfcb)}\n\n`
      : `• *TYFCB Business:* 🔒 Restricted (Admins only)\n\n`;

    return `👤 *Member Record: ${name}*\n` +
      `*Chapter:* ${orgName} | *Report:* ${matchedMember.batch_name || (matchedMember as any).batch_name || 'Latest'}\n\n` +
      `📊 *Score:* ${emoji} *${score}/100 pts* (${zone} Zone)\n` +
      phoneDisplay +
      `📈 *Activity Summary:*\n` +
      `• *1-to-1 Meetings:* ${formatDecimal(oneToOnes, 1)} / wk\n` +
      `• *CEU Credits:* ${formatDecimal(ceu, 1)} / wk\n` +
      `• *Referrals Given:* ${formatDecimal(refs, 1)} / wk\n` +
      tyfcbDisplay +
      `❓ *Would you like me to generate a WhatsApp outreach message for ${name}?*`;
  }

  // 5.5 Multi-Member Disambiguation Counter-Question
  if (matchedMembers.length > 1 && !isExplicitComparison && !isTemplateRequest) {
    let res = `🔍 *I found ${matchedMembers.length} members matching your query in ${orgName}:*\n\n`;
    matchedMembers.forEach((m, idx) => {
      const name = getMemberName(m);
      const score = getMemberScore(m);
      const zone = getMemberZone(m);
      const emoji = getZoneEmoji(zone);
      res += `${idx + 1}. ${emoji} *${name}* — ${score}/100 pts (${zone} Zone)\n`;
    });
    res += `\n❓ *Which member would you like me to look up? Please type their full name.*`;
    return res;
  }

  // 7. Green Zone Query
  if (lower.includes('green') || lower.includes('top performer') || lower.includes('leader') || lower.includes('best member')) {
    const greenMembers = members.filter(m => getMemberZone(m) === 'Green');
    if (greenMembers.length === 0) {
      return `🟢 *Green Zone Audit (${orgName})*\n\nHi ${firstName}, no members are currently in the Green Zone for this report period.\n\n❓ *Would you like me to list the Amber candidates who are closest to Green?*`;
    }
    let res = `🟢 *${orgName} Green Zone Leaders (${greenMembers.length} Members)*\n\n`;
    greenMembers.forEach((m, idx) => {
      const name = getMemberName(m);
      const score = getMemberScore(m);
      const refs = m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0;
      const memberTyfcb = m.TYFCB || (m as any).tyfcb || 0;
      const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
      const tyfcbLine = canSeeContacts ? ` | TYFCB: ${formatCurrency(memberTyfcb)}` : '';
      res += `${idx + 1}. *${name}* — ${score} pts${contactLine}\n` +
        `   • 1-to-1s: ${formatDecimal(m.OneToOnes || (m as any).one_to_ones || 0, 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk${tyfcbLine}\n\n`;
    });
    res += `❓ *Would you like a draft WhatsApp message to congratulate these Green zone leaders?*`;
    return res;
  }

  // 8. Red Zone Support Query
  if (lower.includes('red') || lower.includes('support') || lower.includes('low score') || lower.includes('alert') || lower.includes('urgent')) {
    const redMembers = members.filter(m => getMemberZone(m) === 'Red');
    if (redMembers.length === 0) {
      return `🎉 *Red Zone Audit (${orgName})*\n\nGreat news ${firstName}! There are 0 members in the Red Zone.\n\n❓ *Would you like to inspect the Amber members to help them reach Green?*`;
    }
    let res = `🔴 *${orgName} Red Zone Support List (${redMembers.length} Members)*\n\n`;
    redMembers.forEach((m, idx) => {
      const name = getMemberName(m);
      const score = getMemberScore(m);
      const refs = m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0;
      const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
      res += `${idx + 1}. *${name}* — ${score}/100 pts${contactLine}\n` +
        `   • 1-to-1s: ${formatDecimal(m.OneToOnes || (m as any).one_to_ones || 0, 1)}/wk | CEUs: ${formatDecimal(m.CEU || (m as any).ceu || 0, 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk\n\n`;
    });
    res += `❓ *Should I draft a 1-to-1 support invitation for these members?*`;
    return res;
  }

  // 9. Amber Zone Query
  if (lower.includes('amber') || lower.includes('growth') || lower.includes('candidate')) {
    const amberMembers = members.filter(m => getMemberZone(m) === 'Amber');
    if (amberMembers.length === 0) {
      return `🟡 *Amber Zone Audit (${orgName})*\n\nHi ${firstName}, 0 members are currently in the Amber Zone.`;
    }
    let res = `🟡 *${orgName} Amber Zone Candidates (${amberMembers.length} Members)*\n\n`;
    amberMembers.forEach((m, idx) => {
      const name = getMemberName(m);
      const score = getMemberScore(m);
      const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
      res += `${idx + 1}. *${name}* — ${score}/100 pts${contactLine}\n` +
        `   • 1-to-1s: ${formatDecimal(m.OneToOnes || (m as any).one_to_ones || 0, 1)}/wk | CEUs: ${formatDecimal(m.CEU || (m as any).ceu || 0, 1)}/wk\n\n`;
    });
    res += `❓ *Would you like a WhatsApp nudge template to send to these Amber members?*`;
    return res;
  }

  // 10. TYFCB / Revenue / Business Query
  if (lower.includes('tyfcb') || lower.includes('business') || lower.includes('revenue') || lower.includes('money') || lower.includes('rupee')) {
    const totalTy = members.reduce((sum, m) => sum + (m.TYFCB || (m as any).tyfcb || 0), 0);

    if (!canSeeContacts) {
      // Go Green committee: show aggregate only, not per-member breakdown
      return `💰 *${orgName} TYFCB Business Summary*\n\n` +
        `📈 *Total Chapter Closed Business:* ${formatCurrency(totalTy)}\n` +
        `👥 *Contributing Members:* ${members.filter(m => (m.TYFCB || (m as any).tyfcb || 0) > 0).length} of ${members.length}\n\n` +
        `🔒 *Per-member TYFCB amounts are available to chapter Admins only.*\n\n` +
        `❓ *Would you like to see member scores or zone distribution instead?*`;
    }

    const sorted = [...members].sort((a, b) => (b.TYFCB || (b as any).tyfcb || 0) - (a.TYFCB || (a as any).tyfcb || 0));
    let res = `💰 *${orgName} TYFCB Business Leaders*\n\n`;
    sorted.slice(0, 10).forEach((m, idx) => {
      const name = getMemberName(m);
      const memberTyfcb = m.TYFCB || (m as any).tyfcb || 0;
      res += `${idx + 1}. *${name}* — ${formatCurrency(memberTyfcb)}\n`;
    });
    res += `\n📈 *Total Closed Business:* ${formatCurrency(totalTy)}\n\n` +
      `❓ *Would you like to see who passed the most referrals to generate this revenue?*`;
    return res;
  }

  // 11. 1-to-1 Meetings Query
  if (lower.includes('1-to-1') || lower.includes('1:1') || lower.includes('one to one') || lower.includes('meeting')) {
    const low121 = members.filter(m => (m.OneToOnes || (m as any).one_to_ones || 0) < 2);
    if (low121.length === 0) {
      return `🤝 *1-to-1 Meetings Audit*\n\nHi ${firstName}, all members in ${orgName} have completed 2 or more 1-to-1 meetings!`;
    }
    let res = `🤝 *1-to-1 Meetings Needed (${low121.length} Members)*\n\n`;
    low121.forEach((m, idx) => {
      const name = getMemberName(m);
      const count = m.OneToOnes || (m as any).one_to_ones || 0;
      const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
      res += `${idx + 1}. *${name}* — ${formatDecimal(count, 1)} meetings/wk${contactLine}\n`;
    });
    res += `\n❓ *Would you like me to pair these members with Green zone leaders for feature presentations?*`;
    return res;
  }

  // 12. Attendance & Absenteeism Audit Query
  if (lower.includes('attendance') || lower.includes('absent') || lower.includes('substitute') || lower.includes('late')) {
    const absentMembers = members.filter(m => (m.A || (m as any).absent || 0) > 0);
    const subMembers = members.filter(m => (m.S || (m as any).substitute || 0) > 0);

    let res = `📋 *Attendance & Absenteeism Audit (${orgName})*\n\n`;
    if (absentMembers.length > 0) {
      res += `🚨 *Members with Recorded Absences:*\n`;
      absentMembers.forEach((m, idx) => {
        const name = getMemberName(m);
        const abs = m.A || (m as any).absent || 0;
        const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
        res += `${idx + 1}. *${name}* — ${abs} Absences${contactLine}\n`;
      });
      res += `\n`;
    }

    if (subMembers.length > 0) {
      res += `👥 *Members utilizing Substitutes:*\n`;
      subMembers.forEach((m, idx) => {
        const name = getMemberName(m);
        const subs = m.S || (m as any).substitute || 0;
        res += `${idx + 1}. *${name}* — ${subs} Substitutes\n`;
      });
      res += `\n`;
    }

    if (absentMembers.length === 0 && subMembers.length === 0) {
      res += `🎉 100% Perfect Attendance recorded across all members in this report period!\n\n`;
    }

    res += `❓ *Would you like a friendly WhatsApp check-in message for absent members?*`;
    return res;
  }

  // 13. CEU Education & Training Audit Query
  if (lower.includes('ceu') || lower.includes('education') || lower.includes('credit') || lower.includes('training')) {
    const sortedCeu = [...members].sort((a, b) => (b.CEU || (b as any).ceu || 0) - (a.CEU || (a as any).ceu || 0));
    const lowCeu = members.filter(m => (m.CEU || (m as any).ceu || 0) < 1);

    let res = `🎓 *Chapter Education Units (CEU) Audit (${orgName})*\n\n` +
      `🏆 *Top CEU Achievers:*\n`;
    sortedCeu.slice(0, 5).forEach((m, idx) => {
      const name = getMemberName(m);
      const ceu = m.CEU || (m as any).ceu || 0;
      res += `${idx + 1}. *${name}* — ${formatDecimal(ceu, 1)} CEUs/wk\n`;
    });

    if (lowCeu.length > 0) {
      res += `\n⚠️ *Members Needing CEU Completion (${lowCeu.length} Members):*\n`;
      lowCeu.slice(0, 5).forEach((m, idx) => {
        const name = getMemberName(m);
        const contactLine = canSeeContacts ? ` (📱 ${getMemberPhone(m)})` : '';
        res += `• *${name}*${contactLine}\n`;
      });
    }

    res += `\n❓ *Would you like me to generate a BNI Business Builder podcast recommendation message for them?*`;
    return res;
  }

  // 14. Report Batches List Query
  if (lower.includes('report') || lower.includes('batches') || lower.includes('uploaded')) {
    const reports = availableReports.length > 0 ? availableReports : [];

    // If user explicitly asked to compare AND we have exactly 2 reports, run comparison immediately
    if (
      (lower.includes('compare') || lower.includes('compare those') || lower.includes('compare all') || lower.includes('compare both')) &&
      reports.length >= 2
    ) {
      return buildReportComparison(reports[reports.length - 1], reports[0]);
    }

    if (reports.length === 0) {
      return `📄 *No reports uploaded yet for ${orgName}.*\n\nPlease upload a PALMS Excel report to get started with analytics.\n\n❓ *Would you like guidance on how to upload a report?*`;
    }

    let res = `📊 *Available Chapter Performance Reports (${orgName})*\n\n`;
    reports.forEach((rep, idx) => {
      res += `${idx + 1}. 📄 *${rep}*\n`;
    });

    if (reports.length >= 2) {
      res += `\n💡 *Tip:* I can compare *${reports[reports.length - 1]}* vs *${reports[0]}* side-by-side!\n`;
      res += `\n❓ *Would you like me to compare these ${reports.length} reports side-by-side, or inspect one specific report?*`;
    } else {
      res += `\n❓ *Would you like me to inspect details for ${reports[0]}?*`;
    }
    return res;
  }

  // 15. Top Scorer / Lowest Scorer Lookup Query
  if (lower.includes('highest') || lower.includes('top scorer') || lower.includes('best score') || lower.includes('top member') || lower.includes('who is #1')) {
    const sorted = [...members].sort((a, b) => getMemberScore(b) - getMemberScore(a));
    if (sorted.length > 0) {
      const topM = sorted[0];
      const name = getMemberName(topM);
      const score = getMemberScore(topM);
      const zone = getMemberZone(topM);
      const contactLine = canSeeContacts ? `• *Phone Contact:* ${getMemberPhone(topM)}\n` : '';
      const tyfcbLine = canSeeContacts ? `• *TYFCB Business:* ${formatCurrency(topM.TYFCB || (topM as any).tyfcb || 0)}\n` : '';
      return `🏆 *Top Chapter Performer: ${name}*\n` +
        `*Chapter:* ${orgName}\n\n` +
        `• *PALMS Score:* 🟢 *${score}/100 pts* (${zone} Zone)\n` +
        contactLine +
        `• *1-to-1 Meetings:* ${formatDecimal(topM.OneToOnes || (topM as any).one_to_ones || 0, 1)}/wk\n` +
        `• *Referrals Given:* ${formatDecimal(topM.ReferralsGivenRate ?? topM.RGT ?? (topM as any).referrals_given ?? 0, 1)}/wk\n` +
        tyfcbLine +
        `\n❓ *Would you like to draft a WhatsApp message to congratulate ${name}?*`;
    }
  }

  if (lower.includes('lowest') || lower.includes('bottom') || lower.includes('lowest score')) {
    const sorted = [...members].sort((a, b) => getMemberScore(a) - getMemberScore(b));
    if (sorted.length > 0) {
      const botM = sorted[0];
      const name = getMemberName(botM);
      const score = getMemberScore(botM);
      const zone = getMemberZone(botM);
      const contactLine = canSeeContacts ? `• *Phone Contact:* ${getMemberPhone(botM)}\n` : '';
      return `🔴 *Member Needing Highest Support: ${name}*\n` +
        `*Chapter:* ${orgName}\n\n` +
        `• *PALMS Score:* 🔴 *${score}/100 pts* (${zone} Zone)\n` +
        contactLine +
        `• *1-to-1 Meetings:* ${formatDecimal(botM.OneToOnes || (botM as any).one_to_ones || 0, 1)}/wk\n\n` +
        `❓ *Would you like me to generate a 1-to-1 mentorship invitation template for ${name}?*`;
    }
  }

  // 16. Intelligent Disambiguation & Counter-Question on Unmatched / Vague Queries
  const sampleNames = Array.from(new Set(members.map(m => getMemberName(m)))).slice(0, 3);
  const sampleMembers = sampleNames.map(n => `*${n}*`).join(', ');

  return `📊 *Chapter AI Intelligence Overview for ${firstName}*\n` +
    `*Chapter:* ${orgName} | *Active Members:* ${total}\n\n` +
    `• *PALMS Average Score:* ${formatDecimal(avg, 1)} / 100 pts\n` +
    `• *Zone Distribution:* 🟢 ${g} Green | 🟡 ${a} Amber | 🔴 ${r} Red\n` +
    `• *Closed Revenue (TYFCB):* ${formatCurrency(tyfcb)}\n\n` +
    `💡 *I can look up any data for you. Would you like to:* \n` +
    `1. 🟢 View *Green Zone Leaders*\n` +
    `2. 🔴 View *Red Zone Support List*\n` +
    `3. 👤 Inspect a specific member (e.g. ${sampleMembers || 'Abhay Goenka'})\n` +
    `4. 📄 View *Report Batches* & comparison\n\n` +
    `❓ *What would you like me to analyze for ${orgName}?*`;
}
