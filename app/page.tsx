"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, IC, Avatar, PageHead } from "@/lib/ui";
import { RECENT, TPL_PERF } from "@/lib/fixtures";
import { supabaseBrowser } from "@/lib/supabase";

type Recent = { name: string; msg: string; time: string; unread: number; tag: string };

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
  const [kpis, setKpis] = useState({ conversations: 128, response: 94, campaigns: 3, leads: 17 });
  const [recent, setRecent] = useState<Recent[]>(RECENT as Recent[]);

  // Best-effort: hydrate KPIs and the recent list from the live backend; the
  // fixtures above stand in when Supabase/Twilio aren't configured.
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const [insR, convR, campR] = await Promise.allSettled([
        fetch("/api/insights?days=1").then((r) => r.json()),
        sb.from("conversations").select("*").order("last_at", { ascending: false }).limit(50),
        sb.from("campaigns").select("id,status").in("status", ["sending", "scheduled"]),
      ]);

      const next = { ...kpis };
      let convs: any[] = [];
      if (convR.status === "fulfilled" && (convR.value as any).data?.length) {
        convs = (convR.value as any).data;
        next.conversations = convs.length;
        const weekAgo = Date.now() - 7 * 86400000;
        const leads = convs.filter((c) => ["hot", "warm"].includes((c.lead_status || "").toLowerCase()) && (!c.created_at || new Date(c.created_at).getTime() > weekAgo));
        if (leads.length) next.leads = leads.length;
      }
      if (insR.status === "fulfilled" && insR.value?.totals) {
        const t = insR.value.totals;
        if (typeof t.readRate === "number" && t.outbound) next.response = t.readRate;
        if (typeof t.outbound === "number" && t.outbound + t.inbound > 0) next.conversations = t.outbound + t.inbound;
      }
      if (campR.status === "fulfilled" && (campR.value as any).data) next.campaigns = (campR.value as any).data.length;
      setKpis(next);

      if (convs.length) {
        const tagOf = (s?: string) => (s || "").toLowerCase() === "hot" ? "Hot" : (s || "").toLowerCase() === "warm" ? "Warm" : "";
        setRecent(convs.slice(0, 5).map((c) => ({
          name: c.name || "+" + c.wa_phone,
          msg: c.last_body || "",
          time: relTime(c.last_at),
          unread: c.unread ? 1 : 0,
          tag: tagOf(c.lead_status),
        })));
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Overview" sub="Your WhatsApp channel at a glance.">
        <button className="btn btn-sec" onClick={() => go("/templates")}><Icon d={IC.tmpl} s={15} />Templates</button>
        <button className="btn btn-primary" onClick={() => go("/inbox")}><Icon d={IC.inbox} s={15} />Open inbox</button>
      </PageHead>

      <div className="kpis k4">
        <div className="kpi"><div className="kl">Conversations today</div><div className="kv">{kpis.conversations}</div></div>
        <div className="kpi"><div className="kl">Response rate</div><div className="kv">{kpis.response}%</div></div>
        <div className="kpi"><div className="kl">Active campaigns</div><div className="kv">{kpis.campaigns}</div></div>
        <div className="kpi"><div className="kl">New leads this week</div><div className="kv">{kpis.leads}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div className="card-t">Recent conversations</div>
            <a className="card-link" href="/inbox" onClick={(e) => { e.preventDefault(); go("/inbox"); }}>Go to inbox</a>
          </div>
          <div className="convlist-mini">
            {recent.map((c, i) => (
              <div className="cm-row" key={c.name + i} onClick={() => go("/inbox")}>
                <Avatar name={c.name} size={36} />
                <div className="cm-main">
                  <div className="cm-top"><span className="cm-name">{c.name}</span><TagDot tag={c.tag} /></div>
                  <div className="cm-msg">{c.msg}</div>
                </div>
                <div className="cm-side"><span className="cm-time">{c.time}</span>{c.unread > 0 && <span className="unread">{c.unread}</span>}</div>
              </div>
            ))}
            {recent.length === 0 && <div className="empty sm">No conversations yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-t">Template performance</div>
            <a className="card-link" href="/insights" onClick={(e) => { e.preventDefault(); go("/insights"); }}>View all</a>
          </div>
          <div className="perf">
            {TPL_PERF.map((t) => (
              <div className="perf-row" key={t.name}>
                <div className="perf-name mono">{t.name}</div>
                <div className="perf-stat">{t.sent} sent</div>
                <div className="perf-stat strong">{Math.round((t.reply / t.sent) * 100)}% reply</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}
