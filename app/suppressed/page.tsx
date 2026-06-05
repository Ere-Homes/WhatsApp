"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { formatPhone } from "@/lib/format";

type Conv = { id: string; wa_phone: string; name: string | null; status: string; last_at: string | null };

const META: Record<string, { label: string; color: string; note: string }> = {
  blocked: { label: "Opted out", color: "#b00020", note: "Replied STOP / unsubscribed - we never message them." },
  invalid: { label: "Invalid number", color: "#9a958c", note: "Bounced as not a WhatsApp user - campaigns skip them." },
};

export default function Suppressed() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Conv[] | null>(null);
  const [filter, setFilter] = useState<"all" | "blocked" | "invalid">("all");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await sb.from("conversations").select("id, wa_phone, name, status, last_at")
      .in("status", ["blocked", "invalid"]).order("last_at", { ascending: false }).limit(1000);
    setRows((data as Conv[]) || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function restore(c: Conv) {
    const verb = c.status === "blocked" ? "re-enable messaging to this opted-out contact" : "restore this invalid number";
    if (!confirm(`Are you sure you want to ${verb}? They'll be eligible to receive messages again.`)) return;
    setBusy(c.id);
    await sb.from("conversations").update({ status: "open" }).eq("id", c.id);
    setRows((prev) => (prev || []).filter((x) => x.id !== c.id));
    setBusy(null);
  }

  const shown = (rows || []).filter((c) => filter === "all" || c.status === filter);
  const blocked = (rows || []).filter((c) => c.status === "blocked").length;
  const invalid = (rows || []).filter((c) => c.status === "invalid").length;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px" }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: "0 0 6px" }}>Suppressed contacts</h1>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        Numbers we won't message: people who opted out, and dead WhatsApp numbers that bounced. Restore one if needed.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {([["all", `All (${(rows || []).length})`], ["blocked", `Opted out (${blocked})`], ["invalid", `Invalid (${invalid})`]] as const).map(([id, lbl]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ ...pill, ...(filter === id ? pillActive : {}) }}>{lbl}</button>
        ))}
      </div>

      {rows === null && <div style={{ color: "#6B6862" }}>Loading…</div>}
      {rows && shown.length === 0 && (
        <div style={{ color: "#9a958c", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 24, textAlign: "center" }}>
          Nothing here - no suppressed contacts in this view.
        </div>
      )}

      {shown.map((c) => {
        const m = META[c.status] || { label: c.status, color: "#6B6862", note: "" };
        return (
          <div key={c.id} style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || formatPhone(c.wa_phone)}</div>
              <div style={{ fontSize: 12, color: "#9a958c", marginTop: 2 }}>
                {c.name ? formatPhone(c.wa_phone) + " · " : ""}{m.note}
              </div>
            </div>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: m.color, border: `1px solid ${m.color}`, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>{m.label}</span>
            <button onClick={() => restore(c)} disabled={busy === c.id} style={{ ...pill, padding: "6px 14px" }}>{busy === c.id ? "…" : "Restore"}</button>
          </div>
        );
      })}
    </div>
  );
}

const pill: React.CSSProperties = { padding: "8px 16px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 20, cursor: "pointer", fontSize: 13 };
const pillActive: React.CSSProperties = { background: "#141414", color: "#fff", borderColor: "#141414" };
