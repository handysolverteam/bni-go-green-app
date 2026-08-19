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

export const geminiService = {
  async askGemini(
    userPrompt: string,
    snapshot: OrgSnapshot,
    userProfile?: UserProfileExtended | null,
    conversationHistory: ChatMessage[] = [],
    temperatureOverride: number = 0.2
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

    // Build clean human-readable member dataset (NO internal UUIDs)
    const datasetSummary = snapshot.members.map((m, idx) => ({
      num: idx + 1,
      memberName: m.Name || (m as any).name || 'Unknown Member',
      score: m.score || 0,
      zone: m.trafficLight?.label || (m as any).traffic_light || 'Amber',
      phone: m.Phone || (m as any).phone || 'N/A',
      oneToOnes: m.OneToOnes || (m as any).one_to_ones || 0,
      ceu: m.CEU || (m as any).ceu || 0,
      referrals: m.ReferralsGivenRate ?? m.RGT ?? (m as any).referrals_given ?? 0,
      tyfcb: m.TYFCB || (m as any).tyfcb || 0,
      reportBatch: m.batch_name || (m as any).batch_name || 'Latest',
    }));

    // Format previous conversation context (last 10 messages)
    const recentHistory = (conversationHistory || []).slice(-10).map(m =>
      `${m.sender === 'user' ? userName : 'Chapter AI'}: ${m.text}`
    ).join('\n');

    const systemInstruction = `You are Chapter AI for ${orgName}.
You are speaking directly with ${userName} (Category: ${category}).

FOUNDATIONAL TRAINING SPECIFICATION & DOMAIN KNOWLEDGE DATASET:
${JSON.stringify(trainingData, null, 0)}

REAL-TIME READ-ONLY SUPABASE DATABASE SNAPSHOT FOR ${orgName} (${snapshot.members.length} Members Total):

🏢 CHAPTER DETAILS:
• Name: ${orgName} (Code: ${orgCode}, City: ${orgCity})
• Thresholds: Green >= ${org?.green_threshold || 70} pts, Amber >= ${org?.amber_threshold || 50} pts, Red < ${org?.amber_threshold || 50} pts

👥 ALL MEMBERS RECORDS (${snapshot.members.length} Total Tracked Members):
${JSON.stringify(datasetSummary, null, 0)}

CRITICAL CONVERSATIONAL & DATA RULES:
1. CONVERSATIONAL MEMORY & FOLLOW-UP RULE: Read the PREVIOUS CONVERSATION HISTORY. If the user replies with affirmative words like "yes", "sure", "ok", "generate it", or answers a counter-question, generate the EXACT item previously discussed (e.g. if previous message asked "Would you like me to generate a WhatsApp message for Abhay Goenka?" and user says "yes", generate the full WhatsApp message for Abhay Goenka!).
2. MULTI-MEMBER COMPARISON RULE: If the user asks to compare two or more members (e.g. "compare Abhay Goenka and Abhay Mehta"), compare ALL specified members side-by-side! Compare their Scores, 1-to-1s, CEUs, Referrals, and TYFCB Business.
3. FULL DATA RULE: Output full, complete data without truncating.
4. NO DATABASE IDs RULE: NEVER SHOW ANY DATABASE UUIDs, MEMBER IDs, OR ROW IDs. Show ONLY human names, scores, zones, and phone numbers.
5. IDENTIFICATION RULE: Identify yourself ONLY as "Chapter AI". Never use "Executive Chapter AI Assistant" or "Assistant".
6. STRICT MARKDOWN RULE: NEVER USE DOUBLE ASTERISKS (**). Use single asterisks (*bold text*) for bolding words.
7. SPECIFIC FOLLOW-UP RULE: Always end your response with a short, relevant 1-sentence follow-up question or suggested action specifically related to ${orgName} or the exact answer you provided.`;

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
          break;
        }
      }
    }

    return null;
  }
};
