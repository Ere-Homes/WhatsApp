import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { findOrCreatePersonByPhone, ensureLead, setLeadLabel, leadLabelIdByName } from "@/lib/pipedrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Sync a conversation's lead status to Pipedrive: find-or-create the person +
// lead, then set the matching lead label (Hot/Warm/Cold…). POST { conversationId }
export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json();
    if (!conversationId) return NextResponse.json({ error: "conversationId required" }, { status: 400 });

    const db = supabaseAdmin();
    const { data: conv } = await db.from("conversations").select("*").eq("id", conversationId).single();
    if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const name = conv.name || `+${conv.wa_phone}`;
    const person = await findOrCreatePersonByPhone(`+${conv.wa_phone}`, name);
    const leadId = await ensureLead(person.id, `${name} — WhatsApp`, conv.pipedrive_lead_id);

    // Map our lead temperature to a Pipedrive lead label by name (Hot/Warm/Cold).
    // 'new' clears the label; won/lost have no default label so they're left as-is.
    const status = String(conv.lead_status || "new");
    if (status === "new") {
      await setLeadLabel(leadId, null);
    } else if (["hot", "warm", "cold"].includes(status)) {
      const labelId = await leadLabelIdByName(status);
      if (labelId) await setLeadLabel(leadId, labelId);
    }

    await db.from("conversations")
      .update({ pipedrive_person_id: String(person.id), pipedrive_lead_id: String(leadId) })
      .eq("id", conversationId);

    return NextResponse.json({ ok: true, personId: person.id, leadId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Status sync failed" }, { status: 500 });
  }
}
