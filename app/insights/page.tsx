"use client";
import { useEffect, useState } from "react";
import { Icon, IC, PageHead, downloadCSV } from "@/lib/ui";
import { supabaseBrowser } from "@/lib/supabase";

const RANGES: [string, string, number][] = [["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90]];

type Totals = { outbound: number; deliveryRate: number; readRate: number; inbound: number };
type TplRow = { name: string; sent: number; replyRate: number };
const LEAD_ORDER = ["hot", "warm", "new", "cold", "won", "lost"] as const;
const LEAD_LABEL: Record<string, string> = { new: "New", hot: "Hot", warm: "Warm", cold: "Cold", won: "Won", lost: "Lost" };
const LEAD_COLOR: Record<string, string> = { hot: "var(--red)", warm: "var(--amber-dot)", new: "var(--ink-3)", cold: "var(--blue)", won: "var(--green-dot)", lost: "var(--ink-3)" };

const dash = "—";

export default function Insights() {
  const sb = supabaseBrowser();
  const [range, setRange] = useState("30d");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [tpls, setTpls] = useState<TplRow[] | null>(null);
  const [replyRate, setReplyRate] = useState<number | null>(null);
  const [leads, setLeads] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Real Twilio messaging totals for the selected window.
  useEffect(() => {
    const days = RANGES.find((r) => r[0] === range)?.[2] ?? 30;
    setTotals(null);
    fetch(`/api/insights?days=${days}`)
      .then((r) => r.json())
      .then((d) => { if (d?.totals) setTotals(d.totals); else if (d?.error) setErr(d.error); })
      .catch(() => setErr("Could not load Twilio insights."));
  }, [range]);

  // Real per-template performance (last 90 days) → top templates + overall reply rate.
  useEffect(() => {
    Promise.all([
      fetch("/api/templates/performance").then((r) => r.json()),
      fetch("/api/templates").then((r) => r.json()),
    ])
      .then(([perf, list]) => {
        const stats: Record<string, any> = perf?.stats || {};
        const names: Record<string, string> = {};
        for (const t of list?.templates || []) names[t.sid] = t.name;
        const rows: TplRow[] = Object.entries(stats)
          .map(([sid, s]: any) => ({ name: names[sid] || sid, sent: s.sent, replyRate: s.replyRate }))
          .filter((r) => r.sent > 0)
          .sort((a, b) => b.replyRate - a.replyRate)
          .slice(0, 6);
        setTpls(rows);
        let replied = 0, seen = 0;
        for (const s of Object.values(stats) as any[]) { replied += s.replied || 0; seen += s.conversations || 0; }
        setReplyRate(seen ? Math.round((replied / seen) * 100) : 0);
      })
      .catch(() => { setTpls([]); setReplyRate(0); });
  }, []);

  // Real lead pipeline from our own conversations (leads = pushed to Pipedrive).
  useEffect(() => {
    const days = RANGES.find((r) => r[0] === range)?.[2] ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    setPipeline(null);
    sb.from("conversations").select("lead_status, pipedrive_lead_id, created_at").gte("created_at", since)
      .then(({ data }) => {
        const rows = data || [];
        const pl: Record<string, number> = {};
        let l = 0;
        for (const c of rows as any[]) {
          pl[c.lead_status || "new"] = (pl[c.lead_status || "new"] || 0) + 1;
          if (c.pipedrive_lead_id) l++;
        }
        setPipeline(pl);
        setLeads(l);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const exportCSV = () => {
    const rows: (string | number)[][] = [["Section", "Name", "Sent", "Reply rate %"]];
    (tpls || []).forEach((t) => rows.push(["Template", t.name, t.sent, t.replyRate]));
    Object.entries(pipeline || {}).forEach(([k, v]) => rows.push(["Lead status", LEAD_LABEL[k] || k, v, ""]));
    downloadCSV(`ere-insights-${range}.csv`, rows);
  };

  const kv = (v: string | number | null, suffix = "") => (v === null ? dash : `${v}${suffix}`);
  const pipeRows = LEAD_ORDER.filter((k) => (pipeline?.[k] ?? 0) > 0);
  const pipeMax = Math.max(1, ...Object.values(pipeline || {}));

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Insights" sub="Real WhatsApp messaging performance from Twilio and your inbox — no estimates.">
        <div className="seg">
          {RANGES.map(([id, l]) => (
            <button key={id} className={range === id ? "on" : ""} onClick={() => setRange(id)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-sec" onClick={exportCSV}><Icon d={IC.dl} s={15} />Export</button>
      </PageHead>

      {err && <div className="err-box" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="kpis k5">
        <div className="kpi"><div className="kl">Messages sent</div><div className="kv">{kv(totals ? totals.outbound.toLocaleString() : null)}</div><div className="ks">last {range.replace("d", " days")}</div></div>
        <div className="kpi"><div className="kl">Delivery rate</div><div className="kv">{kv(totals ? totals.deliveryRate : null, "%")}</div></div>
        <div className="kpi"><div className="kl">Read rate</div><div className="kv">{kv(totals ? totals.readRate : null, "%")}</div></div>
        <div className="kpi"><div className="kl">Reply rate</div><div className="kv">{kv(replyRate, "%")}</div><div className="ks">marketing · 90d</div></div>
        <div className="kpi"><div className="kl">Leads to Pipedrive</div><div className="kv">{leads === null ? dash : leads.toLocaleString()}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div className="card-t">Top templates</div><div className="card-meta">by reply rate · 90d</div></div>
          <div className="perf">
            {tpls === null && <div className="perf-row"><div className="perf-name" style={{ color: "var(--ink-3)" }}>Loading…</div></div>}
            {tpls && tpls.length === 0 && <div className="perf-row"><div className="perf-name" style={{ color: "var(--ink-3)" }}>No template sends yet.</div></div>}
            {(tpls || []).map((t) => (
              <div className="perf-row" key={t.name}>
                <div className="perf-name mono">{t.name}</div>
                <div className="perf-stat">{t.sent.toLocaleString()} sent</div>
                <div className="perf-stat strong">{t.replyRate}% reply</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div className="card-t">Lead pipeline</div><div className="card-meta">conversations · {range.replace("d", " days")}</div></div>
          <div className="perf">
            {pipeline === null && <div className="perf-row"><div className="perf-name" style={{ color: "var(--ink-3)" }}>Loading…</div></div>}
            {pipeline && pipeRows.length === 0 && <div className="perf-row"><div className="perf-name" style={{ color: "var(--ink-3)" }}>No conversations in range.</div></div>}
            {pipeRows.map((k) => (
              <div className="perf-row" key={k}>
                <div className="perf-name" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 70 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: LEAD_COLOR[k], display: "inline-block" }} />{LEAD_LABEL[k]}
                </div>
                <div style={{ flex: 1, height: 6, background: "var(--chip)", borderRadius: 6, margin: "0 12px", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(((pipeline?.[k] ?? 0) / pipeMax) * 100)}%`, height: "100%", background: LEAD_COLOR[k] }} />
                </div>
                <div className="perf-stat strong">{(pipeline?.[k] ?? 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}
