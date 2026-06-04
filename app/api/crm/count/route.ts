import { NextRequest, NextResponse } from "next/server";
import { crmCount } from "@/lib/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { filters } -> { count } (approximate; planner estimate, fast)
export async function POST(req: NextRequest) {
  try {
    const { filters } = await req.json();
    const count = await crmCount(filters || {});
    return NextResponse.json({ count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to count" }, { status: 500 });
  }
}
