import { NextRequest, NextResponse } from "next/server";
import { pushLeadFromWhatsApp } from "@/lib/pipedrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { phone, name?, note? } -> creates/reuses a Pipedrive person and opens a Hot lead.
export async function POST(req: NextRequest) {
  try {
    const { phone, name, note } = await req.json();
    if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });
    const r = await pushLeadFromWhatsApp({ phone, name, note });
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Pipedrive push failed" }, { status: 500 });
  }
}
