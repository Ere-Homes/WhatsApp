"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Campaign = {
  id: string; name: string; template_name: string | null; sender: string | null;
  mode: string; total: number; sent: number; scheduled: number; failed: number; skipped: number;
  status: string; finish_at: string | null; created_at: string;
};
type Recipient = { status: string | null; created_at: string; scheduled_at?: string | null; conversation: { wa_phone: string; name: string | null } | null };

type Funnel = { sent: number; delivered: number; read: number; failed: number; deliveryRate: number; readRate: number };

export default function CampaignHistory() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [funnels, setFunnels] = useState<Record<string, Funnel>>({});
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0); // 1s heartbeat so countdowns/progress bars move live

  async function load() {
    const { data } = await sb.from("campaigns").select("*").order("created_at", { ascending: false }).limit(100);
    setRows((data as Campaign[]) || []);
  }
  async function refreshAll() {
    // Reconcile active campaigns' counts from delivery receipts, then reload + funnel.
    await fetch("/api/campaign/refresh", { method: "POST" }).catch(() => {});
    await load();
    fetch("/api/campaign/funnel").then((r) => r.json()).then((d) => setFunnels(d.funnel || {})).catch(() => {});
    setUpdatedAt(Date.now());
  }
  useEffect(() => { refreshAll(); }, []); // eslint-disable-line

  // While any campaign is still sending/scheduled, poll every 20s so the tracker
  // moves on its own (scheduled -> sent -> delivered) without a manual reload.
  const hasActive = (rows || []).some((c) => c.status === "sending" || c.status === "scheduled");
  useEffect(() => {
    if (!hasActive) return;
    const poll = setInterval(refreshAll, 20000);
    const beat = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(beat); };
  }, [hasActive]); // eslint-disable-line

  async function cancel(c: Campaign) {
    if (!confirm(`Cancel the ${c.scheduled} scheduled message(s) still pending in "${c.name}"? Already-sent messages can't be recalled.`)) return;
    const res = await fetch("/api/campaign/cancel", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }),
    });
    const d = await res.json();
    if (!res.ok) return alert("Cancel failed: " + (d.error || ""));
    alert(`Canceled ${d.canceled} pending message(s).` + (d.alreadyGone ? ` ${d.alreadyGone} had already sent.` : ""));
    load();
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: "0 0 6px" }}>Campaign log</h1>
        <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
          <Link href="/templates/performance" style={{ fontSize: 13, color: "#6B6862", textDecoration: "none", whiteSpace: "nowrap" }}>Template performance →</Link>
          <Link href="/campaigns" style={{ fontSize: 13, color: "#6B6862", textDecoration: "none", whiteSpace: "nowrap" }}>+ New campaign</Link>
        </div>
      </div>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: hasActive ? 8 : 20 }}>
        Every bulk send, with delivery results. Scheduled campaigns can be canceled before they go out.
      </p>
      {hasActive && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#137333", marginBottom: 18 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#137333", display: "inline-block" }} />
          Live · auto-updating every 20s{updatedAt ? ` · last ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </div>
      )}

      {rows === null && <div style={{ color: "#6B6862" }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ color: "#9a958c", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 24, textAlign: "center" }}>No campaigns yet. <Link href="/campaigns" style={{ color: "#137333" }}>Send your first →</Link></div>}

      {(rows || []).map((c) => {
        const canCancel = c.status === "scheduled" && c.scheduled > 0;
        return (
          <div key={c.id} style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#9a958c", marginTop: 2 }}>
                  {new Date(c.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {c.sender && <> · from +{c.sender.replace("whatsapp:+", "").replace("+", "")}</>}
                  {c.mode !== "now" && <> · {c.mode}</>}
                </div>
              </div>
              {(() => { const ds = displayStatus(c, funnels[c.id]); return (
                <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: ds.color, border: `1px solid ${ds.color}`, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>{ds.label}</span>
              ); })()}
            </div>

            <Coverage c={c} f={funnels[c.id]} />
            <DripTracker c={c} />

            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <button onClick={() => setOpenId(openId === c.id ? null : c.id)} style={linkBtn}>
                {openId === c.id ? "Hide recipients" : "View recipients"}
              </button>
              {canCancel && <button onClick={() => cancel(c)} style={{ ...linkBtn, color: "#b00020" }}>Cancel scheduled</button>}
            </div>

            {openId === c.id && <Recipients campaignId={c.id} />}
          </div>
        );
      })}
    </div>
  );
}

// Per-recipient delivery report for one campaign.
function Recipients({ campaignId }: { campaignId: string }) {
  const sb = supabaseBrowser();
  const [list, setList] = useState<Recipient[] | null>(null);
  useEffect(() => {
    // select * so the scheduled_at column (once added) lights up automatically
    // without 400-ing while it does not exist yet.
    sb.from("messages")
      .select("*, conversation(wa_phone, name)")
      .eq("campaign", campaignId)
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => setList((data as any as Recipient[]) || []));
  }, [campaignId]); // eslint-disable-line

  if (list === null) return <div style={{ fontSize: 13, color: "#9a958c", marginTop: 10 }}>Loading recipients…</div>;
  if (list.length === 0) return <div style={{ fontSize: 13, color: "#9a958c", marginTop: 10 }}>No recipient records.</div>;

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #F0EEE9", paddingTop: 10, maxHeight: 320, overflowY: "auto" }}>
      {list.map((r, i) => {
        const isSched = r.status === "scheduled";
        const when = isSched && r.scheduled_at ? r.scheduled_at : r.created_at;
        const timeLabel = when ? `${isSched ? "scheduled for" : "sent"} ${new Date(when).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "";
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #F5F5F5", fontSize: 13 }}>
            <div style={{ minWidth: 0, overflow: "hidden" }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.conversation?.name || (r.conversation?.wa_phone ? "+" + r.conversation.wa_phone : "-")}
              </div>
              {timeLabel && <div style={{ fontSize: 11, color: isSched ? "#1a73e8" : "#9a958c", marginTop: 1 }}>{timeLabel}</div>}
            </div>
            <span style={{ ...statusPill(r.status), flexShrink: 0, marginLeft: 10 }}>{r.status || "-"}</span>
          </div>
        );
      })}
    </div>
  );
}

