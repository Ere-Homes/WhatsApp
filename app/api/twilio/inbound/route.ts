import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendWhatsApp } from "@/lib/twilio";

// Twilio posts incoming WhatsApp here (form-encoded).
// NOTE: only switch Twilio's inbound webhook to this once you retire Ulgebra inbound.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = String(form.get("From") || "").replace("whatsapp:", "");
  const body = String(form.get("Body") || "");
  const sid = String(form.get("MessageSid") || "");
  const phone = from.replace("+", "");
  const db = supabaseAdmin();

  // upsert conversation + log inbound
  const { data: conv } = await db
    .from("conversations")
    .upsert({ wa_phone: phone, last_body: body, last_at: new Date().toISOString() }, { onConflict: "wa_phone" })
    .select()
    .single();
  await db.from("messages").insert({
    conversation: conv!.id, direction: "in", body, status: "received", twilio_sid: sid,
  });

  // simple keyword automation (this is the part Pipedrive couldn't do)
  const text = body.trim().toUpperCase();
  if (text === "STOP") {
    await db.from("conversations").update({ status: "blocked" }).eq("id", conv!.id);
  } else if (text === "MANAGE") {
    const reply =
      "Great. Here is how ERE Property Management works:\n\n" +
      "Silver 2% a year: marketing, tenant sourcing and screening, contract and Ejari, rent collection, renewals.\n" +
      "Gold 5% a year: everything in Silver, plus a dedicated manager, inspections, maintenance coordination, vacant-home checks, and owner support.\n\n" +
      "Promo rates hold until June 6.\n\n" +
      "What is the property and area? Reply here and we will send a tailored quote, or share a number and we will call you.";
    try {
      const tw = await sendWhatsApp(from, reply);
      await db.from("messages").insert({ conversation: conv!.id, direction: "out", body: reply, status: tw.status, twilio_sid: tw.sid });
    } catch { /* within-24h reply may fail if window closed; ignore for prototype */ }
  }

  // empty TwiML 200 so Twilio is happy
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
