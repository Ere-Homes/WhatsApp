"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

export default function Dashboard() {
  const [ins, setIns] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  const [tpls, setTpls] = useState<any[] | null>(null);
  const [convs, setConvs] = useState<any[] | null>(null);
  const [health, setHealth] = useState<any[] | null>(null);
  const [camps, setCamps] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const [insR, billR, tplR, convR, healthR, campR] = await Promise.allSettled([
        fetch("/api/insights?days=7").then((r) => r.json()),
        fetch("/api/billing?days=30").then((r) => r.json()),
        fetch("/api/templates").then((r) => r.json()),
        sb.from("conversations").select("*").order("last_at", { ascending: false }).limit(100),
        fetch("/api/health").then((r) => r.json()),
        sb.from("campaigns").select("*").in("status", ["sending", "scheduled"]).order("created_at", { ascending: false }).limit(10),
      ]);
      if (insR.status === "fulfilled") setIns(insR.value);
      if (billR.status === "fulfilled") setBill(billR.value);
      if (tplR.status === "fulfilled") setTpls(tplR.value.templates || []);
      if (convR.status === "fulfilled") setConvs((convR.value as any).data || []);
      if (healthR.status === "fulfilled") setHealth(healthR.value.senders || []);
      if (campR.status === "fulfilled") setCamps((campR.value as any).data || []);
      setLoading(false);
    })();
  }, []);

  const t = ins?.totals;
  const unread = (convs || []).filter((c) => c.unread).length;
  const pending = (tpls || []).filter((x) => x.status !== "approved").length;
  const approved = (tpls || []).filter((x) => x.status === "approved").length;
  const bal = bill?.balance;
  const recent = (convs || []).slice(0, 6);
  const failed = t ? t.failed + t.undelivered : 0;
  const qualityWarn = (health || []).filter((s) => ["LOW", "MEDIUM"].includes((s.quality || "").toUpperCase()));

  // Things that need action today, most urgent first.
  const attention: { tone: "green" | "amber" | "red"; text: string; href: string; cta: string }[] = [];
  if (unread) attention.push({ tone: "green", text: `${unread} unread lead${unread === 1 ? "" : "s"} waiting for a reply`, href: "/inbox", cta: "Open inbox" });
  if (failed) attention.push({ tone: "red", text: `${failed} message${failed === 1 ? "" : "s"} failed or undelivered (last 7 days)`, href: "/insights", cta: "Review" });
  qualityWarn.forEach((s) => attention.push({ tone: "amber", text: `Number +${s.sender} quality is ${s.quality} — slow down sending`, href: "/billing", cta: "" }));
  if (pending) attention.push({ tone: "amber", text: `${pending} template${pending === 1 ? "" : "s"} awaiting approval`, href: "/templates", cta: "View" });

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 26, margin: "0 0 18px" }}>Dashboard</h1>

      {loading && <div style={{ color: "#6B6862" }}>Loading…</div>}

      {!loading && (
        <>
          {/* Needs attention */}
          <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18, marginBottom: 22 }}>
            <div style={{ fontWeight: 600, marginBottom: attention.length ? 10 : 0 }}>Needs attention</div>
            {attention.length === 0 && <div style={{ color: "#6B6862", fontSize: 14 }}>You're all caught up — nothing needs action right now.</div>}
            {attention.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < attention.length - 1 ? "1px solid #F0EEE9" : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: a.tone === "red" ? "#b00020" : a.tone === "amber" ? "#9a6700" : "#137333" }} />
                <span style={{ flex: 1, fontSize: 14 }}>{a.text}</span>
                {a.cta && <Link href={a.href} style={{ fontSize: 13, color: "#137333", textDecoration: "none", whiteSpace: "nowrap" }}>{a.cta} →</Link>}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
            <Stat label="Conversations" value={convs?.length ?? "—"} href="/inbox" />
            <Stat label="Unread" value={unread} href="/inbox" color={unread ? "#137333" : undefined} />
            <Stat label="Sent · 7d" value={t?.outbound ?? "—"} href="/insights" />
            <Stat label="Delivery rate" value={t ? `${t.deliveryRate}%` : "—"} href="/insights" />
            <Stat label="Read rate" value={t ? `${t.readRate}%` : "—"} href="/insights" />
            <Stat label="Failed · 7d" value={t ? t.failed + t.undelivered : "—"} href="/insights" color={t && t.failed + t.undelivered ? "#b00020" : undefined} />
            <Stat label="Balance" value={bal ? `${bal.currency} ${parseFloat(bal.balance).toFixed(2)}` : "—"} href="/billing" />
            <Stat label="Approved templates" value={tpls ? approved : "—"} href="/templates" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            {/* Active campaigns */}
            {camps && camps.length > 0 && (
              <Panel title="Active campaigns" link={{ href: "/campaigns/history", label: "Campaign log →" }}>
                {camps.map((c) => {
                  const pct = c.total ? Math.round(((c.sent + c.scheduled) / c.total) * 100) : 0;
                  return (
                    <Link key={c.id} href="/campaigns/history" style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ padding: "10px 0", borderBottom: "1px solid #F0EEE9" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: c.status === "scheduled" ? "#1a73e8" : "#9a6700", flexShrink: 0 }}>{c.status}</span>
                        </div>
                        <div style={{ height: 6, background: "#E4E1DB", borderRadius: 6, overflow: "hidden", margin: "6px 0 4px" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: c.status === "scheduled" ? "#1a73e8" : "#137333" }} />
                        </div>
                        <div style={{ fontSize: 12, color: "#6B6862" }}>
                          {c.sent} sent{c.scheduled ? ` · ${c.scheduled} scheduled` : ""} of {c.total}
                          {c.finish_at && c.status === "scheduled" && <> · finishes {new Date(c.finish_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </Panel>
            )}

            {/* Recent conversations */}
            <Panel title="Recent conversations" link={{ href: "/inbox", label: "Open inbox →" }}>
              {recent.length === 0 && <Empty>No conversations yet.</Empty>}
              {recent.map((c) => (
                <Link key={c.id} href="/inbox" style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F0EEE9" }}>
                    {c.unread && <span style={{ width: 8, height: 8, borderRadius: 8, background: "#137333", flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: c.unread ? 700 : 600, fontSize: 14 }}>{c.name || "+" + c.wa_phone}</div>
                      <div style={{ fontSize: 12, color: "#6B6862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_body}</div>
                    </div>
                    {c.last_at && <span style={{ fontSize: 11, color: "#9a958c" }}>{new Date(c.last_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>}
                  </div>
                </Link>
              ))}
            </Panel>

            {/* Templates + quick actions */}
            <Panel title="Templates" link={{ href: "/templates", label: "Manage →" }}>
              {(tpls || []).slice(0, 6).map((x) => (
                <div key={x.sid} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F0EEE9", fontSize: 14 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: x.status === "approved" ? "#137333" : x.status === "rejected" ? "#b00020" : "#9a6700" }}>{x.status}</span>
                </div>
              ))}
              {tpls && tpls.length === 0 && <Empty>No templates yet.</Empty>}
            </Panel>

            {/* WhatsApp number health — Meta-set quality + tier */}
            {health && health.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Number health</div>
                {health.map((s) => (
                  <div key={s.sender} style={{ padding: "10px 0", borderBottom: "1px solid #F0EEE9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>+{s.sender}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: qualityColor(s.quality), border: `1px solid ${qualityColor(s.quality)}`, borderRadius: 20, padding: "2px 10px" }}>
                        {s.quality || "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6B6862", marginTop: 4 }}>
                      {s.status && <>{s.status === "ONLINE" ? "Online" : s.status} · </>}Limit: {s.limit || "—"}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#9a958c", marginTop: 8 }}>Set by Meta. Green = healthy; keep volume gradual to climb tiers.</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function qualityColor(q?: string | null) {
  const v = (q || "").toUpperCase();
  if (v === "HIGH" || v === "GREEN") return "#137333";
  if (v === "MEDIUM" || v === "YELLOW") return "#9a6700";
  if (v === "LOW" || v === "RED") return "#b00020";
  return "#9a958c";
}

function Stat({ label, value, href, color }: { label: string; value: any; href: string; color?: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, transition: "border-color .15s" }}>
        <div style={{ fontSize: 12, color: "#6B6862", marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 600, color: color || "#141414" }}>{value}</div>
      </div>
    </Link>
  );
}
function Panel({ title, link, children }: { title: string; link: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <Link href={link.href} style={{ fontSize: 12, color: "#6B6862", textDecoration: "none" }}>{link.label}</Link>
      </div>
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#9a958c", fontSize: 14, padding: "8px 0" }}>{children}</div>;
}
