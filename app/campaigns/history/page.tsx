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

const STATUS_COLOR: Record<string, string> = {
  sending: "#9a6700", scheduled: "#1a73e8", completed: "#137333", canceled: "#6B6862", incomplete: "#c1571f",
};

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
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: STATUS_COLOR[c.status] || "#6B6862", border: `1px solid ${STATUS_COLOR[c.status] || "#ccc"}`, borderRadius: 20, padding: "3px 10px", whiteSpace: "nowrap" }}>{c.status}</span>
            </div>

            <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", fontSize: 13 }}>
              <Metric label="Recipients" value={c.total} />
              <Metric label="Sent" value={c.sent} color="#137333" />
              {c.scheduled > 0 && <Metric label="Scheduled" value={c.scheduled} color="#1a73e8" />}
              {c.skipped > 0 && <Metric label="Skipped" value={c.skipped} color="#6B6862" />}
              {c.failed > 0 && <Metric label="Failed" value={c.failed} color="#b00020" />}
            </div>
            <FunnelBar f={funnels[c.id]} sent={c.sent} />
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
// Delivered/Read funnel for a campaign, from WhatsApp receipts. A thin stacked
// bar (read ⊆ delivered ⊆ sent) plus the headline rates.
function FunnelBar({ f, sent }: { f: Funnel | undefined; sent: number }) {
  if (!f || f.sent === 0) return null;
  const base = f.sent || sent || 1;
  const pct = (n: number) => `${Math.min(100, Math.round((n / base) * 100))}%`;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ position: "relative", height: 8, borderRadius: 6, background: "#EDEBE7", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, width: pct(f.delivered), background: "#9BD2A8" }} />
        <div style={{ position: "absolute", inset: 0, width: pct(f.read), background: "#1a73e8" }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 12, color: "#6B6862", flexWrap: "wrap" }}>
        <span><b style={{ color: "#137333" }}>{f.delivered.toLocaleString()}</b> delivered · {f.deliveryRate}%</span>
        <span><b style={{ color: "#1a73e8" }}>{f.read.toLocaleString()}</b> read · {f.readRate}% of delivered</span>
        {f.failed > 0 && <span><b style={{ color: "#b00020" }}>{f.failed.toLocaleString()}</b> failed</span>}
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
function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#9a958c" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || "#141414" }}>{value}</div>
    </div>
  );
}
const linkBtn: React.CSSProperties = { background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#137333", textDecoration: "underline" };
