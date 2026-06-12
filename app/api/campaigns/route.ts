import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Read campaigns through the service role, behind the app login gate, so RLS can
// deny anon on the campaigns table. (Campaign mutations already live under
// /api/campaign/* — this plural route is read-only list views.)
export async function GET(req: NextRequest) {
  try {
    const db = supabaseAdmin();
    const sp = req.nextUrl.searchParams;
    const view = sp.get("view") || "log";

    if (view === "active") {
      const { data, error } = await db.from("campaigns").select("id,status")
        .in("status", ["sending", "scheduled"]);
      if (error) throw new Error(error.message);
      return NextResponse.json({ campaigns: data || [] });
    }

    // default: log — most recent campaigns with their rollup counts.
    const limit = Math.min(200, Number(sp.get("limit")) || 100);
    const { data, error } = await db.from("campaigns").select("*")
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return NextResponse.json({ campaigns: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load campaigns" }, { status: 500 });
  }
}