function statusPill(status: string | null): React.CSSProperties {
  const map: Record<string, string> = {
    read: "#1a73e8", delivered: "#137333", sent: "#137333", queued: "#9a6700", accepted: "#9a6700",
    scheduled: "#1a73e8", failed: "#b00020", undelivered: "#b00020", canceled: "#6B6862",
  };
  const c = map[status || ""] || "#6B6862";
  return { fontSize: 11, color: c, border: `1px solid ${c}`, borderRadius: 12, padding: "1px 8px", textTransform: "uppercase", letterSpacing: 0.5 };
}
// Honest, at-a-glance coverage from real WhatsApp receipts (NOT the rollup
// counters, which drift). Of everyone we meant to message: how many reached a
// handset, how many are still in flight, how many failed, how many never sent.
function reach(c: Campaign, f: Funnel | undefined) {
  const total = c.total || 0;
  const delivered = f?.delivered || 0;        // reached a handset (includes read)
  const read = f?.read || 0;
  const failed = f?.failed || 0;
  const acceptedByWa = f?.sent || 0;          // accepted by WhatsApp, not failed
  const pending = Math.max(0, acceptedByWa - delivered); // queued/sent/scheduled, no receipt yet
  const notSent = Math.max(0, total - acceptedByWa - failed);
  return { total, delivered, read, failed, pending, notSent, deliveryRate: f?.deliveryRate || 0 };
}
// Status the user can trust: an old "completed" run that never reached everyone
// is shown as "Incomplete", so the label matches reality.
function displayStatus(c: Campaign, f: Funnel | undefined): { label: string; color: string } {
  if (c.status === "scheduled") return { label: "Scheduled", color: "#1a73e8" };
  if (c.status === "sending") return { label: "Sending", color: "#9a6700" };
  if (c.status === "canceled") return { label: "Canceled", color: "#6B6862" };
  if (c.status === "incomplete" || (c.status === "completed" && reach(c, f).notSent > 0))
    return { label: "Incomplete", color: "#c1571f" };
  return { label: "Completed", color: "#137333" };
}
function Coverage({ c, f }: { c: Campaign; f: Funnel | undefined }) {
  const r = reach(c, f);
  const w = (n: number) => `${(n / Math.max(1, r.total)) * 100}%`;
  const Legend = ({ n, label, color }: { n: number; label: string; color: string }) =>
    n > 0 ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
        <b style={{ color }}>{n.toLocaleString()}</b> {label}
      </span>
    ) : null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, marginBottom: 7 }}>
        <b style={{ fontSize: 19, color: "#141414" }}>{r.delivered.toLocaleString()}</b>
        <span style={{ color: "#9a958c" }}> of {r.total.toLocaleString()} reached</span>
        {r.delivered > 0 && <span style={{ color: "#9a958c" }}> · {r.deliveryRate}%</span>}
      </div>
      <div style={{ display: "flex", height: 9, borderRadius: 6, overflow: "hidden", background: "#EDEBE7" }}>
        <div style={{ width: w(r.delivered), background: "#137333" }} />
        <div style={{ width: w(r.pending), background: "#e0a106" }} />
        <div style={{ width: w(r.failed), background: "#c0341d" }} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 7, fontSize: 12, color: "#6B6862", flexWrap: "wrap" }}>
        <Legend n={r.delivered} label="delivered" color="#137333" />
        <Legend n={r.read} label="read" color="#1a73e8" />
        <Legend n={r.pending} label="pending" color="#e0a106" />
        <Legend n={r.failed} label="failed" color="#c0341d" />
        <Legend n={r.notSent} label="not sent" color="#b8b2a8" />
      </div>
    </div>
  );
}
// Live progress for a time-spread (drip/scheduled) send still in flight: a bar
// over the send window plus a countdown, so you can watch it finish instead of
// blindly waiting. Re-renders every second via the page's heartbeat tick.
function DripTracker({ c }: { c: Campaign }) {
  if (!(c.status === "scheduled" || c.status === "sending") || !c.finish_at) return null;
  const start = new Date(c.created_at).getTime();
  const end = new Date(c.finish_at).getTime();
  const now = Date.now();
  const span = Math.max(1, end - start);
  const pct = Math.max(0, Math.min(100, ((now - start) / span) * 100));
  const remainMin = Math.max(0, Math.round((end - now) / 60000));
  const done = now >= end;
  const remainLabel = remainMin >= 60 ? `~${Math.floor(remainMin / 60)}h ${remainMin % 60}m left` : `~${remainMin} min left`;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, color: "#1a73e8", marginBottom: 5 }}>
        <span>{done ? "Finishing up…" : remainLabel}{c.scheduled > 0 ? ` · ${c.scheduled} still scheduled` : ""}</span>
        <span>finishes {new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div style={{ height: 6, borderRadius: 6, background: "#E7EEFB", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#1a73e8", transition: "width .6s linear" }} />
      </div>
    </div>
  );
}
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#137333", textDecoration: "underline" };
