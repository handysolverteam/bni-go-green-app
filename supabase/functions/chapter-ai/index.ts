// Chapter AI, server side. Replaces the browser-side Gemini call in src/services/geminiService.ts.
//
// Two reasons this moved off the client (2026-10-10):
//   1. The API key lived in the website bundle as VITE_GEMINI_API_KEY, so anyone could extract
//      and spend it. Here it is a Supabase secret (GEMINI_API_KEY) and never leaves the server.
//   2. Permissions were enforced by *asking the model* not to reveal things, with the whole
//      chapter dataset pasted into the prompt regardless of who was asking. A prompt is not an
//      access control. Now the caller's tier is resolved from the database first and the prompt
//      is built from only the rows that caller is allowed to see -- restricted data is never
//      sent to Google at all.
//
// Tiers (mirrors the RLS helpers in migrations 008b/009):
//   full   -> President/VP of this org, Go Green committee, or Platform Admin: whole roster.
//             Contact details + per-member TYFCB only for President/VP/Platform Admin.
//   self   -> plain Member: only roster rows linked to their own account.
//   none   -> not a member of this org: refused.
//
// Deploy: supabase functions deploy chapter-ai   (verify_jwt = false in config.toml -- the
// bearer is a Firebase ID token, verified below, not a Supabase JWT.)

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebaseIdToken } from "../_shared/firebaseAdmin.ts";
import { extractErrorMessage } from "../_shared/renewals/error-message.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];

interface Tier {
  scope: "full" | "self" | "none";
  canSeeContacts: boolean;
  roleLabel: string;
}

