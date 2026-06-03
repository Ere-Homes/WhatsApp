import { NextResponse } from "next/server";
import { twilioGet } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists Twilio Content templates with their WhatsApp approval status.
// Uses /v1/ContentAndApprovals so status comes back in one call.
export async function GET() {
  try {
    const out: any[] = [];
    let url: string | null = "https://content.twilio.com/v1/ContentAndApprovals?PageSize=50";
    let guard = 0;
    while (url && guard++ < 20) {
      const data: any = await twilioGet(url);
      for (const c of data.contents || []) {
        const approval = c.approval_requests || {};
        const types = c.types || {};
        const typeKey = Object.keys(types)[0] || null;
        out.push({
          sid: c.sid,
          name: c.friendly_name,
          language: c.language,
          type: typeKey, // e.g. whatsapp/card, whatsapp/text
          category: approval.category || null,
          status: approval.status || "unsubmitted", // approved | pending | rejected | ...
          rejection_reason: approval.rejection_reason || null,
          variables: c.variables || {},
          body: types[typeKey || ""]?.body || null,
          updated: c.date_updated,
        });
      }
      const next = data.meta?.next_page_url;
      url = next || null;
    }
    return NextResponse.json({ templates: out });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load templates" }, { status: 500 });
  }
}
