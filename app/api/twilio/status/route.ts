import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio StatusCallback — fires as an outbound message moves through
// queued -> sent -> delivered -> read (or failed/undelivered).
// Reachable from Twilio via the Vercel automation-bypass query param.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sid = String(form.get("MessageSid") || form.get("SmsSid") || "");
    const status = String(form.get("MessageStatus") || form.get("SmsStatus") || "");
    if (sid && status) {
      const db = supabaseAdmin();
      const { data: msg } = await db
        .from("messages")
        .update({ status })
        .eq("twilio_sid", sid)
        .select("conversation")
        .maybeSingle();
      if (msg?.conversation) {
        await db.from("conversations").update({ last_status: status, last_direction: "out" }).eq("id", msg.conversation);
      }
    }
  } catch {
    // never fail the callback — Twilio would just retry
  }
  return new NextResponse("", { status: 204 });
}
