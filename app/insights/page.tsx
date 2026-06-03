"use client";
import { useEffect, useState } from "react";
import { errorCause } from "@/lib/twilioErrors";

type Data = {
  range: { days: number; since: string };
  totals: {
    total: number; outbound: number; inbound: number; delivered: number; read: number;
    failed: number; undelivered: number; deliveryRate: number; readRate: number; failRate: number;
    priceTotal: number; currency: string; capped: boolean;
  };
  byStatus: Record<string, number>;
  byErr: Record<string, number>;
  byDay: { day: string; out: number; in: number }[];
  logs: { sid: string; date: string; direction: string; from: string; to: string; status: string; error_code: string | null; body: string; price: string | null }[];
};

const STATUS_COLOR: Record<string, string> = {
  delivered: "#137333", read: "#1a73e8", sent: "#9a6700", queued: "#9a6700",
  failed: "#b00020", undelivered: "#b00020", received: "#6B6862",
};


export default function Insights() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(d: number) {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/insights?days=${d}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setData(j);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(days); }, [days]);

  const t = data?.totals;
  const maxDay = Math.max(1, ...(data?.byDay || []).map((d) => d.out + d.in));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>
          Messaging Insights
        </h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ ...tab, ...(days === d ? tabActive : {}) }}>
              {d === 1 ? "24h" : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={{ color: "#6B6862" }}>Loading…</div>}

      {t && !loading && (
        <>
          {t.capped && (
            <div style={{ fontSize: 12, color: "#9a6700", marginBottom: 12 }}>
              ⚠ Result capped — showing the most recent pages only. Narrow the range for full coverage.
            </div>
          )}

          {/* Scorecards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 22 }}>
            <Card label="Total messages" value={t.total} />
            <Card label="Outbound" value={t.outbound} />
            <Card label="Inbound" value={t.inbound} />
            <Card label="Delivery rate" value={`${t.deliveryRate}%`} sub={`${t.delivered + t.read} reached`} />
            <Card label="Read rate" value={`${t.readRate}%`} sub={`${t.read} read`} />
            <Card label="Failed / undeliv." value={t.failed + t.undelivered} sub={`${t.failRate}% of outbound`} color={t.failed + t.undelivered ? "#b00020" : undefined} />
          </div>

          {/* By-day trend */}
          <Section title={`Volume by day (since ${data!.range.since})`}>
            {data!.byDay.length === 0 && <div style={{ color: "#6B6862" }}>No messages in range.</div>}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, paddingTop: 10 }}>
              {data!.byDay.map((d) => (
                <div key={d.day} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 110 }}>
                    <div title={`in ${d.in}`} style={{ height: `${(d.in / maxDay) * 100}%`, background: "#cfccc6" }} />
                    <div title={`out ${d.out}`} style={{ height: `${(d.out / maxDay) * 100}%`, background: "#141414" }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#9a958c", marginTop: 4 }}>{d.day.slice(5)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#6B6862", marginTop: 8 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, background: "#141414", marginRight: 4 }} />outbound
              <span style={{ display: "inline-block", width: 10, height: 10, background: "#cfccc6", margin: "0 4px 0 14px" }} />inbound
            </div>
          </Section>

          {/* Status + error breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Section title="By status">
              {Object.entries(data!.byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                <Row key={s} left={<span><Dot c={STATUS_COLOR[s] || "#6B6862"} />{s}</span>} right={n} />
              ))}
            </Section>
            <Section title="Errors (code · cause)">
              {Object.keys(data!.byErr).length === 0 && <div style={{ color: "#137333" }}>No errors 🎉</div>}
              {Object.entries(data!.byErr).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                <Row
                  key={code}
                  left={
                    <span>
                      <a href={`https://www.twilio.com/docs/api/errors/${code}`} target="_blank" rel="noreferrer" style={{ color: "#b00020", fontWeight: 700, textDecoration: "none" }}>{code}</a>
                      <span style={{ color: "#6B6862" }}> · {errorCause(code)}</span>
                    </span>
                  }
                  right={n}
                />
              ))}
            </Section>
          </div>

          {/* Logs */}
          <Section title={`Message log (${data!.logs.length})`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6B6862", borderBottom: "1px solid #E4E1DB" }}>
                    <th style={th}>Time</th><th style={th}>Dir</th><th style={th}>To / From</th>
                    <th style={th}>Status</th><th style={th}>Err</th><th style={th}>Body</th><th style={th}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.logs.map((m) => (
                    <tr key={m.sid} style={{ borderBottom: "1px solid #F0EEE9" }}>
                      <td style={td}>{m.date ? new Date(m.date).toLocaleString() : "—"}</td>
                      <td style={td}>{m.direction?.startsWith("outbound") ? "→" : "←"}</td>
                      <td style={td}>{m.direction?.startsWith("outbound") ? m.to : m.from}</td>
                      <td style={{ ...td, color: STATUS_COLOR[m.status] || "#1F1C17" }}>{m.status}</td>
                      <td style={{ ...td, color: m.error_code ? "#b00020" : "#cfccc6" }} title={m.error_code ? errorCause(m.error_code) : ""}>{m.error_code || "—"}</td>
                      <td style={{ ...td, maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.body}</td>
                      <td style={td}>{m.price || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub, color }: { label: string; value: any; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#6B6862", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || "#141414" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9a958c", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #F0EEE9", fontSize: 14 }}>
      <span>{left}</span><b>{right}</b>
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: c, marginRight: 7 }} />;
}

const tab: React.CSSProperties = { padding: "8px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const tabActive: React.CSSProperties = { background: "#141414", color: "#fff", borderColor: "#141414" };
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 10px" };
const errBox: React.CSSProperties = { background: "#fdecea", color: "#b00020", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 };
