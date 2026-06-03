"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useIsMobile } from "@/lib/useResponsive";

type Conv = {
  id: string; wa_phone: string; name: string | null; status: string;
  last_body: string | null; last_at: string | null;
  unread?: boolean | null; last_direction?: string | null; last_status?: string | null;
};
type Msg = { id: string; conversation: string; direction: string; body: string | null; status: string | null; created_at: string };

// Delivery ticks for an OUTBOUND message status.
function Ticks({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  if (status === "read") return <span style={{ color: "#1a73e8" }} title="Read">✓✓</span>;
  if (status === "delivered") return <span style={{ color: "#9a958c" }} title="Delivered">✓✓</span>;
  if (status === "sent" || status === "queued") return <span style={{ color: "#9a958c" }} title={status}>✓</span>;
  if (status === "undelivered" || status === "failed") return <span style={{ color: "#b00020" }} title={status}>✗</span>;
  return null;
}

export default function Inbox() {
  const sb = useRef(supabaseBrowser());
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const isMobile = useIsMobile();

  async function loadConvs() {
    const { data } = await sb.current.from("conversations").select("*").order("last_at", { ascending: false });
    setConvs((data as Conv[]) || []);
  }
  async function loadMsgs(id: string) {
    const { data } = await sb.current.from("messages").select("*").eq("conversation", id).order("created_at");
    setMsgs((data as Msg[]) || []);
  }

  useEffect(() => { loadConvs(); }, []);
  useEffect(() => {
    const ch = sb.current
      .channel("rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { if (active) loadMsgs(active.id); loadConvs(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => loadConvs())
      .subscribe();
    return () => { sb.current.removeChannel(ch); };
  }, [active]);

  async function open(c: Conv) {
    setActive(c);
    await loadMsgs(c.id);
    if (c.unread) {
      await sb.current.from("conversations").update({ unread: false }).eq("id", c.id);
      setConvs((prev) => prev.map((x) => (x.id === c.id ? { ...x, unread: false } : x)));
    }
  }

  async function send() {
    if (!active || !text.trim()) return;
    setSending(true);
    const res = await fetch("/api/send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+" + active.wa_phone, body: text }),
    });
    setSending(false);
    if (res.ok) { setText(""); loadMsgs(active.id); loadConvs(); }
    else alert("Send failed: " + (await res.json()).error);
  }

  const showList = !isMobile || !active;
  const showChat = !isMobile || !!active;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {showList && (
        <aside style={{ width: isMobile ? "100%" : 320, borderRight: isMobile ? "none" : "1px solid #E4E1DB", background: "#fff", overflowY: "auto", flexShrink: 0 }}>
          {convs.map((c) => (
            <div key={c.id} onClick={() => open(c)} style={{ padding: "14px 18px", borderBottom: "1px solid #F0EEE9", cursor: "pointer", background: active?.id === c.id ? "#F3F1EC" : "#fff", display: "flex", gap: 10, alignItems: "center" }}>
              {c.unread && <span style={{ width: 9, height: 9, borderRadius: 9, background: "#137333", flexShrink: 0 }} title="Unread" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: c.unread ? 700 : 600 }}>
                    {c.name || "+" + c.wa_phone}
                    {c.status === "blocked" && <span style={{ color: "#b00", fontSize: 11, marginLeft: 8 }}>blocked</span>}
                  </span>
                  {c.last_at && <span style={{ fontSize: 11, color: "#9a958c", whiteSpace: "nowrap" }}>{new Date(c.last_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                </div>
                <div style={{ fontSize: 13, color: "#6B6862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.last_direction === "out" && <span style={{ marginRight: 4 }}><Ticks status={c.last_status} /></span>}
                  {c.last_body}
                </div>
              </div>
            </div>
          ))}
          {convs.length === 0 && <div style={{ padding: 20, color: "#6B6862" }}>No conversations yet. Send one below.</div>}
        </aside>
      )}

      {showChat && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {active ? (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #E4E1DB", background: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: 12 }}>
                {isMobile && <button onClick={() => setActive(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
                <span>{active.name || "+" + active.wa_phone}</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {msgs.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: m.direction === "out" ? "#DCF8C6" : "#fff", border: "1px solid #E4E1DB", fontSize: 14 }}>
                      {m.body}
                      <div style={{ fontSize: 10, color: "#9a958c", marginTop: 4, textAlign: "right" }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {m.direction === "out" && <span style={{ marginLeft: 6 }}><Ticks status={m.status} /></span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 14, borderTop: "1px solid #E4E1DB", background: "#fff", display: "flex", gap: 10 }}>
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message" style={{ flex: 1, padding: "12px 14px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 14, minWidth: 0 }} />
                <button onClick={send} disabled={sending} style={{ padding: "12px 22px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, letterSpacing: 1, textTransform: "uppercase", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>{sending ? "..." : "Send"}</button>
              </div>
            </>
          ) : (
            <NewMessage onSent={loadConvs} />
          )}
        </main>
      )}
    </div>
  );
}

function NewMessage({ onSent }: { onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const res = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, body }) });
    setBusy(false);
    if (res.ok) { setPhone(""); setBody(""); onSent(); } else alert("Failed: " + (await res.json()).error);
  }
  return (
    <div style={{ margin: "auto", width: "100%", maxWidth: 380, textAlign: "center", padding: 24, boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14, color: "#6B6862" }}>Start a conversation</div>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+9715XXXXXXXX" style={{ width: "100%", padding: 12, marginBottom: 8, border: "1px solid #E4E1DB", borderRadius: 8, boxSizing: "border-box" }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message (within 24h window)" rows={3} style={{ width: "100%", padding: 12, marginBottom: 8, border: "1px solid #E4E1DB", borderRadius: 8, boxSizing: "border-box" }} />
      <button onClick={go} disabled={busy} style={{ padding: "12px 24px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>{busy ? "Sending..." : "Send"}</button>
    </div>
  );
}
