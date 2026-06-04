import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsApp } from "@/lib/twilio";
import { pushLeadFromWhatsApp } from "@/lib/pipedrive";
import { logConversationToPipedrive } from "@/lib/pipedriveSync";

// Twilio posts incoming WhatsApp here (form-encoded).
// NOTE: only switch Twilio's inbound webhook to this once you retire Ulgebra inbound.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") || "").replace("whatsapp:", "");
  const body = String(form.get("Body") || "");
  const sid = String(form.get("MessageSid") || "");
  const profileName = String(form.get("ProfileName") || "").trim(); // WhatsApp display name
  const numMedia = parseInt(String(form.get("NumMedia") || "0"), 10) || 0;
  const mediaUrl = numMedia > 0 ? String(form.get("MediaUrl0") || "") : "";
  const phone = from.replace("+", "");
  const displayBody = body || (mediaUrl ? "[media]" : "");
  const db = supabaseAdmin();

  // upsert conversation + log inbound (capture WhatsApp profile name if present)
  const { data: conv } = await db
    .from("conversations")
    .upsert(
      { wa_phone: phone, last_body: displayBody, last_at: new Date().toISOString(), ...(profileName ? { name: profileName } : {}) },
      { onConflict: "wa_phone" }
    )
    .select()
    .single();
  await db.from("messages").insert({
    conversation: conv!.id, direction: "in", body: displayBody, status: "received", twilio_sid: sid, media_url: mediaUrl || null,
  });
  // mark the conversation unread + last message inbound
  await db.from("conversations").update({ unread: true, last_direction: "in", last_status: "received" }).eq("id", conv!.id);

  const text = body.trim().toLowerCase();

  // Opt-out safety net - STOP/Unsubscribe etc. ALWAYS blacklist, rule or not.
  const OPT_OUT = ["stop", "unsubscribe", "unsub", "cancel", "stop promotions", "opt out", "optout", "remove me"];
  if (OPT_OUT.includes(text)) {
    await db.from("conversations").update({ status: "blocked" }).eq("id", conv!.id);
  }

  // Button / keyword auto-reply rules (set per-button when creating a template).
  // Match the tapped button text or typed keyword to an enabled rule.
  try {
    const { data: rules } = await db.from("auto_replies").select("*").eq("enabled", true);
    const rule = (rules || []).find((r: any) => (r.trigger || "").trim().toLowerCase() === text);
    if (rule) {
      if (rule.block) {
        await db.from("conversations").update({ status: "blocked" }).eq("id", conv!.id);
      }
      if (rule.reply) {
        try {
          const tw = await sendWhatsApp(from, rule.reply);
          await db.from("messages").insert({ conversation: conv!.id, direction: "out", body: rule.reply, status: tw.status, twilio_sid: tw.sid });
          await db.from("conversations").update({ last_direction: "out", last_status: tw.status, last_body: rule.reply }).eq("id", conv!.id);
        } catch { /* 24h window may be closed; ignore */ }
      }
      if (rule.push_pipedrive) {
        try {
          await pushLeadFromWhatsApp({
            phone: from,
            name: profileName || undefined,
            note: `Auto-pushed from ERE WhatsApp (tapped "${body.trim()}").`,
          });
        } catch { /* don't fail the webhook on Pipedrive errors */ }
      }
    }
  } catch { /* never fail the inbound webhook */ }

  // Keep the Pipedrive transcript note current (best-effort; only if linked).
  await logConversationToPipedrive(conv!.id);

  // empty TwiML 200 so Twilio is happy
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
