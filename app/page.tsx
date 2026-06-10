"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, IC, Avatar, PageHead } from "@/lib/ui";
import { supabaseBrowser } from "@/lib/supabase";

type Recent = { name: string; msg: string; time: string; unread: number; tag: string };
type Perf = { name: string; sent: number; replyRate: number };
type Kpis = { conversations: number | null; response: number | null; campaigns: number | null; leads: number | null };
const dash = (n: number | null) => (n === null ? "—" : n);

// datetime-local <-> Date helpers (local time, minute precision), matching Insights.
const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const QUICK: [string, number][] = [["24h", 24], ["7d", 168], ["30d", 720], ["90d", 2160]];

function TagDot({ tag }: { tag: string }) {
  if (!tag) return null;
  const c = tag === "Hot" ? "var(--red)" : "var(--amber-dot)";
  return <span className="leadtag"><span className="d" style={{ background: c }} />{tag}</span>;
}

function relTime(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const router = useRouter();
  const go = (p: string) => router.push(p);
  // Start empty (null) so nothing renders as real until the live backend
  // answers. A dash shows for unknown values; cards show loading/empty states.
  const [kpis, setKpis] = useState<Kpis>({ conversations: null, response: null, campaigns: null, leads: null });
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [perf, setPerf] = useState<Perf[] | null>(null);

  // Date range that drives the KPI bar. Default window: last 24 hours.
  const [to, setTo] = useState(() => toInput(new Date()));
  const [from, setFrom] = useState(() => toInput(new Date(Date.now() - 24 * 3600000)));
  const setQuick = (hours: number) => { const n = new Date(); setTo(toInput(n)); setFrom(toInput(new Date(n.getTime() - hours * 3600000))); };
  const hrs = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 3600000));
  const spanLabel = hrs <= 48 ? `${hrs}h` : `${Math.round(hrs / 24)}d`;

  // Range-independent data: recent conversations, active campaigns, template
  // performance. These are "latest" / live-status / 90d by nature, so the date
  // range doesn't apply — load them once on mount.
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const [convR, campR] = await Promise.allSettled([
        sb.from("conversations").select("*").order("last_at", { ascending: false }).limit(50),
        sb.from("campaigns").select("id,status").in("status", ["sending", "scheduled"]),
      ]);

      let convs: any[] = [];
      if (convR.status === "fulfilled" && (convR.value as any).data?.length) {
        convs = (convR.value as any).data;
      }
      setKpis((k) => ({
        ...k,
        campaigns: campR.status === "fulfilled" && (campR.value as any).data ? (campR.value as any).data.length : k.campaigns,
      }));

      const tagOf = (s?: string) => (s || "").toLowerCase() === "hot" ? "Hot" : (s || "").toLowerCase() === "warm" ? "Warm" : "";
      setRecent(convs.slice(0, 5).map((c) => ({
        name: c.name || "+" + c.wa_phone,
        msg: c.last_body || "",
        time: relTime(c.last_at),
        unread: c.unread ? 1 : 0,
        tag: tagOf(c.lead_status),
      })));
    })().catch(() => setRecent([]));

    // Real per-template performance, busiest first (top 4).
    Promise.all([
      fetch("/api/templates").then((r) => r.json()).catch(() => ({})),
      fetch("/api/templates/performance").then((r) => r.json()).catch(() => ({})),
    ]).then(([t, p]) => {
      const tpls: any[] = t.templates || [];
      const stats: Record<string, any> = p.stats || {};
      setPerf(
        tpls
          .map((x) => ({ name: x.name, s: stats[x.sid] }))
          .filter((x) => x.s && x.s.sent > 0)
          .sort((a, b) => b.s.sent - a.s.sent)
          .slice(0, 4)
          .map((x) => ({ name: x.name, sent: x.s.sent, replyRate: x.s.replyRate })),
      );
    }).catch(() => setPerf([]));
  }, []);

  // Range-driven KPIs: conversations + response rate (Twilio insights) and new
  // leads (Hot/Warm contacts who actually replied inbound in the window).
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const fromISO = new Date(from).toISOString();
      const toISO = new Date(to).toISOString();
      const qs = `from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`;
      const [insR, repliedR, hotR] = await Promise.allSettled([
        fetch(`/api/insights?${qs}`).then((r) => r.json()),
        // New leads = people who actually replied (inbound) inside the window...
        sb.from("messages").select("conversation").eq("direction", "in").gte("created_at", fromISO).lte("created_at", toISO),
        // ...and are tagged Hot/Warm. The intersection = "replied positively in range".
        sb.from("conversations").select("id,lead_status").in("lead_status", ["hot", "warm"]),
      ]);

      setKpis((k) => {
        const next = { ...k };
        if (insR.status === "fulfilled" && insR.value?.totals) {
          const t = insR.value.totals;
          next.response = typeof t.readRate === "number" && t.outbound ? t.readRate : (t.outbound + t.inbound > 0 ? 0 : null);
          next.conversations = typeof t.outbound === "number" ? t.outbound + t.inbound : next.conversations;
        }
        // Always assign (even 0) so a stale value from a wider window can't linger.
        if (repliedR.status === "fulfilled" && hotR.status === "fulfilled") {
          const repliedIds = new Set(((repliedR.value as any).data || []).map((m: any) => m.conversation));
          next.leads = ((hotR.value as any).data || []).filter((c: any) => repliedIds.has(c.id)).length;
        }
        return next;
      });
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Overview" sub="Your WhatsApp channel at a glance.">
        <div className="seg">
          {QUICK.map(([id, h]) => (
            <button key={id} className={spanLabel === id ? "on" : ""} onClick={() => setQuick(h)}>{id}</button>
          ))}
        </div>
        <input type="datetime-local" className="input" style={{ width: 178, marginBottom: 0 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} title="From" />
        <span style={{ color: "var(--ink-3)" }}>→</span>
        <input type="datetime-local" className="input" style={{ width: 178, marginBottom: 0 }} value={to} min={from} onChange={(e) => setTo(e.target.value)} title="To" />
        <button className="btn btn-sec" onClick={() => go("/templates")}><Icon d={IC.tmpl} s={15} />Templates</button>
        <button className="btn btn-primary" onClick={() => go("/inbox")}><Icon d={IC.inbox} s={15} />Open inbox</button>
      </PageHead>

      <div className="kpis k4">
        <div className="kpi"><div className="kl">Conversations</div><div className="kv">{dash(kpis.conversations)}</div><div className="ks">last {spanLabel}</div></div>
        <div className="kpi"><div className="kl">Response rate</div><div className="kv">{kpis.response === null ? "—" : `${kpis.response}%`}</div><div className="ks">last {spanLabel}</div></div>
        <div className="kpi"><div className="kl">Active campaigns</div><div className="kv">{dash(kpis.campaigns)}</div><div className="ks">live now</div></div>
        <div className="kpi"><div className="kl">New leads</div><div className="kv">{dash(kpis.leads)}</div><div className="ks">last {spanLabel}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div className="card-t">Recent conversations</div>
            <a className="card-link" href="/inbox" onClick={(e) => { e.preventDefault(); go("/inbox"); }}>Go to inbox</a>
          </div>
          <div className="convlist-mini">
            {(recent || []).map((c, i) => (
              <div className="cm-row" key={c.name + i} onClick={() => go("/inbox")}>
                <Avatar name={c.name} size={36} />
                <div className="cm-main">
                  <div className="cm-top"><span className="cm-name">{c.name}</span><TagDot tag={c.tag} /></div>
                  <div className="cm-msg">{c.msg}</div>
                </div>
                <div className="cm-side"><span className="cm-time">{c.time}</span>{c.unread > 0 && <span className="unread">{c.unread}</span>}</div>
              </div>
            ))}
            {recent === null && <div className="empty sm">Loading…</div>}
            {recent !== null && recent.length === 0 && <div className="empty sm">No conversations yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-t">Template performance</div>
            <a className="card-link" href="/insights" onClick={(e) => { e.preventDefault(); go("/insights"); }}>View all</a>
          </div>
          <div className="perf">
            {(perf || []).map((t) => (
              <div className="perf-row" key={t.name}>
                <div className="perf-name mono">{t.name}</div>
                <div className="perf-stat">{t.sent} sent</div>
                <div className="perf-stat strong">{t.replyRate}% reply</div>
              </div>
            ))}
            {perf === null && <div className="empty sm">Loading…</div>}
            {perf !== null && perf.length === 0 && <div className="empty sm">No template sends yet.</div>}
          </div>
        </div>
      </div>
    </div></div>
  );
}
