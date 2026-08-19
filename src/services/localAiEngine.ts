import { Member, Organization, UserProfileExtended, ChatMessage } from '../types';
import { formatDecimal, formatCurrency } from '../lib/numberUtils';
import { OrgSnapshot } from './geminiService';

export function analyzeLocalChapterQuery(
  prompt: string,
  snapshot: OrgSnapshot,
  userProfile?: UserProfileExtended | null,
  conversationHistory: ChatMessage[] = []
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

  const availableReports = importLogs.map(l => l.batch_name).filter(Boolean);

  // Helper functions
  const getMemberName = (m: any) => m.Name || m.name || 'Member';
  const getMemberPhone = (m: any) => m.Phone || m.phone || 'N/A';
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

  // 1. Affirmative Response to previous AI counter-question ("yes", "sure", "ok", "do it", "yeah", "generate")
  const isAffirmative = ['yes', 'sure', 'ok', 'yeah', 'yep', 'do it', 'generate', 'send', 'please', 'go ahead'].includes(lower);

  if (isAffirmative && conversationHistory && conversationHistory.length > 0) {
    const aiMessages = conversationHistory.filter(m => m.sender === 'ai');
    const lastAiMsg = aiMessages[aiMessages.length - 1]?.text || '';

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

    if (lastAiMsg.includes('Green leaders') || lastAiMsg.includes('Green Zone')) {
      const greenMembers = members.filter(m => getMemberZone(m) === 'Green');
      let res = `🟢 *${orgName} Green Zone Leaders (${greenMembers.length} Members)*\n\n`;
      greenMembers.forEach((m, idx) => {
        const name = getMemberName(m);
        const phone = getMemberPhone(m);
        const score = getMemberScore(m);
        res += `${idx + 1}. *${name}* — ${score} pts (📱 ${phone})\n`;
      });
      res += `\n❓ *Would you like a draft WhatsApp message to congratulate these Green leaders?*`;
      return res;
    }

    if (lastAiMsg.includes('Red') || lastAiMsg.includes('support list')) {
      const redMembers = members.filter(m => getMemberZone(m) === 'Red');
      let res = `🔴 *${orgName} Red Zone Support List (${redMembers.length} Members)*\n\n`;
      redMembers.forEach((m, idx) => {
        const name = getMemberName(m);
        const phone = getMemberPhone(m);
        const score = getMemberScore(m);
        res += `${idx + 1}. *${name}* — ${score}/100 pts (📱 ${phone})\n`;
      });
      res += `\n❓ *Should I draft a 1-to-1 support invitation for these members?*`;
      return res;
    }
  }

  // 2. Multi-Member Comparison / Side-by-Side Analysis Query
  const matchedMembers = members.filter(m => {
    const name = getMemberName(m).toLowerCase();
    return name && name.length > 2 && lower.includes(name);
  });

  if (
    (lower.includes('compare') || lower.includes('comprasion') || lower.includes('versus') || lower.includes('vs') || matchedMembers.length >= 2) &&
    matchedMembers.length >= 2
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
      const phone = getMemberPhone(m);
      const score = getMemberScore(m);
      const zone = getMemberZone(m);
      const emoji = getZoneEmoji(zone);
      res += `${idx + 1}. *${name}* — ${emoji} ${score} pts (📱 ${phone})\n`;
    });

    res += `\n❓ *Would you like me to inspect 1-to-1s or TYFCB business details for any member above?*`;
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
      `• 💰 *TYFCB Revenue*: Track closed business generated in ${orgName}.\n\n` +
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
    const name = getMemberName(m).toLowerCase();
    return name && name.length > 2 && lower.includes(name);
  });

  if (matchedMember) {
    const name = getMemberName(matchedMember);
    const phone = getMemberPhone(matchedMember);
    const score = getMemberScore(matchedMember);
    const zone = getMemberZone(matchedMember);
    const emoji = getZoneEmoji(zone);
    const refs = matchedMember.ReferralsGivenRate ?? matchedMember.RGT ?? (matchedMember as any).referrals_given ?? 0;
    const oneToOnes = matchedMember.OneToOnes || (matchedMember as any).one_to_ones || 0;
    const ceu = matchedMember.CEU || (matchedMember as any).ceu || 0;
    const memberTyfcb = matchedMember.TYFCB || (matchedMember as any).tyfcb || 0;

    return `👤 *Member Record: ${name}*\n` +
      `*Chapter:* ${orgName} | *Report:* ${matchedMember.batch_name || (matchedMember as any).batch_name || 'Latest'}\n\n` +
      `📊 *Score:* ${emoji} *${score}/100 pts* (${zone} Zone)\n` +
      `📱 *Phone:* ${phone}\n\n` +
      `📈 *Activity Summary:*\n` +
      `• *1-to-1 Meetings:* ${formatDecimal(oneToOnes, 1)} / wk\n` +
      `• *CEU Credits:* ${formatDecimal(ceu, 1)} / wk\n` +
      `• *Referrals Given:* ${formatDecimal(refs, 1)} / wk\n` +
      `• *TYFCB Business:* ${formatCurrency(memberTyfcb)}\n\n` +
      `❓ *Would you like me to generate a WhatsApp outreach message for ${name}?*`;
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
      const phone = getMemberPhone(m);
      const score = getMemberScore(m);
      const refs = m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0;
      const memberTyfcb = m.TYFCB || (m as any).tyfcb || 0;
      res += `${idx + 1}. *${name}* — ${score} pts (📱 ${phone})\n` +
        `   • 1-to-1s: ${formatDecimal(m.OneToOnes || (m as any).one_to_ones || 0, 1)}/wk | Referrals: ${formatDecimal(refs, 1)}/wk | TYFCB: ${formatCurrency(memberTyfcb)}\n\n`;
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
      const phone = getMemberPhone(m);
      const score = getMemberScore(m);
      const refs = m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0;
      res += `${idx + 1}. *${name}* — ${score}/100 pts (📱 ${phone})\n` +
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
      const phone = getMemberPhone(m);
      const score = getMemberScore(m);
      res += `${idx + 1}. *${name}* — ${score}/100 pts (📱 ${phone})\n` +
        `   • 1-to-1s: ${formatDecimal(m.OneToOnes || (m as any).one_to_ones || 0, 1)}/wk | CEUs: ${formatDecimal(m.CEU || (m as any).ceu || 0, 1)}/wk\n\n`;
    });
    res += `❓ *Would you like a WhatsApp nudge template to send to these Amber members?*`;
    return res;
  }

  // 10. TYFCB / Revenue / Business Query
  if (lower.includes('tyfcb') || lower.includes('business') || lower.includes('revenue') || lower.includes('money') || lower.includes('rupee')) {
    const sorted = [...members].sort((a, b) => (b.TYFCB || (b as any).tyfcb || 0) - (a.TYFCB || (a as any).tyfcb || 0));
    const totalTy = members.reduce((sum, m) => sum + (m.TYFCB || (m as any).tyfcb || 0), 0);
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
      const phone = getMemberPhone(m);
      const count = m.OneToOnes || (m as any).one_to_ones || 0;
      res += `${idx + 1}. *${name}* — ${formatDecimal(count, 1)} meetings/wk (📱 ${phone})\n`;
    });
    res += `\n❓ *Would you like me to pair these members with Green zone leaders for feature presentations?*`;
    return res;
  }

  // 12. Draft WhatsApp Message Query
  if (lower.includes('draft') || lower.includes('nudge') || lower.includes('whatsapp message')) {
    return `💬 *WhatsApp Outreach Template*\n\n` +
      `Hi {{member_name}} 👋\n\n` +
      `Great effort in our recent ${availableReports[0] || 'PALMS'} performance report! You are currently at *{{score}}/100 points*.\n\n` +
      `You are just a few steps away from elevating into the *GREEN Zone*! 🚀 Completing 1 CEU module or booking 1 One-to-One meeting this week will boost your score.\n\n` +
      `Let us reach Green together! 💪\n\n` +
      `❓ *Would you like me to customize this template for Green, Amber, or Red members?*`;
  }

  // 13. Specific Default Reply
  return `📊 *Chapter AI Overview for ${firstName}*\n` +
    `*Chapter:* ${orgName} | *Active Members:* ${total}\n\n` +
    `• *PALMS Average Score:* ${formatDecimal(avg, 1)} / 100 pts\n` +
    `• *Zone Distribution:* 🟢 ${g} Green | 🟡 ${a} Amber | 🔴 ${r} Red\n` +
    `• *Closed Revenue (TYFCB):* ${formatCurrency(tyfcb)}\n\n` +
    `❓ *What specific detail would you like me to look up for ${orgName}? (e.g. type "Green members", "TYFCB", or type any member's name)*`;
}
