"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, IC, Avatar, PageHead } from "@/lib/ui";
import { supabaseBrowser } from "@/lib/supabase";

type Recent = { name: string; msg: string; time: string; unread: number; tag: string };
type Perf = { name: string; sent: number; replyRate: number };
type Kpis = { conversations: number | null; response: number | null; campaigns: number | null; leads: number | null };
const dash = (n: number | null) => (n === null ? "—" : n);

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

  // Hydrate KPIs and the recent list from the live backend.
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const weekAgoISO = new Date(Date.now() - 7 * 86400000).toISOString();
      const [insR, convR, campR, repliedR, hotR] = await Promise.allSettled([
        fetch("/api/insights?days=1").then((r) => r.json()),
        sb.from("conversations").select("*").order("last_at", { ascending: false }).limit(50),
        sb.from("campaigns").select("id,status").in("status", ["sending", "scheduled"]),
        // New leads = people who actually replied (inbound) in the last 7 days...
        sb.from("messages").select("conversation").eq("direction", "in").gte("created_at", weekAgoISO),
        // ...and are tagged Hot/Warm. The intersection = "replied positively this week".
        sb.from("conversations").select("id,lead_status").in("lead_status", ["hot", "warm"]),
      ]);

      const next = { ...kpis };
      let convs: any[] = [];
      if (convR.status === "fulfilled" && (convR.value as any).data?.length) {
        convs = (convR.value as any).data;
        next.conversations = convs.length;
      }
      // New leads this week: Hot/Warm contacts who actually replied (inbound) in the
      // last 7 days. A tag alone isn't enough — they must have written back. Always
      // assign (even 0) so a stale seed value can't linger.
      if (repliedR.status === "fulfilled" && hotR.status === "fulfilled") {
        const repliedIds = new Set(((repliedR.value as any).data || []).map((m: any) => m.conversation));
        next.leads = ((hotR.value as any).data || []).filter((c: any) => repliedIds.has(c.id)).length;
      }
      if (insR.status === "fulfilled" && insR.value?.totals) {
        const t = insR.value.totals;
        if (typeof t.readRate === "number" && t.outbound) next.response = t.readRate;
        if (typeof t.outbound === "number" && t.outbound + t.inbound > 0) next.conversations = t.outbound + t.inbound;
      }
      if (campR.status === "fulfilled" && (campR.value as any).data) next.campaigns = (campR.value as any).data.length;
      setKpis(next);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Overview" sub="Your WhatsApp channel at a glance.">
        <button className="btn btn-sec" onClick={() => go("/templates")}><Icon d={IC.tmpl} s={15} />Templates</button>
        <button className="btn btn-primary" onClick={() => go("/inbox")}><Icon d={IC.inbox} s={15} />Open inbox</button>
      </PageHead>

      <div className="kpis k4">
        <div className="kpi"><div className="kl">Conversations today</div><div className="kv">{dash(kpis.conversations)}</div></div>
        <div className="kpi"><div className="kl">Response rate</div><div className="kv">{kpis.response === null ? "—" : `${kpis.response}%`}</div></div>
        <div className="kpi"><div className="kl">Active campaigns</div><div className="kv">{dash(kpis.campaigns)}</div></div>
        <div className="kpi"><div className="kl">New leads this week</div><div className="kv">{dash(kpis.leads)}</div></div>
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
