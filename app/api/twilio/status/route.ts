import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Error codes that mean the number is permanently unusable on WhatsApp
// (not a marketing throttle). We suppress these so campaigns skip them.
const INVALID_NUMBER_CODES = ["63024", "63003", "21211", "21614"];

// Twilio StatusCallback - fires as an outbound message moves through
// queued -> sent -> delivered -> read (or failed/undelivered).
// Reachable from Twilio via the Vercel automation-bypass query param.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const sid = String(form.get("MessageSid") || form.get("SmsSid") || "");
    const status = String(form.get("MessageStatus") || form.get("SmsStatus") || "");
    const errorCode = String(form.get("ErrorCode") || "");
    if (sid && status) {
      const db = supabaseAdmin();
      const { data: msg } = await db
        .from("messages")
        .update({ status, error_code: errorCode || null })
        .eq("twilio_sid", sid)
        .select("conversation")
        .maybeSingle();
      if (msg?.conversation) {
        await db.from("conversations").update({ last_status: status, last_direction: "out" }).eq("id", msg.conversation);
        // Auto-suppress dead WhatsApp numbers (don't override an opt-out block).
        if ((status === "undelivered" || status === "failed") && INVALID_NUMBER_CODES.includes(errorCode)) {
          await db.from("conversations").update({ status: "invalid" }).eq("id", msg.conversation).neq("status", "blocked");
        }
      }
    }
  } catch {
    // never fail the callback - Twilio would just retry
  }
  return new NextResponse(null, { status: 204 });
}
