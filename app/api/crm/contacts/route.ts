import { NextRequest, NextResponse } from "next/server";
import { crmContacts } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { filters: {community?, nationality?, unit_type?, building?, tier?}, limit }
// -> { phones: [...] } (contactable only: has phone, not do-not-call, not
// uncontactable, not a switchboard)
export async function POST(req: NextRequest) {
  try {
    const { filters, limit } = await req.json();
    const phones = await crmContacts(filters || {}, limit || 500);
    return NextResponse.json({ count: phones.length, phones });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load contacts" }, { status: 500 });
  }
}
