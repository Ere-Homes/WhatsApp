import { NextRequest, NextResponse } from "next/server";
import { crmContactByPhone } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET ?phone=971XXXXXXXXX -> matched CRM contact (or { contact: null })
export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone") || "";
    const contact = await crmContactByPhone(phone);
    return NextResponse.json({ contact });
  } catch (e: any) {
    return NextResponse.json({ contact: null, error: e.message || "Lookup failed" }, { status: 200 });
  }
}
