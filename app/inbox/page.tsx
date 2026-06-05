"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, IC, Avatar, CHECK2 } from "@/lib/ui";
import { CONVOS, SEED_TEMPLATES, type Tpl } from "@/lib/fixtures";
import { supabaseBrowser } from "@/lib/supabase";
import { formatPhone } from "@/lib/format";

type UIMsg = { id: string; from: "in" | "out"; t: string; at: string; status?: string | null; media?: string | null };
type UIConv = {
  id: string; name: string; phone: string; waPhone?: string;
  tag: "Hot" | "Warm" | ""; lead?: string; unread: number; time: string; community: string;
  live: boolean; loaded: boolean; messages: UIMsg[]; blocked?: boolean;
};

const LEADS = [
  { id: "new", label: "New" }, { id: "hot", label: "Hot" }, { id: "warm", label: "Warm" },
  { id: "cold", label: "Cold" }, { id: "won", label: "Won" }, { id: "lost", label: "Lost" },
];
const tagOf = (lead?: string): "Hot" | "Warm" | "" => (lead === "hot" ? "Hot" : lead === "warm" ? "Warm" : "");
const hhmm = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};
function mediaSrc(url: string) { return url.includes("api.twilio.com") ? `/api/media?url=${encodeURIComponent(url)}` : url; }

function TagDot({ tag }: { tag: string }) {
  if (!tag) return null;
  const c = tag === "Hot" ? "var(--red)" : "var(--amber-dot)";
  return <span className="leadtag"><span className="d" style={{ background: c }} />{tag}</span>;
}

function Ticks({ status }: { status?: string | null }) {
  if (!status) return <span style={{ color: "#53bdeb" }}>{CHECK2}</span>;
  if (status === "read") return <span style={{ color: "#53bdeb" }}>{CHECK2}</span>;
  if (status === "delivered") return <span style={{ color: "#8a9398" }}>{CHECK2}</span>;
  if (status === "undelivered" || status === "failed") return <span style={{ color: "#E0383E" }} title={status}>✗</span>;
  return <span style={{ color: "#8a9398" }} title={status || ""}>✓</span>;
}

function demoConvs(): UIConv[] {
  return CONVOS.map((c) => ({
    id: String(c.id), name: c.name, phone: c.phone, tag: c.tag, lead: c.tag === "Hot" ? "hot" : c.tag === "Warm" ? "warm" : "new",
    unread: c.unread, time: c.time, community: c.community, live: false, loaded: true,
    messages: c.messages.map((m, i) => ({ id: String(i), from: m.from, t: m.t, at: m.at })),
  }));
}

