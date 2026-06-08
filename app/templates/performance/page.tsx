"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function TemplatePerformance() {
  const [tpls, setTpls] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => setTpls(d.templates || []));
    fetch("/api/templates/performance").then((r) => r.json()).then((d) => setStats(d.stats || {}));
  }, []);

  // Show templates that have actually been sent, busiest first.
  const rows = tpls
    .map((t) => ({ ...t, s: stats?.[t.sid] }))
    .filter((t) => t.s && t.s.sent > 0)
    .sort((a, b) => b.s.sent - a.s.sent);

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: "0 0 6px" }}>Template performance</h1>
        <Link href="/templates" style={{ fontSize: 13, color: "#6B6862", textDecoration: "none", whiteSpace: "nowrap" }}>← Templates</Link>
      </div>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        How each template actually performs (last 90 days), with the biggest funnel leak and
        the next action for each. Reply rate = share of recipients who messaged back.
      </p>

      {stats === null && <div style={{ color: "#6B6862" }}>Loading…</div>}
      {stats && rows.length === 0 && (
        <div style={{ color: "#9a958c", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 24, textAlign: "center" }}>
          No template sends yet. Run a <Link href="/campaigns" style={{ color: "#137333" }}>campaign</Link> or send a template from the inbox.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "12px 16px", borderBottom: "1px solid #E4E1DB", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#9a958c" }}>
            <span>Template</span><span style={{ textAlign: "right" }}>Sent</span><span style={{ textAlign: "right" }}>Delivered</span><span style={{ textAlign: "right" }}>Read</span><span style={{ textAlign: "right" }}>Reply</span>
          </div>
          {rows.map((t) => {
            const d = diagnose(t.s);
            return (
              <div key={t.sid} style={{ borderBottom: "1px solid #F0EEE9" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 8, padding: "14px 16px 6px", alignItems: "center", fontSize: 14 }}>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <span style={{ textAlign: "right", fontWeight: 600 }}>{t.s.sent}</span>
                  <Rate pct={t.s.deliveryRate} />
                  <Rate pct={t.s.readRate} good={60} />
                  <Rate pct={t.s.replyRate} good={10} mid={3} />
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "0 16px 14px", fontSize: 12.5 }}>
                  <span style={{ flexShrink: 0, fontWeight: 700, color: d.color }}>{d.leak}</span>
                  <span style={{ color: "#3a3a3a" }}>{d.action}</span>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "#9a958c", padding: "10px 16px" }}>
            Delivered/Read come from WhatsApp receipts; reply rate counts conversations that messaged back after the send.
            Benchmarks: delivery 90%+, read 60%+ (of delivered), reply 3%+ (good 10%+).
          </div>
        </div>
      )}
    </div>
  );
}

// Color a percentage: green if at/above `good`, amber above `mid`, grey below.
function Rate({ pct, good = 90, mid = 50 }: { pct: number; good?: number; mid?: number }) {
  const color = pct >= good ? "#137333" : pct >= mid ? "#9a6700" : "#6B6862";
  return <span style={{ textAlign: "right", color, fontWeight: 600 }}>{pct}%</span>;
}

// Find the first funnel stage that under-performs and return the playbook action for it.
// Order matters: a leak early in the funnel (delivery) must be fixed before a later one.
function diagnose(s: any): { leak: string; color: string; action: string } {
  const readOfDelivered = s.delivered ? Math.round((s.read / s.delivered) * 100) : 0;
  if (s.deliveryRate < 90)
    return { leak: "Delivery low", color: "#b3261e", action: "Likely dead numbers or sender health. Send to clean mobiles only and warm up the number within daily caps." };
  if (readOfDelivered < 50)
    return { leak: "Read low", color: "#9a6700", action: "Timing or sender trust. Send 10:00-13:00 or 17:00-20:00 GST, use an image header and the brand name." };
  if (s.replyRate < 3)
    return { leak: "Reply low", color: "#9a6700", action: "Weak hook, CTA or targeting. Front-load a value hook, keep one quick-reply CTA, tighten the audience." };
  if (s.replied > 0)
    return { leak: "Capture replies", color: "#137333", action: "Engagement is healthy. Make sure replies route to Pipedrive and an agent calls within minutes." };
  return { leak: "Healthy", color: "#137333", action: "Funnel looks good. Scale within warm-up caps and test one change at a time." };
}
