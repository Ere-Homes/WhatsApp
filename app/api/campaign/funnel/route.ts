import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Per-campaign delivery funnel from our own message log (WhatsApp receipts
// update messages.status, not the campaign rollup). Returns counts + rates so
// the campaign log can show Delivered/Read at a glance, not just "sent".
// GET -> { funnel: { [campaignId]: { sent, delivered, read, failed, deliveryRate, readRate } } }
export async function GET() {
  try {
    const db = supabaseAdmin();
    const agg: Record<string, { sent: number; delivered: number; read: number; failed: number; reasons: Record<string, number> }> = {};

    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("messages")
        .select("campaign, status, error_code")
        .not("campaign", "is", null)
        .eq("direction", "out")
        .range(from, from + 999);
      if (error) throw error;
      for (const m of (data as any[]) || []) {
        const a = (agg[m.campaign] ||= { sent: 0, delivered: 0, read: 0, failed: 0, reasons: {} });
        const s = m.status;
        if (s === "failed" || s === "undelivered") {
          a.failed++;
          // Tally the Twilio error code so the log can say WHY it failed, not just "failed".
          const code = m.error_code ? String(m.error_code) : "unknown";
          a.reasons[code] = (a.reasons[code] || 0) + 1;
        } else {
          a.sent++; // reached WhatsApp (queued/sent/delivered/read/accepted)
          if (s === "read") { a.read++; a.delivered++; }
          else if (s === "delivered") a.delivered++;
        }
      }
      if (!data || data.length < 1000) break;
    }

    const funnel: Record<string, any> = {};
    for (const [id, a] of Object.entries(agg)) {
      // Delivery rate = of messages that actually RESOLVED (delivered or failed),
      // how many reached a handset. Still-scheduled/queued messages have no receipt
      // yet, so counting them in the denominator deflates the rate mid-flight.
      const resolved = a.delivered + a.failed;
      funnel[id] = {
        ...a,
        deliveryRate: resolved ? Math.round((a.delivered / resolved) * 100) : 0,
        readRate: a.delivered ? Math.round((a.read / a.delivered) * 100) : 0,
      };
    }
    return NextResponse.json({ funnel });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to compute funnel" }, { status: 500 });
  }
}
