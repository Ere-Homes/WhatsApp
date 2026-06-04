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
                <span style={{ flex: 1 }}>{active.name || "+" + active.wa_phone}</span>
                <PushToPipedrive conv={active} lastInbound={[...msgs].reverse().find((m) => m.direction === "in")?.body || null} />
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
              <div style={{ padding: 14, borderTop: "1px solid #E4E1DB", background: "#fff", display: "flex", gap: 10, position: "relative" }}>
                <TemplateSender phone={active.wa_phone} onSent={() => { loadMsgs(active.id); loadConvs(); }} />
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

// Push this conversation into Pipedrive as a Hot lead (direct, no Ulgebra).
function PushToPipedrive({ conv, lastInbound }: { conv: Conv; lastInbound: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  const [err, setErr] = useState("");
  async function push() {
    setState("busy");
    setErr("");
    try {
      const note =
        `Pushed from ERE WhatsApp.\nPhone: +${conv.wa_phone}` +
        (lastInbound ? `\nLast reply: "${lastInbound}"` : "");
      const res = await fetch("/api/pipedrive/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+" + conv.wa_phone, name: conv.name || undefined, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setState("done");
    } catch (e: any) {
      setErr(e.message);
      setState("err");
    }
  }
  return (
    <>
      <button
        onClick={push}
        disabled={state === "busy" || state === "done"}
        title={err || "Create a Hot lead in Pipedrive"}
        style={{
          padding: "8px 14px",
          background: state === "done" ? "#137333" : "#fff",
          color: state === "done" ? "#fff" : "#141414",
          border: "1px solid " + (state === "err" ? "#b00020" : "#E4E1DB"),
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 12,
          letterSpacing: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        {state === "busy" ? "Pushing…" : state === "done" ? "✓ In Pipedrive" : state === "err" ? "Retry → Pipedrive" : "→ Pipedrive"}
      </button>

      {state === "done" && (
        <div style={{ position: "fixed", top: 60, right: 20, background: "#137333", color: "#fff", padding: "12px 16px", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.18)", zIndex: 50, fontSize: 14, maxWidth: 320 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Pushed to Pipedrive ✓</div>
          <div style={{ fontSize: 13, opacity: 0.95 }}>Hot lead created.{" "}
            <a href="https://erehomesrealestatebrokers.pipedrive.com/leads/inbox" target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "underline" }}>Open Leads inbox ↗</a>
          </div>
        </div>
      )}
      {state === "err" && (
        <div style={{ position: "fixed", top: 60, right: 20, background: "#b00020", color: "#fff", padding: "12px 16px", borderRadius: 10, boxShadow: "0 6px 20px rgba(0,0,0,.18)", zIndex: 50, fontSize: 13, maxWidth: 320 }}>
          Pipedrive push failed: {err}
        </div>
      )}
    </>
  );
}

// Pick an approved template and send it (works outside the 24h window).
function TemplateSender({ phone, onSent }: { phone: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [tpls, setTpls] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/templates");
    const d = await res.json();
    setTpls((d.templates || []).filter((t: any) => t.status === "approved"));
  }
  function toggle() {
    const next = !open;
    setOpen(next);
    setSel(null);
    if (next && tpls.length === 0) load();
  }
  function pick(t: any) {
    const vars = t.variables || {};
    if (Object.keys(vars).length) { setSel(t); setVals({ ...vars }); }
    else doSend(t, {});
  }
  async function doSend(t: any, values: Record<string, string>) {
    setBusy(true);
    let label = t.body || `[${t.name}]`;
    for (const [k, v] of Object.entries(values)) label = label.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || `{{${k}}}`);
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "+" + phone, contentSid: t.sid, variables: values, label }),
    });
    setBusy(false);
    if (res.ok) { setOpen(false); setSel(null); onSent(); }
    else alert("Template send failed: " + (await res.json()).error);
  }

  const vars = sel ? Object.keys(sel.variables || {}) : [];

  return (
    <div style={{ flexShrink: 0 }}>
      <button onClick={toggle} title="Send a template" style={{ padding: "12px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 16 }}>📋</button>
      {open && (
        <div style={{ position: "absolute", bottom: 64, left: 14, width: 320, maxHeight: 360, overflowY: "auto", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 12, zIndex: 20 }}>
          {!sel && (
            <>
              <div style={{ fontSize: 12, color: "#6B6862", marginBottom: 8 }}>Approved templates</div>
              {tpls.length === 0 && <div style={{ fontSize: 13, color: "#9a958c" }}>No approved templates.</div>}
              {tpls.map((t) => (
                <div key={t.sid} onClick={() => pick(t)} style={{ padding: "10px 8px", borderBottom: "1px solid #F0EEE9", cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#6B6862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.body}</div>
                </div>
              ))}
            </>
          )}
          {sel && (
            <>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{sel.name}</div>
              <div style={{ fontSize: 12, color: "#6B6862", marginBottom: 10, whiteSpace: "pre-wrap" }}>{sel.body}</div>
              {vars.map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{`{{${k}}}`}</span>
                  <input value={vals[k] || ""} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} placeholder="value" style={{ flex: 1, padding: "8px 10px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 13 }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={() => doSend(sel, vals)} disabled={busy} style={{ flex: 1, padding: "10px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>{busy ? "Sending…" : "Send template"}</button>
                <button onClick={() => setSel(null)} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Back</button>
              </div>
            </>
          )}
        </div>
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
