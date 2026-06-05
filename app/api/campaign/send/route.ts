import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTemplate, getContentMedia } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Send one batch of a campaign. The client loops batches so each request
// stays short. Template-only (works outside 24h), skips blacklisted, throttled.
// POST { recipients:[{phone,vars?}], contentSid, label, sendAt? }
export async function POST(req: NextRequest) {
  try {
    const { recipients, contentSid, label, sendAt, from, campaignId } = await req.json();
    if (!contentSid) return NextResponse.json({ error: "contentSid required" }, { status: 400 });
    if (!Array.isArray(recipients) || recipients.length === 0)
      return NextResponse.json({ error: "recipients required" }, { status: 400 });
    if (recipients.length > 25)
      return NextResponse.json({ error: "Max 25 recipients per batch" }, { status: 400 });

    const db = supabaseAdmin();

    // Resolve the template's header image once (constant for the whole batch) so
    // every logged message shows the creative in our inbox, not just text.
    const templateMedia = await getContentMedia(contentSid);

    // Skip opted-out (blocked) AND known-invalid (dead WhatsApp) numbers.
    const phones = recipients.map((r: any) => String(r.phone).replace(/[^0-9+]/g, "").replace("+", ""));
    const { data: suppressed } = await db.from("conversations").select("wa_phone, status").in("wa_phone", phones).in("status", ["blocked", "invalid"]);
    const blockedSet = new Set((suppressed || []).filter((b: any) => b.status === "blocked").map((b: any) => b.wa_phone));
    const invalidSet = new Set((suppressed || []).filter((b: any) => b.status === "invalid").map((b: any) => b.wa_phone));

    const results: any[] = [];
    for (const r of recipients) {
      const e164raw = String(r.phone).replace(/[^0-9+]/g, "");
      const e164 = e164raw.startsWith("+") ? e164raw : `+${e164raw}`;
      const wa = e164.replace("+", "");
      if (!wa || wa.length < 8) { results.push({ phone: r.phone, status: "invalid" }); continue; }
      if (blockedSet.has(wa)) { results.push({ phone: e164, status: "skipped_blacklist" }); continue; }
      if (invalidSet.has(wa)) { results.push({ phone: e164, status: "skipped_invalid" }); continue; }

      try {
        const tw = await sendTemplate(e164, contentSid, r.vars || undefined, sendAt || undefined, from || undefined);
        const { data: conv } = await db
          .from("conversations")
          .upsert({ wa_phone: wa, last_body: label || "[template]", last_at: new Date().toISOString() }, { onConflict: "wa_phone" })
          .select()
          .single();
        await db.from("messages").insert({ conversation: conv!.id, direction: "out", body: label || "[template]", status: tw.status, twilio_sid: tw.sid, campaign: campaignId || null, content_sid: contentSid || null, media_url: templateMedia });
        await db.from("conversations").update({ last_direction: "out", last_status: tw.status }).eq("id", conv!.id);
        results.push({ phone: e164, status: sendAt ? "scheduled" : (tw.status || "queued"), sid: tw.sid });
      } catch (e: any) {
        results.push({ phone: e164, status: "failed", error: e.message });
      }
      // gentle throttle
      await new Promise((res) => setTimeout(res, 250));
    }

    const sent = results.filter((r) => ["queued", "sent", "scheduled", "accepted"].includes(r.status)).length;
    return NextResponse.json({ results, sent, skipped: results.filter((r) => r.status === "skipped_blacklist").length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Campaign send failed" }, { status: 500 });
  }
}