export default function Inbox() {
  const sb = useRef(supabaseBrowser());
  const [convos, setConvos] = useState<UIConv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "hot">("all");
  const [showThread, setShowThread] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [approved, setApproved] = useState<Tpl[]>(SEED_TEMPLATES.filter((t) => t.status === "approved"));
  const [senders, setSenders] = useState<string[]>([]);
  const [sender, setSender] = useState("");
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const threadRef = useRef<HTMLDivElement>(null);

  const active = convos.find((c) => c.id === activeId) || null;
  const draft = (activeId && drafts[activeId]) || "";
  const setDraft = (v: string) => setDrafts((d) => {
    const next = { ...d, [activeId || ""]: v };
    try { localStorage.setItem("om_drafts", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // Initial load: senders, approved templates, drafts, and conversations
  // (live Supabase → fixtures fallback). Also seed search from ?q=.
  useEffect(() => {
    try { setDrafts(JSON.parse(localStorage.getItem("om_drafts") || "{}")); } catch { /* ignore */ }
    try { const p = new URLSearchParams(window.location.search).get("q"); if (p) setQ(p); } catch { /* ignore */ }
    fetch("/api/senders").then((r) => r.json()).then((d) => { setSenders(d.senders || []); if (d.senders?.length) setSender(d.senders[0]); }).catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then((d) => { const a = (d.templates || []).filter((t: Tpl) => t.status === "approved"); if (a.length) setApproved(a); }).catch(() => {});
    loadConvs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConvs() {
    try {
      const { data, error } = await sb.current.from("conversations").select("*").order("last_at", { ascending: false });
      if (error || !data || data.length === 0) throw new Error("no live data");
      const mapped: UIConv[] = data.map((c: any) => ({
        id: c.id, name: c.name || "+" + c.wa_phone, phone: formatPhone(c.wa_phone), waPhone: c.wa_phone,
        tag: tagOf(c.lead_status), lead: c.lead_status || "new", unread: c.unread ? 1 : 0, time: hhmm(c.last_at),
        community: c.community || "", live: true, loaded: false, messages: [], blocked: c.status === "blocked",
      }));
      setLive(true);
      setConvos((prev) => {
        // preserve already-loaded messages on refresh
        const byId = new Map(prev.map((p) => [p.id, p]));
        return mapped.map((m) => { const old = byId.get(m.id); return old?.loaded ? { ...m, loaded: true, messages: old.messages } : m; });
      });
      if (!activeId && data[0]) setActiveId(data[0].id);
    } catch {
      const d = demoConvs();
      setLive(false);
      setConvos(d);
      if (!activeId) setActiveId(d[0].id);
    }
  }

  async function loadMsgs(id: string) {
    const { data } = await sb.current.from("messages").select("*").eq("conversation", id).order("created_at");
    const msgs: UIMsg[] = (data || []).map((m: any) => ({
      id: m.id, from: m.direction === "out" ? "out" : "in",
      t: m.body && m.body !== "[media]" ? m.body : "", at: hhmm(m.created_at), status: m.status, media: m.media_url,
    }));
    setConvos((p) => p.map((c) => (c.id === id ? { ...c, loaded: true, messages: msgs } : c)));
  }

  // Live updates
  useEffect(() => {
    if (!live) return;
    let ch: any;
    try {
      ch = sb.current.channel("inbox-rt")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" } as any, () => { if (activeId) loadMsgs(activeId); loadConvs(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" } as any, () => loadConvs())
        .subscribe();
    } catch { /* ignore */ }
    return () => { if (ch) try { sb.current.removeChannel(ch); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, activeId]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [activeId, convos]);

  async function openConvo(c: UIConv) {
    setActiveId(c.id);
    setShowThread(true);
    setMoreOpen(false);
    setConvos((p) => p.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)));
    if (c.live) {
      if (!c.loaded) await loadMsgs(c.id);
      try { await sb.current.from("conversations").update({ unread: false }).eq("id", c.id); } catch { /* ignore */ }
    }
  }

  async function send() {
    if (!active || !draft.trim()) return;
    const text = draft.trim();
    if (active.live && active.waPhone) {
      setSending(true);
      try {
        const res = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+" + active.waPhone, body: text, from: sender || undefined }) });
        if (!res.ok) throw new Error((await res.json()).error || "Send failed");
        setDraft(""); setTplOpen(false);
        await loadMsgs(active.id);
      } catch (e: any) {
        alert("Send failed: " + e.message);
      } finally {
        setSending(false);
      }
    } else {
      // demo: append locally
      const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setConvos((p) => p.map((c) => (c.id === active.id ? { ...c, time: at, messages: [...c.messages, { id: "m" + Date.now(), from: "out", t: text, at, status: "read" }] } : c)));
      setDraft(""); setTplOpen(false);
    }
  }

  function insertTemplate(t: Tpl) {
    const first = (active?.name || "there").split(" ")[0].replace(/^\+/, "there");
    setDraft((t.body || "").replace(/\{\{(\d+)\}\}/g, (_, n) => (n === "1" ? first : t.variables?.[n] || "")));
    setTplOpen(false);
    setTimeout(() => document.querySelector<HTMLInputElement>(".msg-input")?.focus(), 0);
  }

  async function setLead(id: string, lead: string) {
    setConvos((p) => p.map((c) => (c.id === id ? { ...c, lead, tag: tagOf(lead) } : c)));
    if (live) {
      try {
        await sb.current.from("conversations").update({ lead_status: lead }).eq("id", id);
        fetch("/api/pipedrive/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id }) }).catch(() => {});
      } catch { /* ignore */ }
    }
  }

  const list = convos
    .filter((c) => (tab === "unread" ? c.unread > 0 : tab === "hot" ? c.tag === "Hot" : true))
    .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || (c.waPhone || "").includes(q.replace(/[^0-9]/g, "")));

  return (
    <div className="page inbox-page">
      <div className={"inbox" + (showThread ? " show-thread" : "")}>
        <div className="conv-col">
          <div className="conv-head">
            <div className="conv-title">Inbox</div>
            <div className="list-search full"><Icon d={IC.search} s={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations…" /></div>
            <div className="seg-tabs">
              {([["all", "All"], ["unread", "Unread"], ["hot", "Hot"]] as const).map(([id, l]) => (
                <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="conv-list">
            {list.map((c) => (
              <div key={c.id} className={`conv-item ${c.id === activeId ? "active" : ""}`} onClick={() => openConvo(c)}>
                <Avatar name={c.name} size={42} />
                <div className="ci-main">
                  <div className="ci-top"><span className="ci-name">{c.name}</span><span className="ci-time">{c.time}</span></div>
                  <div className="ci-bottom">
                    <span className="ci-msg">{c.messages.length ? c.messages[c.messages.length - 1].t : c.live ? "Tap to open" : ""}</span>
                    {c.unread > 0 && <span className="unread">{c.unread}</span>}
                  </div>
                  {(c.tag || c.community) && <div className="ci-tags"><TagDot tag={c.tag} /><span className="ci-comm">{c.community}</span></div>}
                </div>
              </div>
            ))}
            {list.length === 0 && <div className="empty sm"><div>No conversations match.</div></div>}
          </div>
        </div>

        {active ? (
          <div className="thread-col">
            <div className="thread-head">
              <button className="icon-btn th-back" onClick={() => setShowThread(false)} title="Back"><Icon d={IC.cleft} s={18} /></button>
              <Avatar name={active.name} size={40} />
              <div className="th-main">
                <div className="th-name">{active.name}{active.blocked && <span style={{ color: "var(--red-ink)", fontSize: 11, marginLeft: 8 }}>blocked</span>}</div>
                <div className="th-sub">{active.phone}{active.community ? ` · ${active.community}` : ""}</div>
              </div>
              <select className="seltrig" value={active.lead || "new"} onChange={(e) => setLead(active.id, e.target.value)} title="Lead status" style={{ height: 32 }}>
                {LEADS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <a className="icon-btn" href={`tel:${(active.waPhone ? "+" + active.waPhone : active.phone).replace(/\s/g, "")}`} title="Call"><Icon d={IC.phone} s={17} /></a>
              <div style={{ position: "relative" }}>
                <button className="icon-btn" title="More" onClick={() => setMoreOpen((o) => !o)}><Icon d={IC.dots} s={17} /></button>
                {moreOpen && (
                  <>
                    <div className="acct-scrim" onClick={() => setMoreOpen(false)} />
                    <div className="avatar-menu" style={{ width: 210 }}>
                      <button className="am-item" onClick={() => { setMoreOpen(false); pushPipedrive(active); }}><Icon d={IC.users} s={16} />Push to Pipedrive</button>
                      <button className="am-item" onClick={() => { setMoreOpen(false); setLead(active.id, active.unread ? "new" : active.lead || "new"); markUnread(active); }}><Icon d={IC.inbox} s={16} />Mark as unread</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {active.live && active.waPhone && <CrmContext phone={active.waPhone} />}

            <div className="thread" ref={threadRef}>
              <div className="day-sep"><span>Today</span></div>
              {active.messages.map((m) => (
                <div key={m.id} className={`msg ${m.from}`}>
                  <div className="msg-bubble">
                    {m.media && (/\.pdf($|\?)/i.test(m.media)
                      ? <a href={mediaSrc(m.media)} target="_blank" rel="noreferrer" style={{ color: "var(--wa-blue)", display: "block", marginBottom: 4 }}>Open document ↗</a>
                      : <img src={mediaSrc(m.media)} alt="" />)}
                    {m.t}
                    <span className="msg-time">{m.at} {m.from === "out" && <Ticks status={m.status} />}</span>
                  </div>
                </div>
              ))}
              {active.live && !active.loaded && <div className="empty sm">Loading messages…</div>}
            </div>

            <div className="composer-bar">
              {tplOpen && (
                <div className="tpl-pop">
                  <div className="tpl-pop-head">Insert approved template</div>
                  {approved.map((t) => (
                    <div key={t.sid} className="tpl-pop-item" onClick={() => insertTemplate(t)}>
                      <div className="tp-n">{t.name}</div>
                      <div className="tp-p">{(t.body || "").replace(/\s+/g, " ").trim()}</div>
                    </div>
                  ))}
                  {approved.length === 0 && <div className="tpl-pop-item"><div className="tp-p">No approved templates.</div></div>}
                </div>
              )}
              {senders.length > 1 && (
                <select className="seltrig" value={sender} onChange={(e) => setSender(e.target.value)} title="Send from" style={{ height: 40, maxWidth: 150 }}>
                  {senders.map((s) => <option key={s} value={s}>{formatPhone(s)}</option>)}
                </select>
              )}
              <button className={`icon-btn ${tplOpen ? "on" : ""}`} title="Insert a template" onClick={() => setTplOpen((o) => !o)}><Icon d={IC.tmpl} s={18} /></button>
              {active.live && active.waPhone && <AttachMedia phone={active.waPhone} from={sender} onSent={() => loadMsgs(active.id)} />}
              <input className="msg-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message, or insert a template…" />
              <button className="btn btn-primary send-btn" onClick={send} disabled={sending}><Icon d={IC.send} s={16} f="currentColor" w={0} />{sending ? "…" : "Send"}</button>
            </div>
          </div>
        ) : (
          <div className="thread-col empty-thread">Select a conversation</div>
        )}
      </div>
    </div>
  );

  async function pushPipedrive(c: UIConv) {
    if (!c.live || !c.waPhone) { alert("Pipedrive push needs a live conversation."); return; }
    try {
      const res = await fetch("/api/pipedrive/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+" + c.waPhone, name: c.name }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      alert("Pushed to Pipedrive as a Hot lead.");
    } catch (e: any) {
      alert("Pipedrive push failed: " + e.message);
    }
  }
  async function markUnread(c: UIConv) {
    setConvos((p) => p.map((x) => (x.id === c.id ? { ...x, unread: 1 } : x)));
    if (c.live) { try { await sb.current.from("conversations").update({ unread: true }).eq("id", c.id); } catch { /* ignore */ } }
  }
}

/* CRM context bar — who this number is, pulled from the Audience CRM. */
function CrmContext({ phone }: { phone: string }) {
  const [c, setC] = useState<any>(undefined);
  useEffect(() => {
    setC(undefined);
    fetch(`/api/crm/contact?phone=${encodeURIComponent(phone)}`).then((r) => r.json()).then((d) => setC(d.contact || null)).catch(() => setC(null));
  }, [phone]);
  if (c === undefined) return <div className="ctx-bar"><span style={{ color: "var(--muted)" }}>Checking CRM…</span></div>;
  if (c === null) return <div className="ctx-bar"><span style={{ color: "var(--muted)" }}>Not in Audience CRM yet</span></div>;
  const chips = [c.community, c.building, c.unit_type, c.nationality, c.tier ? `Tier ${c.tier}` : null].filter(Boolean);
  return (
    <div className="ctx-bar">
      {c.name && <span style={{ fontWeight: 700, color: "var(--ink)" }}>{c.name}</span>}
      {chips.map((x: string, i: number) => <span key={i} className="ctx-chip">{x}</span>)}
      {chips.length === 0 && !c.name && <span style={{ color: "var(--muted)" }}>In CRM (no details)</span>}
    </div>
  );
}

/* Attach an image or PDF and send it as a media message (within 24h window). */
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
      const res = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "+" + phone, mediaUrl: ud.url, from: from || undefined }) });
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
    <>
      <button className="icon-btn" onClick={() => ref.current?.click()} disabled={busy} title="Attach image or PDF"><Icon d={IC.paperclip} s={18} /></button>
      <input ref={ref} type="file" accept="image/*,application/pdf" onChange={pick} style={{ display: "none" }} />
    </>
  );
}
