import { supabaseAdmin } from "./supabase";
import { findPersonByPhone, upsertWhatsAppNote } from "./pipedrive";

// Keep a running WhatsApp transcript note on the Pipedrive person for this
// conversation. Best-effort: never throws, never blocks the caller's result.
// Does NOT create a person - only logs to a person that already exists or is
// already linked (linking happens on manual push or when a status is set).
export async function logConversationToPipedrive(conversationId: string) {
  try {
    const db = supabaseAdmin();
    const { data: conv } = await db.from("conversations").select("*").eq("id", conversationId).single();
    if (!conv) return;

    let personId: number | null = conv.pipedrive_person_id ? Number(conv.pipedrive_person_id) : null;
    if (!personId) {
      const person = await findPersonByPhone(`+${conv.wa_phone}`);
      if (!person) return; // not in Pipedrive yet - nothing to attach to
      personId = person.id;
      await db.from("conversations").update({ pipedrive_person_id: String(personId) }).eq("id", conversationId);
    }

    const { data: msgs } = await db
      .from("messages").select("direction, body, created_at")
      .eq("conversation", conversationId).order("created_at", { ascending: true }).limit(200);
    const lines = (msgs || []).map((m: any) =>
      `${new Date(m.created_at).toLocaleString()} · ${m.direction === "in" ? "Lead" : "ERE"}: ${m.body || ""}`);
    const content = `WhatsApp · ${conv.name || "+" + conv.wa_phone}\n\n${lines.join("\n")}`;

    const noteId = await upsertWhatsAppNote(personId as number, content, conv.pipedrive_note_id);
    if (noteId && String(noteId) !== conv.pipedrive_note_id) {
      await db.from("conversations").update({ pipedrive_note_id: String(noteId) }).eq("id", conversationId);
    }
  } catch {
    /* best-effort logging */
  }
}
