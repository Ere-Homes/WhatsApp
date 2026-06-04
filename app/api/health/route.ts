import { NextResponse } from "next/server";
import { twilioGet } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// WhatsApp sender health straight from Twilio/Meta: quality rating + the
// current messaging limit (tier). This is the best early warning that a number
// is about to be throttled. Meta sets these; Twilio only reports them.
// GET -> { senders: [{ sender, status, quality, limit }] }
export async function GET() {
  try {
    const data = await twilioGet("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp");
    const senders = (data?.senders || []).map((s: any) => ({
      sender: (s.sender_id || "").replace("whatsapp:", ""),
      status: s.status || null,                          // ONLINE | OFFLINE | ...
      quality: s.properties?.quality_rating || null,     // HIGH | MEDIUM | LOW
      limit: s.properties?.messaging_limit || null,      // e.g. "10K Customers/24hr"
    }));
    return NextResponse.json({ senders });
  } catch (e: any) {
    // Degrade gracefully — the dashboard just hides the panel if this fails.
    return NextResponse.json({ senders: [], error: e.message || "Unavailable" });
  }
}
