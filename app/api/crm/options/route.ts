import { NextRequest, NextResponse } from "next/server";
import { crmOptions } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?col=community|nationality|unit_type|building|tier -> distinct values + counts
export async function GET(req: NextRequest) {
  try {
    const col = req.nextUrl.searchParams.get("col") || "community";
    const values = await crmOptions(col);
    return NextResponse.json({ col, values });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load options" }, { status: 500 });
  }
}
