import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db.from("auto_replies").select("*").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data || [] });
}

// Create or update a rule
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    if (!b.trigger || !b.trigger.trim()) return NextResponse.json({ error: "Trigger is required" }, { status: 400 });
    const row = {
      trigger: b.trigger.trim(),
      reply: b.reply?.trim() || null,
      block: !!b.block,
      push_pipedrive: !!b.push_pipedrive,
      enabled: b.enabled !== false,
    };
    const db = supabaseAdmin();
    const { data, error } = b.id
      ? await db.from("auto_replies").update(row).eq("id", b.id).select().single()
      : await db.from("auto_replies").insert(row).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ rule: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to save rule" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = supabaseAdmin();
  const { error } = await db.from("auto_replies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: id });
}
