import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getContentMedia } from "@/lib/twilio";
import { dripBatchTimes, sendAtForIndex } from "@/lib/drip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Queue a drip campaign server-side. Writes one `messages` row per recipient
// with status='scheduled' and a computed scheduled_at — but does NOT call Twilio.
// The /api/cron/dispatch worker sends each row when it comes due. This replaces
// the old browser loop: it's one fast request that survives the tab closing,
// always schedules inside the 9am-8pm Dubai window, and is idempotent (a re-run
// or re-send never double-queues a recipient already in this campaign).
//
// POST { campaignId, contentSid, sender?, recipients:[{phone,vars?,body?}],
//        perBatch, intervalMin, daytime }
//   -> { enqueued, skipped, finishAt }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const { campaignId, contentSid, sender } = b;
    const recipients: { phone: string; vars?: Record<string, string>; body?: string }[] = b.recipients || [];
    const perBatch = Math.max(1, parseInt(String(b.perBatch || 50), 10));
    const intervalMin = Math.max(1, parseInt(String(b.intervalMin || 60), 10));
    const daytime = b.daytime !== false;

    if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    if (!contentSid) return NextResponse.json({ error: "contentSid required" }, { status: 400 });
    if (!Array.isArray(recipients) || recipients.length === 0)
      return NextResponse.json({ error: "recipients required" }, { status: 400 });

    const db = supabaseAdmin();

    // Header image is constant for the whole template — resolve once so every
    // queued row shows the creative in the inbox.
    const templateMedia = await getContentMedia(contentSid).catch(() => null);

    // Normalise to digit-only wa keys, keep input order, drop dupes/too-short.
    const seen = new Set<string>();
    const ordered: { wa: string; vars?: Record<string, string>; body?: string }[] = [];
    for (const r of recipients) {
      const wa = String(r.phone || "").replace(/[^0-9]/g, "");
      if (wa.length < 8 || seen.has(wa)) continue;
      seen.add(wa);
      ordered.push({ wa, vars: r.vars, body: r.body });
    }
    const phones = ordered.map((r) => r.wa);

    // Upsert conversations so every recipient has a row to hang the message on,
    // then read back ids + current suppression status.
    for (let i = 0; i < phones.length; i += 500) {
      const rows = phones.slice(i, i + 500).map((wa) => ({ wa_phone: wa }));
      await db.from("conversations").upsert(rows, { onConflict: "wa_phone", ignoreDuplicates: true });
    }
    const convByPhone = new Map<string, { id: string; status: string }>();
    for (let i = 0; i < phones.length; i += 500) {
      const { data } = await db.from("conversations").select("id, wa_phone, status").in("wa_phone", phones.slice(i, i + 500));
      for (const c of data || []) convByPhone.set((c as any).wa_phone, { id: (c as any).id, status: (c as any).status });
    }

    // Idempotency: skip anyone already queued/sent in THIS campaign (so a retry
    // of this endpoint, or a partial earlier run, never double-messages).
    const alreadyInCampaign = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("messages").select("conversation, status").eq("campaign", campaignId).range(from, from + 999);
      for (const m of data || []) if ((m as any).status !== "failed") alreadyInCampaign.add((m as any).conversation);
      if (!data || data.length < 1000) break;
    }

    // Filter to the recipients we'll actually queue (not suppressed, not already
    // in this campaign), preserving order so the drip pacing is contiguous.
    const toQueue = ordered.filter((r) => {
      const conv = convByPhone.get(r.wa);
      if (!conv) return false;
      if (conv.status === "blocked" || conv.status === "invalid") return false;
      if (alreadyInCampaign.has(conv.id)) return false;
      return true;
    });
    const skipped = ordered.length - toQueue.length;

    if (toQueue.length === 0) {
      return NextResponse.json({ enqueued: 0, skipped, finishAt: null });
    }

    // Compute the daytime-aware schedule and stamp each recipient's send time.
    const batches = Math.ceil(toQueue.length / perBatch);
    const times = dripBatchTimes(batches, intervalMin, daytime, new Date());
    const finishAt = times[times.length - 1].toISOString();

    const msgRows = toQueue.map((r, i) => ({
      conversation: convByPhone.get(r.wa)!.id,
      direction: "out",
      body: r.body || "[template]",
      status: "scheduled",
      scheduled_at: sendAtForIndex(i, perBatch, times),
      campaign: campaignId,
      content_sid: contentSid,
      content_vars: r.vars || null,
      media_url: templateMedia,
    }));
    for (let i = 0; i < msgRows.length; i += 500) {
      const { error } = await db.from("messages").insert(msgRows.slice(i, i + 500));
      if (error) throw error;
    }

    // Reflect the real queued total + finish time on the campaign row.
    await db.from("campaigns").update({
      total: toQueue.length,
      scheduled: toQueue.length,
      status: "scheduled",
      finish_at: finishAt,
      ...(sender ? { sender } : {}),
    }).eq("id", campaignId);

    return NextResponse.json({ enqueued: toQueue.length, skipped, finishAt });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Enqueue failed" }, { status: 500 });
  }
}
