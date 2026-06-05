"use client";
import { useEffect, useState } from "react";
import { Icon, IC, PageHead, downloadCSV } from "@/lib/ui";
import { TPL_PERF, COMMUNITIES } from "@/lib/fixtures";

const RANGES: [string, string, number][] = [["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90]];

export default function Insights() {
  const [range, setRange] = useState("30d");
  const [kpi, setKpi] = useState({ sent: "8,420", delivery: "97.4%", read: "68%", reply: "9.1%", leads: "214" });

  // Pull live totals for the KPIs that the messaging API can answer; the two
  // tables and the reply/leads figures use the seeded reference data.
  useEffect(() => {
    const days = RANGES.find((r) => r[0] === range)?.[2] ?? 30;
    fetch(`/api/insights?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        const t = d?.totals;
        if (!t || !t.outbound) return;
        setKpi((k) => ({
          ...k,
          sent: Number(t.outbound).toLocaleString(),
          delivery: `${t.deliveryRate}%`,
          read: `${t.readRate}%`,
        }));
      })
      .catch(() => {});
  }, [range]);

  const exportCSV = () => {
    const rows: (string | number)[][] = [["Section", "Name", "Sent", "Reply rate %"]];
    TPL_PERF.forEach((t) => rows.push(["Template", t.name, t.sent, Math.round((t.reply / t.sent) * 100)]));
    COMMUNITIES.forEach((c) => rows.push(["Community", c.name, c.sent, c.reply]));
    downloadCSV(`ere-insights-${range}.csv`, rows);
  };

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Insights" sub="WhatsApp messaging performance across templates and communities.">
        <div className="seg">
          {RANGES.map(([id, l]) => (
            <button key={id} className={range === id ? "on" : ""} onClick={() => setRange(id)}>{l}</button>
          ))}
        </div>
        <button className="btn btn-sec" onClick={exportCSV}><Icon d={IC.dl} s={15} />Export</button>
      </PageHead>

      <div className="kpis k5">
        <div className="kpi"><div className="kl">Messages sent</div><div className="kv">{kpi.sent}</div></div>
        <div className="kpi"><div className="kl">Delivery rate</div><div className="kv">{kpi.delivery}</div></div>
        <div className="kpi"><div className="kl">Read rate</div><div className="kv">{kpi.read}</div></div>
        <div className="kpi"><div className="kl">Reply rate</div><div className="kv">{kpi.reply}</div></div>
        <div className="kpi"><div className="kl">Leads created</div><div className="kv">{kpi.leads}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div className="card-t">Top templates</div><div className="card-meta">by reply rate</div></div>
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
        <div className="card">
          <div className="card-head"><div className="card-t">By community</div><div className="card-meta">messages sent</div></div>
          <div className="perf">
            {COMMUNITIES.map((c) => (
              <div className="perf-row" key={c.name}>
                <div className="perf-name">{c.name}</div>
                <div className="perf-stat">{c.sent.toLocaleString()} sent</div>
                <div className="perf-stat strong">{c.reply}% reply</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div></div>
  );
}
