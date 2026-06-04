import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsApp } from "@/lib/twilio";
import { pushLeadFromWhatsApp } from "@/lib/pipedrive";

// Twilio posts incoming WhatsApp here (form-encoded).
// NOTE: only switch Twilio's inbound webhook to this once you retire Ulgebra inbound.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") || "").replace("whatsapp:", "");
  const body = String(form.get("Body") || "");
  const sid = String(form.get("MessageSid") || "");
  const profileName = String(form.get("ProfileName") || "").trim(); // WhatsApp display name
  const phone = from.replace("+", "");
  const db = supabaseAdmin();

  // upsert conversation + log inbound (capture WhatsApp profile name if present)
  const { data: conv } = await db
    .from("conversations")
    .upsert(
      { wa_phone: phone, last_body: body, last_at: new Date().toISOString(), ...(profileName ? { name: profileName } : {}) },
      { onConflict: "wa_phone" }
    )
    .select()
    .single();
  await db.from("messages").insert({
    conversation: conv!.id, direction: "in", body, status: "received", twilio_sid: sid,
  });
  // mark the conversation unread + last message inbound
  await db.from("conversations").update({ unread: true, last_direction: "in", last_status: "received" }).eq("id", conv!.id);

  // Button / keyword auto-reply rules (managed in /automation). Match the
  // tapped button text or typed keyword to an enabled rule, case-insensitive.
  const text = body.trim().toLowerCase();
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

  // empty TwiML 200 so Twilio is happy
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
