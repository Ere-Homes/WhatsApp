import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recompute live counts/status for campaigns that aren't finished yet, from
// their actual message rows (delivery callbacks update messages, not the
// campaign rollup). Keeps the campaign log honest. POST -> { updated }
export async function POST() {
  try {
    const db = supabaseAdmin();
    const { data: active } = await db
      .from("campaigns").select("id, skipped").in("status", ["sending", "scheduled"]);
    let updated = 0;

    for (const c of active || []) {
      // page through this campaign's messages
      const counts: Record<string, number> = {};
      for (let from = 0; ; from += 1000) {
        const { data } = await db
          .from("messages").select("status").eq("campaign", c.id).range(from, from + 999);
        for (const m of data || []) counts[m.status || "?"] = (counts[m.status || "?"] || 0) + 1;
        if (!data || data.length < 1000) break;
      }
      const n = (k: string) => counts[k] || 0;
      const scheduled = n("scheduled");
      const failed = n("undelivered") + n("failed");
      const sent = n("delivered") + n("read") + n("sent") + n("queued") + n("accepted");
      const status = scheduled > 0 ? "scheduled" : "completed";
      await db.from("campaigns").update({ sent, scheduled, failed, status }).eq("id", c.id);
      updated++;
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Refresh failed" }, { status: 500 });
  }
}
