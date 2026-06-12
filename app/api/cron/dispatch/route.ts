import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTemplate } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many due messages to send per run. 60 * ~0.6s (Twilio latency + 250ms
// throttle) ~= 40s, comfortably under the 60s function limit. Called every ~5
// min by pg_cron, so steady throughput is ~720/hour — well above any drip pace.
const CAP = 60;
const THROTTLE_MS = 250;
const SUPPRESSED = ["blocked", "invalid"];

// Send every drip message that has come due. Claims a capped batch of
// status='scheduled' rows whose scheduled_at <= now, marks them 'sending' (so
// overlapping runs can't double-send), pushes each to Twilio immediately, and
// records the real result. Secured by CRON_SECRET (pg_cron passes it as a
// header). GET and POST both work so it's easy to trigger from anywhere.
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("key") || "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const now = Date.now();

  // Recover rows orphaned in 'sending' by a crashed/timed-out earlier run.
  await db.from("messages").update({ status: "scheduled" })
    .eq("status", "sending").lte("scheduled_at", new Date(now - 10 * 60000).toISOString());

  // Find due messages, then claim them atomically (the status guard means a
  // concurrent run only gets the rows it actually flipped).
  const { data: due } = await db.from("messages").select("id")
    .eq("status", "scheduled").lte("scheduled_at", new Date(now).toISOString())
    .order("scheduled_at", { ascending: true }).limit(CAP);
  const ids = (due || []).map((d: any) => d.id);
  if (ids.length === 0) return NextResponse.json({ claimed: 0, sent: 0, skipped: 0, failed: 0 });

  const { data: claimed } = await db.from("messages").update({ status: "sending" })
    .in("id", ids).eq("status", "scheduled")
    .select("id, conversation, content_sid, content_vars, body, campaign");
  const rows = claimed || [];
  if (rows.length === 0) return NextResponse.json({ claimed: 0, sent: 0, skipped: 0, failed: 0 });

  // Pull the phone/suppression status and the campaign's sender in two queries.
  const convIds = Array.from(new Set(rows.map((m: any) => m.conversation).filter(Boolean)));
  const convMap = new Map<string, { wa_phone: string; status: string }>();
  for (let i = 0; i < convIds.length; i += 500) {
    const { data } = await db.from("conversations").select("id, wa_phone, status").in("id", convIds.slice(i, i + 500));
    for (const c of data || []) convMap.set((c as any).id, { wa_phone: (c as any).wa_phone, status: (c as any).status });
  }
  const campIds = Array.from(new Set(rows.map((m: any) => m.campaign).filter(Boolean)));
  const senderMap = new Map<string, string | null>();
  if (campIds.length) {
    const { data } = await db.from("campaigns").select("id, sender").in("id", campIds);
    for (const c of data || []) senderMap.set((c as any).id, (c as any).sender);
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const m of rows as any[]) {
    const conv = convMap.get(m.conversation);
    if (!conv) { await db.from("messages").update({ status: "failed", error_code: "no_conversation" }).eq("id", m.id); failed++; continue; }
    if (SUPPRESSED.includes(conv.status)) { await db.from("messages").update({ status: "skipped" }).eq("id", m.id); skipped++; continue; }

    const e164 = "+" + String(conv.wa_phone).replace(/[^0-9]/g, "");
    const from = senderMap.get(m.campaign) || undefined;
    try {
      const tw = await sendTemplate(e164, m.content_sid, m.content_vars || undefined, undefined, from);
      const status = tw.status || "queued";
      await db.from("messages").update({ status, twilio_sid: tw.sid }).eq("id", m.id);
      await db.from("conversations").update({ last_direction: "out", last_status: status, last_body: m.body || "[template]", last_at: new Date().toISOString() }).eq("id", m.conversation);
      sent++;
    } catch (e: any) {
      await db.from("messages").update({ status: "failed", error_code: e?.code ? String(e.code) : null }).eq("id", m.id);
      failed++;
    }
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  // Mark a campaign completed once nothing is left scheduled for it.
  for (const cid of campIds) {
    const { count } = await db.from("messages").select("id", { count: "exact", head: true })
      .eq("campaign", cid).in("status", ["scheduled", "sending"]);
    if (count === 0) await db.from("campaigns").update({ status: "completed" }).eq("id", cid);
  }

  return NextResponse.json({ claimed: rows.length, sent, skipped, failed });
}

export async function POST(req: NextRequest) {
  try { return await run(req); } catch (e: any) { return NextResponse.json({ error: e.message || "Dispatch failed" }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  try { return await run(req); } catch (e: any) { return NextResponse.json({ error: e.message || "Dispatch failed" }, { status: 500 }); }
}
