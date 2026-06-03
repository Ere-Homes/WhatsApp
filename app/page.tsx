"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

export default function Dashboard() {
  const [ins, setIns] = useState<any>(null);
  const [bill, setBill] = useState<any>(null);
  const [tpls, setTpls] = useState<any[] | null>(null);
  const [convs, setConvs] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const [insR, billR, tplR, convR] = await Promise.allSettled([
        fetch("/api/insights?days=7").then((r) => r.json()),
        fetch("/api/billing?days=30").then((r) => r.json()),
        fetch("/api/templates").then((r) => r.json()),
        sb.from("conversations").select("*").order("last_at", { ascending: false }).limit(100),
      ]);
      if (insR.status === "fulfilled") setIns(insR.value);
      if (billR.status === "fulfilled") setBill(billR.value);
      if (tplR.status === "fulfilled") setTpls(tplR.value.templates || []);
      if (convR.status === "fulfilled") setConvs((convR.value as any).data || []);
      setLoading(false);
    })();
  }, []);

  const t = ins?.totals;
  const unread = (convs || []).filter((c) => c.unread).length;
  const pending = (tpls || []).filter((x) => x.status !== "approved").length;
  const approved = (tpls || []).filter((x) => x.status === "approved").length;
  const bal = bill?.balance;
  const recent = (convs || []).slice(0, 6);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 26, margin: "0 0 18px" }}>Dashboard</h1>

      {loading && <div style={{ color: "#6B6862" }}>Loading…</div>}

      {!loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
            <Stat label="Conversations" value={convs?.length ?? "—"} href="/inbox" />
            <Stat label="Unread" value={unread} href="/inbox" color={unread ? "#137333" : undefined} />
            <Stat label="Sent · 7d" value={t?.outbound ?? "—"} href="/insights" />
            <Stat label="Delivery rate" value={t ? `${t.deliveryRate}%` : "—"} href="/insights" />
            <Stat label="Read rate" value={t ? `${t.readRate}%` : "—"} href="/insights" />
            <Stat label="Failed · 7d" value={t ? t.failed + t.undelivered : "—"} href="/insights" color={t && t.failed + t.undelivered ? "#b00020" : undefined} />
            <Stat label="Balance" value={bal ? `${bal.currency} ${parseFloat(bal.balance).toFixed(2)}` : "—"} href="/billing" />
            <Stat label="Templates" value={tpls ? `${approved}✓ / ${pending}…` : "—"} href="/templates" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
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
          </div>
        </>
      )}
    </div>
  );
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
