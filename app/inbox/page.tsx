"use client";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useIsMobile } from "@/lib/useResponsive";
import { formatPhone } from "@/lib/format";

type Conv = {
  id: string; wa_phone: string; name: string | null; status: string;
  last_body: string | null; last_at: string | null;
  unread?: boolean | null; last_direction?: string | null; last_status?: string | null;
  lead_status?: string | null;
};

// Lead temperature options + colors.
const LEAD_STATUSES = [
  { id: "new", label: "New", color: "#6B6862" },
  { id: "hot", label: "Hot", color: "#b00020" },
  { id: "warm", label: "Warm", color: "#d9822b" },
  { id: "cold", label: "Cold", color: "#1a73e8" },
  { id: "won", label: "Won", color: "#137333" },
  { id: "lost", label: "Lost", color: "#9a958c" },
];
const leadColor = (s?: string | null) => LEAD_STATUSES.find((x) => x.id === (s || "new"))?.color || "#6B6862";
const leadLabel = (s?: string | null) => LEAD_STATUSES.find((x) => x.id === (s || "new"))?.label || "New";
type Msg = { id: string; conversation: string; direction: string; body: string | null; status: string | null; created_at: string; media_url?: string | null };

// Resolve a media URL to something the browser can load. Inbound Twilio URLs
// need our authenticated proxy; our own Supabase URLs load directly.
function mediaSrc(url: string) {
  return url.includes("api.twilio.com") ? `/api/media?url=${encodeURIComponent(url)}` : url;
}
function isPdf(url: string) {
  return /\.pdf($|\?)/i.test(url);
}

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
  const [senders, setSenders] = useState<string[]>([]);
  const [sender, setSender] = useState("");
  const [query, setQuery] = useState("");
  const [leadFilter, setLeadFilter] = useState("all");
  const isMobile = useIsMobile();

  async function setLead(id: string, lead_status: string) {
    await sb.current.from("conversations").update({ lead_status }).eq("id", id);
    setConvs((prev) => prev.map((x) => (x.id === id ? { ...x, lead_status } : x)));
    setActive((a) => (a && a.id === id ? { ...a, lead_status } : a));
    // Mirror the status to Pipedrive (find-or-create person + lead, set label).
    fetch("/api/pipedrive/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: id }),
    }).catch(() => {});
  }

  useEffect(() => {
    fetch("/api/senders").then((r) => r.json()).then((d) => {
      setSenders(d.senders || []);
      if (d.senders?.length) setSender(d.senders[0]);
    });
  }, []);

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
      body: JSON.stringify({ phone: "+" + active.wa_phone, body: text, from: sender || undefined }),
    });
    setSending(false);
    if (res.ok) { setText(""); loadMsgs(active.id); loadConvs(); }
    else alert("Send failed: " + (await res.json()).error);
  }

  const q = query.trim().toLowerCase();
  const shown = convs.filter((c) => {
    if (leadFilter !== "all" && (c.lead_status || "new") !== leadFilter) return false;
    if (!q) return true;
    return (c.name || "").toLowerCase().includes(q) || c.wa_phone.includes(q.replace(/[^0-9]/g, ""));
  });

  const showList = !isMobile || !active;
  const showChat = !isMobile || !!active;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {showList && (
        <aside style={{ width: isMobile ? "100%" : 320, borderRight: isMobile ? "none" : "1px solid #E4E1DB", background: "#fff", overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #F0EEE9", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
              {[{ id: "all", label: "All", color: "#141414" }, ...LEAD_STATUSES].map((s) => (
                <button
                  key={s.id}
                  onClick={() => setLeadFilter(s.id)}
                  style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 20, cursor: "pointer",
                    border: `1px solid ${leadFilter === s.id ? s.color : "#E4E1DB"}`,
                    background: leadFilter === s.id ? s.color : "#fff",
                    color: leadFilter === s.id ? "#fff" : "#6B6862",
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {shown.map((c) => (
            <div key={c.id} onClick={() => open(c)} style={{ padding: "14px 18px", borderBottom: "1px solid #F0EEE9", cursor: "pointer", background: active?.id === c.id ? "#EEEEEE" : "#fff", display: "flex", gap: 10, alignItems: "center" }}>
              {c.unread && <span style={{ width: 9, height: 9, borderRadius: 9, background: "#137333", flexShrink: 0 }} title="Unread" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: c.unread ? 700 : 600 }}>
                    {c.name || "+" + c.wa_phone}
                    {c.lead_status && c.lead_status !== "new" && (
                      <span style={{ fontSize: 10, marginLeft: 8, color: "#fff", background: leadColor(c.lead_status), padding: "1px 7px", borderRadius: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{leadLabel(c.lead_status)}</span>
                    )}
                    {c.status === "blocked" && <span style={{ color: "#b00", fontSize: 11, marginLeft: 8 }}>blocked</span>}
                    {c.status === "invalid" && <span style={{ color: "#9a958c", fontSize: 11, marginLeft: 8 }}>invalid number</span>}
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
          {convs.length > 0 && shown.length === 0 && <div style={{ padding: 20, color: "#9a958c", fontSize: 13 }}>No matches for “{query}”.</div>}
        </aside>
      )}

      {showChat && (
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {active ? (
            <>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #E4E1DB", background: "#fff", fontWeight: 600, display: "flex", alignItems: "center", gap: 12 }}>
                {isMobile && <button onClick={() => setActive(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>}
                <span style={{ flex: 1 }}>{active.name || "+" + active.wa_phone}</span>
                <select
                  value={active.lead_status || "new"}
                  onChange={(e) => setLead(active.id, e.target.value)}
                  title="Lead status"
                  style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff", background: leadColor(active.lead_status), border: "none" }}
                >
                  {LEAD_STATUSES.map((s) => <option key={s.id} value={s.id} style={{ background: "#fff", color: "#141414" }}>{s.label}</option>)}
                </select>
                <PushToPipedrive conv={active} lastInbound={[...msgs].reverse().find((m) => m.direction === "in")?.body || null} />
              </div>
              <CrmContext phone={active.wa_phone} />
              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {msgs.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                    <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", background: m.direction === "out" ? "#DCF8C6" : "#fff", border: "1px solid #E4E1DB", fontSize: 14 }}>
                      {m.media_url && (
                        isPdf(m.media_url)
                          ? <a href={mediaSrc(m.media_url)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginBottom: m.body && m.body !== "[media]" ? 6 : 0, color: "#1a73e8" }}>Open document ↗</a>
                          : <img src={mediaSrc(m.media_url)} alt="" style={{ display: "block", maxWidth: "100%", borderRadius: 8, marginBottom: m.body && m.body !== "[media]" ? 6 : 0 }} />
                      )}
                      {m.body && m.body !== "[media]" && m.body}
                      <div style={{ fontSize: 10, color: "#9a958c", marginTop: 4, textAlign: "right" }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {m.direction === "out" && <span style={{ marginLeft: 6 }}><Ticks status={m.status} /></span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 14, borderTop: "1px solid #E4E1DB", background: "#fff", display: "flex", gap: 10, position: "relative", alignItems: "center" }}>
                {senders.length > 1 && (
                  <select value={sender} onChange={(e) => setSender(e.target.value)} title="Send from" style={{ padding: "11px 8px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 13, flexShrink: 0, maxWidth: 150 }}>
                    {senders.map((s) => <option key={s} value={s}>{formatPhone(s)}</option>)}
                  </select>
                )}
                <TemplateSender phone={active.wa_phone} from={sender} onSent={() => { loadMsgs(active.id); loadConvs(); }} />
                <AttachMedia phone={active.wa_phone} from={sender} onSent={() => { loadMsgs(active.id); loadConvs(); }} />
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
function TemplateSender({ phone, from, onSent }: { phone: string; from?: string; onSent: () => void }) {
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
      body: JSON.stringify({ phone: "+" + phone, contentSid: t.sid, variables: values, label, from: from || undefined }),
    });
    setBusy(false);
    if (res.ok) { setOpen(false); setSel(null); onSent(); }
    else alert("Template send failed: " + (await res.json()).error);
  }

  const vars = sel ? Object.keys(sel.variables || {}) : [];

  return (
    <div style={{ flexShrink: 0 }}>
      <button onClick={toggle} title="Insert a template" style={{ padding: "12px 16px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 18, lineHeight: 1, color: "#141414" }}>+</button>
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

// Shows who this number is, pulled from the ERE CRM (if matched). Gives the
// agent instant context - community, tier, transaction history - before replying.
function CrmContext({ phone }: { phone: string }) {
  const [c, setC] = useState<any>(undefined); // undefined=loading, null=no match
  useEffect(() => {
    setC(undefined);
    fetch(`/api/crm/contact?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.json())
      .then((d) => setC(d.contact || null))
      .catch(() => setC(null));
  }, [phone]);

  if (c === undefined) return <div style={ctxBar}><span style={{ color: "#9a958c" }}>Checking CRM…</span></div>;
  if (c === null) return <div style={ctxBar}><span style={{ color: "#9a958c" }}>Not in Audience CRM yet</span></div>;

  // Where this contact came from: portal / AI lookup (verified_source) and the
  // import batch or file (source_batch / source_path).
  const sourceLabel = (() => {
    const via = c.verified_source && c.verified_source !== "#N/A" ? c.verified_source : null;
    const batch = c.source_batch && c.source_batch !== "#N/A" ? c.source_batch : null;
    if (via && batch) return `${via} · ${batch}`;
    return via || batch || null;
  })();

  const aed = c.total_transaction_value_aed ? `AED ${Number(c.total_transaction_value_aed).toLocaleString()}` : null;
  const chips = [
    sourceLabel ? `via ${sourceLabel}` : null,
    c.community, c.building, c.unit_type, c.nationality,
    c.tier ? `Tier ${c.tier}` : null,
    c.number_of_transactions ? `${c.number_of_transactions} deal${c.number_of_transactions === 1 ? "" : "s"}` : null,
    aed,
    c.has_bought_before === true || c.has_bought_before === "Y" ? "Buyer" : null,
    c.has_sold_before === true || c.has_sold_before === "Y" ? "Seller" : null,
  ].filter(Boolean);

  return (
    <div style={ctxBar}>
      {c.name && <span style={{ fontWeight: 700, color: "#141414" }}>{c.name}</span>}
      {(c.do_not_call === "Y" || c.do_not_call === true) && <span style={{ color: "#b00020", fontWeight: 600 }}>Do not call</span>}
      {chips.map((x: string, i: number) => (
        <span key={i} style={{ background: "#EEEEEE", borderRadius: 12, padding: "2px 9px", color: "#3a3a3a" }}>{x}</span>
      ))}
      {chips.length === 0 && !c.name && <span style={{ color: "#9a958c" }}>In CRM (no details)</span>}
    </div>
  );
}
const ctxBar: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "8px 18px", borderBottom: "1px solid #F0EEE9", background: "#FFFFFF", fontSize: 12 };

// Attach an image or PDF and send it as a media message (within 24h window).
function AttachMedia({ phone, from, onSent }: { phone: string; from?: string; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", "chat");
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const ud = await up.json();
      if (!up.ok) throw new Error(ud.error || "Upload failed");
      const res = await fetch("/api/send", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+" + phone, mediaUrl: ud.url, from: from || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Send failed");
      onSent();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <div style={{ flexShrink: 0 }}>
      <button onClick={() => ref.current?.click()} disabled={busy} title="Attach image or PDF" style={{ padding: "12px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", lineHeight: 0, color: "#141414" }}>
        {busy ? <span style={{ fontSize: 13 }}>…</span> : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
        )}
      </button>
      <input ref={ref} type="file" accept="image/*,application/pdf" onChange={pick} style={{ display: "none" }} />
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
