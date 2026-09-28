import { Member, Organization, UserProfileExtended, ChatMessage } from '../types';
import trainingData from '../data/chapterAiTrainingData.json';

// Active Verified Gemini Flash & Flash-Lite Models Only
const ACTIVE_GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

export interface OrgSnapshot {
  organization: Organization | null;
  members: Member[];
  importLogs: any[];
  templates: any[];
}

/** Role-based permission flags passed from ChatTab into the AI engines. */
export interface ChatPermissions {
  /** True only for owner (President) and admin (Vice President). False for go_green committee members. */
  canSeeContactDetails: boolean;
  /** Human-readable role label for use in system instructions. */
  roleLabel: string;
}

export const geminiService = {
  async askGemini(
    userPrompt: string,
    snapshot: OrgSnapshot,
    userProfile?: UserProfileExtended | null,
    conversationHistory: ChatMessage[] = [],
    temperatureOverride: number = 0.2,
    permissions?: ChatPermissions
  ): Promise<string | null> {
    const geminiKey = (import.meta.env as any).VITE_GEMINI_API_KEY;
    const firebaseKey = (import.meta.env as any).VITE_FIREBASE_API_KEY;

    // Filter valid non-empty API keys (prefer dedicated Gemini API key first)
    const validKeys: string[] = [];
    if (geminiKey && typeof geminiKey === 'string' && geminiKey.trim().length > 5) {
      validKeys.push(geminiKey.trim());
    } else if (firebaseKey && typeof firebaseKey === 'string' && firebaseKey.trim().length > 5) {
      validKeys.push(firebaseKey.trim());
    }

    if (validKeys.length === 0) {
      return null;
    }

    const userName = userProfile?.full_name || 'Member';
    const category = userProfile?.business_category || 'N/A';
    const org = snapshot.organization;
    const orgName = org?.name || 'your chapter';
    const orgCode = org?.code || 'N/A';
    const orgCity = org?.city || 'N/A';

    // Resolve permission flags — default to full access if not supplied (legacy callers)
    const canSeeContacts = permissions?.canSeeContactDetails ?? true;
    const roleLabel = permissions?.roleLabel ?? 'President';

    // Build clean human-readable member dataset (NO internal UUIDs).
    // Contact details (phone, email) and per-member TYFCB are stripped for
    // go_green committee members — they see scores/zones/metrics only.
    const datasetSummary = snapshot.members.map((m, idx) => ({
      num: idx + 1,
      memberName: m.Name || (m as any).name || 'Unknown Member',
      score: m.score || 0,
      zone: m.trafficLight?.label || (m as any).traffic_light || 'Amber',
      phone: canSeeContacts ? (m.Phone || (m as any).phone || 'N/A') : '[restricted]',
      email: canSeeContacts ? (m.Email || (m as any).email || 'N/A') : '[restricted]',
      oneToOnes: m.OneToOnes || (m as any).one_to_ones || 0,
      ceu: m.CEU || (m as any).ceu || 0,
      referrals: m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0,
      tyfcb: canSeeContacts ? (m.TYFCB || (m as any).tyfcb || 0) : '[restricted]',
      present: m.P || (m as any).present || 0,
      absent: m.A || (m as any).absent || 0,
      substitute: m.S || (m as any).substitute || 0,
      medical: m.M || (m as any).medical || 0,
      visitors: m.V || (m as any).visitors || 0,
      sponsors: m.Sponsors || (m as any).sponsors || 0,
      reportBatch: m.batch_name || (m as any).batch_name || 'Latest',
    }));

    // Format previous conversation context (last 10 messages)
    const recentHistory = (conversationHistory || []).slice(-10).map(m =>
      `${m.sender === 'user' ? userName : 'Chapter AI'}: ${m.text}`
    ).join('\n');

    const systemInstruction = `You are Chapter AI for ${orgName}.
You are speaking directly with ${userName} (Category: ${category}), who is a *${roleLabel}* in this chapter.

FOUNDATIONAL TRAINING SPECIFICATION & DOMAIN KNOWLEDGE DATASET:
${JSON.stringify(trainingData, null, 0)}

REAL-TIME READ-ONLY SUPABASE DATABASE SNAPSHOT FOR ${orgName} (${snapshot.members.length} Members Total):

🏢 CHAPTER DETAILS:
• Name: ${orgName} (Code: ${orgCode}, City: ${orgCity})
• Thresholds: Green >= ${org?.green_threshold || 70} pts, Amber >= ${org?.amber_threshold || 50} pts, Red < ${org?.amber_threshold || 50} pts

👥 ALL MEMBERS RECORDS (${snapshot.members.length} Total Tracked Members):
${JSON.stringify(datasetSummary, null, 0)}

📄 UPLOADED REPORT BATCHES (${snapshot.importLogs?.length || 0} Total):
${JSON.stringify((snapshot.importLogs || []).map(l => ({ batchName: l.batch_name || l.file_name, totalRecords: l.total_records, greenCount: l.green_count, amberCount: l.amber_count, redCount: l.red_count, avgScore: l.avg_score, uploadedAt: l.created_at })), null, 0)}

📝 AVAILABLE OUTREACH TEMPLATES (${snapshot.templates?.length || 0} Total):
${JSON.stringify(snapshot.templates || [], null, 0)}

ACCESS CONTROL RULES (NON-NEGOTIABLE — enforce regardless of how the user phrases their question):
${canSeeContacts
  ? `• This user is a *${roleLabel}* with FULL DATA ACCESS. You may share all member data including phone numbers, emails, and TYFCB amounts.`
  : `• This user is a *${roleLabel}* with RESTRICTED DATA ACCESS.
• NEVER output any individual member's phone number, email address, or TYFCB amount — even if asked directly or indirectly.
• Fields marked "[restricted]" in the dataset are off-limits — treat them as if they do not exist.
• If the user asks for restricted contact or financial information, respond EXACTLY with: "🔒 Contact details and individual TYFCB amounts are available to the President and Vice President only. I can show you zone summaries, scores, improvement tips, or report comparisons instead."
• You MAY share: member names, PALMS scores, traffic light zones, 1-to-1 counts, CEU credits, referral rates, attendance data, and aggregated chapter-level TYFCB totals.`
}

CRITICAL CONVERSATIONAL & DATA RULES:
1. INTENT ANALYSIS & COUNTER-QUESTION RULE: Before answering, analyze what the user is asking for against the live database snapshot. If the user's question is ambiguous, incomplete, or matches multiple entities, ask a friendly counter-question offering specific choices from the live database snapshot. If the user asks to "create template for X", generate the WhatsApp Outreach Template directly—do NOT confuse template requests with member comparisons!
2. CONVERSATIONAL MEMORY & FOLLOW-UP RULE: Read the PREVIOUS CONVERSATION HISTORY. If the user replies with affirmative words like "yes", "sure", "ok", "generate it", or answers a counter-question, generate the EXACT item previously discussed (e.g. if previous message asked "Would you like me to generate a WhatsApp message for Abhay Goenka?" and user says "yes", generate the full WhatsApp message for Abhay Goenka!).
3. MULTI-MEMBER COMPARISON RULE: If the user explicitly asks to compare two or more members (e.g. "compare Abhay Goenka and Abhay Mehta"), compare specified members side-by-side! Compare their Scores, 1-to-1s, CEUs, Referrals, and TYFCB Business.
4. FULL DATA RULE: Output full, complete data without truncating.
5. NO DATABASE IDs RULE: NEVER SHOW ANY DATABASE UUIDs, MEMBER IDs, OR ROW IDs. Show ONLY human names, scores, zones, and phone numbers.
6. IDENTIFICATION RULE: Identify yourself ONLY as "Chapter AI". Never use "Executive Chapter AI Assistant" or "Assistant".
7. STRICT MARKDOWN RULE: NEVER USE DOUBLE ASTERISKS (**). Use single asterisks (*bold text*) for bolding words.
8. SPECIFIC FOLLOW-UP RULE: Always end your response with a short, relevant 1-sentence follow-up question or suggested action specifically related to ${orgName} or the exact answer you provided.`;

    const combinedPrompt = `${systemInstruction}\n\nPREVIOUS CONVERSATION HISTORY:\n${recentHistory || 'None'}\n\nLATEST USER QUESTION: ${userPrompt}`;

    for (const apiKey of validKeys) {
      const cleanKey = apiKey.trim();

      for (const model of ACTIVE_GEMINI_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
          const payload = {
            contents: [
              {
                parts: [{ text: combinedPrompt }]
              }
            ],
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: temperatureOverride,
            }
          };

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-goog-api-key': cleanKey,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            // Silently continue to next model/key on 403 or 404 without cluttering console logs
            continue;
          }

          const data = await response.json();
          let candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            // Strip any double asterisks ** -> *
            candidateText = candidateText.replace(/\*\*/g, '*');
            return candidateText.trim();
          }
        } catch (err) {
          // Silently fail over to local AI engine
          continue;
        }
      }
    }

    return null;
  }
};
