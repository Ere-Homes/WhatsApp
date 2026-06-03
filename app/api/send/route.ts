import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsApp } from "@/lib/twilio";

// POST { phone: "+9715...", body: "text" }  -> sends via Twilio + logs to Supabase
export async function POST(req: NextRequest) {
  try {
    const { phone, body } = await req.json();
    if (!phone || !body) {
      return NextResponse.json({ error: "phone and body required" }, { status: 400 });
    }
    const e164 = String(phone).replace(/[^0-9+]/g, "");
    const db = supabaseAdmin();

    // upsert conversation
    const { data: conv } = await db
      .from("conversations")
      .upsert({ wa_phone: e164.replace("+", ""), last_body: body, last_at: new Date().toISOString() }, { onConflict: "wa_phone" })
      .select()
      .single();

    // send via Twilio
    const tw = await sendWhatsApp(e164, body);

    // log outbound message
    await db.from("messages").insert({
      conversation: conv!.id,
      direction: "out",
      body,
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