async function resolveTier(admin: SupabaseClient, uid: string, orgId: string): Promise<Tier> {
  const [{ data: membership }, { data: committees }, { data: platformAdmin }] = await Promise.all([
    admin.from("org_members").select("role").eq("org_id", orgId).eq("user_id", uid).maybeSingle(),
    admin.from("member_committees").select("committee").eq("org_id", orgId).eq("user_id", uid),
    admin.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
  ]);

  if (platformAdmin) return { scope: "full", canSeeContacts: true, roleLabel: "Platform Admin" };
  if (!membership) return { scope: "none", canSeeContacts: false, roleLabel: "Not a member" };

  const role = membership.role as string;
  if (role === "owner") return { scope: "full", canSeeContacts: true, roleLabel: "President" };
  if (role === "admin") return { scope: "full", canSeeContacts: true, roleLabel: "Vice President" };

  const isGoGreen = (committees ?? []).some((c) => c.committee === "go_green");
  if (isGoGreen) return { scope: "full", canSeeContacts: false, roleLabel: "Go Green Committee" };

  return { scope: "self", canSeeContacts: true, roleLabel: "Member" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = req.headers.get("Authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!idToken) return json({ error: "Sign in required." }, 401);

  let uid: string;
  try {
    ({ uid } = await verifyFirebaseIdToken(idToken));
  } catch {
    return json({ error: "Sign in required." }, 401);
  }

  try {
    const { orgId, question, history } = (await req.json()) as {
      orgId?: string;
      question?: string;
      history?: Array<{ sender: string; text: string }>;
    };
    if (!orgId || !question?.trim()) return json({ error: "orgId and question are required." }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    // Distinct signal, not an error: the client falls back to its built-in engine.
    if (!geminiKey) return json({ unavailable: "no_key" }, 200);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tier = await resolveTier(admin, uid, orgId);
    if (tier.scope === "none") return json({ error: "You do not have access to this chapter." }, 403);

    const [{ data: org }, { data: rosterRows }, { data: logs }] = await Promise.all([
      admin.from("organizations").select("name, code, city, green_threshold, amber_threshold").eq("id", orgId).maybeSingle(),
      tier.scope === "full"
        ? admin.from("members").select("name, phone, email, score, traffic_light, present, absent, substitute, medical, one_to_ones, ceu, referrals_given, tyfcb, visitors, sponsors, batch_name").eq("org_id", orgId).order("score", { ascending: false })
        : admin.from("members").select("name, phone, email, score, traffic_light, present, absent, substitute, medical, one_to_ones, ceu, referrals_given, tyfcb, visitors, sponsors, batch_name").eq("org_id", orgId).eq("user_id", uid),
      admin.from("import_logs").select("batch_name, total_records, green_count, amber_count, red_count, avg_score, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
    ]);

    // Strip what this caller may not see BEFORE the prompt is built, so restricted values are
    // never sent to Google -- not merely "hidden" by an instruction the model might ignore.
    const dataset = (rosterRows ?? []).map((m, idx) => ({
      n: idx + 1,
      name: m.name,
      score: m.score ?? 0,
      zone: m.traffic_light ?? "Amber",
      oneToOnes: m.one_to_ones ?? 0,
      ceu: m.ceu ?? 0,
      referrals: m.referrals_given ?? 0,
      visitors: m.visitors ?? 0,
      sponsors: m.sponsors ?? 0,
      present: m.present ?? 0,
      absent: m.absent ?? 0,
      report: m.batch_name ?? "Latest",
      ...(tier.canSeeContacts
        ? { phone: m.phone ?? "N/A", email: m.email ?? "N/A", tyfcb: m.tyfcb ?? 0 }
        : {}),
    }));

    const selfNote =
      tier.scope === "self"
        ? dataset.length === 0
          ? `\nIMPORTANT: this Member's account is not yet linked to their roster entry, so you have NO performance data for them. Tell them plainly that their account needs to be linked by a chapter Admin before you can show their scores, and offer general BNI/PALMS guidance meanwhile. Do not speculate about their numbers.`
          : `\nIMPORTANT: this is a Member viewing ONLY their own data. You have no data about anyone else. If they ask about other members, chapter rankings, or comparisons, say that is only available to chapter leadership, and offer to analyse their own performance instead. Never invent other members.`
        : "";

    const contactNote = tier.canSeeContacts
      ? ""
      : `\nIMPORTANT: phone numbers, email addresses and per-member TYFCB are NOT in your data and must never be guessed or implied. If asked, say those are available to the President and Vice President only.`;

    const prompt = `You are Chapter AI for ${org?.name ?? "this BNI chapter"}, speaking with a ${tier.roleLabel}.

CHAPTER: ${org?.name ?? "N/A"} (code ${org?.code ?? "N/A"}, ${org?.city ?? "N/A"})
Zones: Green >= ${org?.green_threshold ?? 70} pts, Amber >= ${org?.amber_threshold ?? 50} pts, Red below that.

MEMBER DATA (${dataset.length} row${dataset.length === 1 ? "" : "s"}, already filtered to what this user may see):
${JSON.stringify(dataset)}

REPORT BATCHES:
${JSON.stringify(logs ?? [])}
${selfNote}${contactNote}

RULES:
- Answer ONLY from the data above. If it is not there, say so plainly rather than estimating.
- Be direct and specific. Lead with the answer, then brief supporting detail.
- Use *single asterisks* for bold, never double. Keep it scannable: short lines, no long paragraphs.
- Never output database IDs.
- Call yourself "Chapter AI".
- End with one short, relevant follow-up question.

CONVERSATION SO FAR:
${(history ?? []).slice(-8).map((m) => `${m.sender === "user" ? "User" : "Chapter AI"}: ${m.text}`).join("\n") || "(new conversation)"}

USER'S QUESTION: ${question}`;

    for (const model of GEMINI_MODELS) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text?.trim()) {
        return json({ reply: text.replace(/\*\*/g, "*").trim(), model, scope: tier.scope }, 200);
      }
    }

    // Every model refused or errored -- let the client fall back rather than showing an error.
    return json({ unavailable: "no_model" }, 200);
  } catch (err) {
    return json({ error: extractErrorMessage(err, "Chapter AI failed.") }, 500);
  }
});
