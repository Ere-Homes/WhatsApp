"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, IC, PageHead, Skeleton } from "@/lib/ui";

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

  // Headline rollups across all sent templates (pure derived view, no extra fetch).
  const totalSent = rows.reduce((n, t) => n + (t.s.sent || 0), 0);
  const totalReplied = rows.reduce((n, t) => n + (t.s.replied || 0), 0);
  const avgReply = totalSent ? Math.round((totalReplied / totalSent) * 100) : 0;

  return (
    <div className="page"><div className="maxw">
      <PageHead
        title="Template performance"
        sub="How each template actually performs (last 90 days), with the biggest funnel leak and the next action for each. Reply rate = share of recipients who messaged back."
      >
        <Link href="/templates" className="btn btn-sec"><Icon d={IC.tmpl} s={15} />Templates</Link>
      </PageHead>

      {stats === null && <Skeleton rows={6} />}

      {stats && rows.length === 0 && (
        <div className="empty">
          <div className="ei"><Icon d={IC.trend} s={22} /></div>
          <h4>No template sends yet</h4>
          <div>Run a <Link href="/campaigns" style={{ color: "var(--blue)", fontWeight: 600 }}>campaign</Link> or send a template from the inbox.</div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="kpis k4">
            <div className="kpi"><div className="kl">Templates tracked</div><div className="kv">{rows.length}</div><div className="ks">sent · 90d</div></div>
            <div className="kpi"><div className="kl">Total sent</div><div className="kv">{totalSent.toLocaleString()}</div><div className="ks">last 90 days</div></div>
            <div className="kpi"><div className="kl">Replies</div><div className="kv">{totalReplied.toLocaleString()}</div><div className="ks">messaged back</div></div>
            <div className="kpi"><div className="kl">Avg reply rate</div><div className="kv">{avgReply}%</div><div className="ks">across templates</div></div>
          </div>

          <div className="bar" style={{ borderBottom: "none" }}>
            <div className="card-t" style={{ padding: "0 0 11px" }}>Funnel by template</div>
          </div>
          <div className="panel" style={{ borderTop: "1px solid var(--border)", borderRadius: "var(--r-lg)" }}>
            <table className="ttable">
              <thead>
                <tr>
                  <th>Template</th>
                  <th style={{ textAlign: "right" }}>Sent</th>
                  <th style={{ textAlign: "right" }}>Delivered</th>
                  <th style={{ textAlign: "right" }}>Read</th>
                  <th style={{ textAlign: "right" }}>Reply</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const d = diagnose(t.s);
                  return (
                    <tr className="norow" key={t.sid}>
                      <td>
                        <div className="cell-name">
                          <span className="tkind text"><Icon d={IC.tmpl} s={16} /></span>
                          <div className="nm">
                            <div className="t" title={t.name}>{t.name}</div>
                            <div className="p" style={{ color: d.color, fontWeight: 600 }}>
                              <b>{d.leak}.</b> {d.action}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{t.s.sent.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}><Rate pct={t.s.deliveryRate} /></td>
                      <td style={{ textAlign: "right" }}><Rate pct={t.s.readRate} good={60} /></td>
                      <td style={{ textAlign: "right" }}><Rate pct={t.s.replyRate} good={10} mid={3} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Delivered/Read come from WhatsApp receipts; reply rate counts conversations that messaged back after the send.
            Benchmarks: delivery 90%+, read 60%+ (of delivered), reply 3%+ (good 10%+).
          </div>
        </>
      )}
    </div></div>
  );
}

// Color a percentage: green if at/above `good`, amber above `mid`, grey below.
function Rate({ pct, good = 90, mid = 50 }: { pct: number; good?: number; mid?: number }) {
  const color = pct >= good ? "var(--green-ink)" : pct >= mid ? "var(--amber-ink)" : "var(--ink-3)";
  return <span style={{ color, fontWeight: 600 }}>{pct}%</span>;
}

// Find the first funnel stage that under-performs and return the playbook action for it.
// Order matters: a leak early in the funnel (delivery) must be fixed before a later one.
function diagnose(s: any): { leak: string; color: string; action: string } {
  const readOfDelivered = s.delivered ? Math.round((s.read / s.delivered) * 100) : 0;
  if (s.deliveryRate < 90)
    return { leak: "Delivery low", color: "var(--red-ink)", action: "Likely dead numbers or sender health. Send to clean mobiles only and warm up the number within daily caps." };
  if (readOfDelivered < 50)
    return { leak: "Read low", color: "var(--amber-ink)", action: "Timing or sender trust. Send 10:00-13:00 or 17:00-20:00 GST, use an image header and the brand name." };
  if (s.replyRate < 3)
    return { leak: "Reply low", color: "var(--amber-ink)", action: "Weak hook, CTA or targeting. Front-load a value hook, keep one quick-reply CTA, tighten the audience." };
  if (s.replied > 0)
    return { leak: "Capture replies", color: "var(--green-ink)", action: "Engagement is healthy. Make sure replies route to Pipedrive and an agent calls within minutes." };
  return { leak: "Healthy", color: "var(--green-ink)", action: "Funnel looks good. Scale within warm-up caps and test one change at a time." };
}
