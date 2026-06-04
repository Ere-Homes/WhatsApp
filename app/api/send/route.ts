import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsApp, sendTemplate } from "@/lib/twilio";

// POST free-form: { phone, body }
// POST template:  { phone, contentSid, variables?, label? }  (works outside 24h window)
export async function POST(req: NextRequest) {
  try {
    const { phone, body, contentSid, variables, label, from } = await req.json();
    if (!phone || (!body && !contentSid)) {
      return NextResponse.json({ error: "phone and body (or contentSid) required" }, { status: 400 });
    }
    // What we store/show in the inbox bubble
    const displayBody = contentSid ? (label || "[template]") : body;
    const e164 = String(phone).replace(/[^0-9+]/g, "");
    const wa = e164.replace("+", "");
    const db = supabaseAdmin();

    // Blacklist guard — never message a contact who opted out (STOP/Unsubscribe)
    const { data: existing } = await db.from("conversations").select("status").eq("wa_phone", wa).maybeSingle();
    if (existing?.status === "blocked") {
      return NextResponse.json({ error: "This contact opted out (blacklisted). Message not sent." }, { status: 403 });
    }

    // upsert conversation
    const { data: conv } = await db
      .from("conversations")
      .upsert({ wa_phone: wa, last_body: displayBody, last_at: new Date().toISOString() }, { onConflict: "wa_phone" })
      .select()
      .single();

    // send via Twilio (template or free-form)
    const tw = contentSid ? await sendTemplate(e164, contentSid, variables, undefined, from) : await sendWhatsApp(e164, body, from);

    // log outbound message
    await db.from("messages").insert({
      conversation: conv!.id,
      direction: "out",
      body: displayBody,
      status: tw.status,
      twilio_sid: tw.sid,
    });

    // denormalize last-message status onto the conversation (for the inbox list)
    await db
      .from("conversations")
      .update({ last_direction: "out", last_status: tw.status, unread: false })
      .eq("id", conv!.id);

    return NextResponse.json({ ok: true, sid: tw.sid, status: tw.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
