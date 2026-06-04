import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record final tallies once the client has finished looping batches.
// POST { id, sent, scheduled, failed, skipped }
export async function POST(req: NextRequest) {
  try {
    const { id, sent, scheduled, failed, skipped } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // "scheduled" if any messages are queued for the future, else "completed".
    const status = (scheduled || 0) > 0 ? "scheduled" : "completed";
    const { error } = await supabaseAdmin()
      .from("campaigns")
      .update({ sent: sent || 0, scheduled: scheduled || 0, failed: failed || 0, skipped: skipped || 0, status })
      .eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true, status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to finalize" }, { status: 500 });
  }
}
