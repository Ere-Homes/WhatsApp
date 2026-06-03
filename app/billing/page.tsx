"use client";
import { useEffect, useState } from "react";
import { RATES, RATE_ROWS } from "@/lib/rates";

type Data = {
  balance: { balance: string; currency: string } | null;
  range: { days: number; since: string };
  spend: {
    total: number; currency: string; messages: number; pricedMessages: number;
    avgPerMessage: number; outbound: number; inbound: number; capped: boolean;
  };
  byDay: { day: string; spend: number }[];
};

export default function Billing() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load(d: number) {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/billing?days=${d}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setData(j);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(days); }, [days]);

  const s = data?.spend;
  const cur = s?.currency || data?.balance?.currency || "USD";
  const maxDay = Math.max(0.0001, ...(data?.byDay || []).map((d) => d.spend));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Billing</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{ ...tab, ...(days === d ? tabActive : {}) }}>{d}d</button>
          ))}
        </div>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={{ color: "#6B6862" }}>Loading…</div>}

      {data && !loading && (
        <>
          {/* Balance highlight */}
          <div style={{ background: "#141414", color: "#fff", borderRadius: 14, padding: 24, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#cfccc6" }}>Twilio balance remaining</div>
              <div style={{ fontSize: 38, fontFamily: "Georgia, serif", marginTop: 6 }}>
                {data.balance ? `${data.balance.currency} ${parseFloat(data.balance.balance).toFixed(2)}` : "—"}
              </div>
            </div>
            <a href="https://console.twilio.com/us1/billing/manage-billing/billing-overview" target="_blank" rel="noreferrer"
               style={{ color: "#141414", background: "#fff", padding: "10px 18px", borderRadius: 8, textDecoration: "none", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" }}>
              Top up ↗
            </a>
          </div>

          {/* Spend scorecards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 22 }}>
            <Card label={`Spend · last ${data.range.days}d`} value={`${cur} ${s!.total.toFixed(4)}`} />
            <Card label="Outbound spend" value={`${cur} ${s!.outbound.toFixed(4)}`} />
            <Card label="Avg / message" value={`${cur} ${s!.avgPerMessage.toFixed(4)}`} sub={`${s!.pricedMessages} priced`} />
            <Card label="Messages" value={s!.messages} sub={`${s!.pricedMessages} with a price`} />
          </div>

          {s!.capped && (
            <div style={{ fontSize: 12, color: "#9a6700", marginBottom: 12 }}>
              ⚠ Spend capped to recent pages — narrow the range for an exact total.
            </div>
          )}

          {/* Spend by day */}
          <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Spend by day (since {data.range.since})</div>
            {data.byDay.length === 0 && <div style={{ color: "#6B6862" }}>No priced messages in range.</div>}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150 }}>
              {data.byDay.map((d) => (
                <div key={d.day} style={{ flex: 1, textAlign: "center" }} title={`${cur} ${d.spend.toFixed(4)}`}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: 120 }}>
                    <div style={{ height: `${(d.spend / maxDay) * 100}%`, background: "#137333", minHeight: d.spend > 0 ? 2 : 0 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "#9a958c", marginTop: 4 }}>{d.day.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rate reference */}
          <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>WhatsApp rate reference (USD)</span>
              <a href={RATES.source} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#6B6862" }}>Twilio pricing ↗</a>
            </div>
            {RATE_ROWS.map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F0EEE9", fontSize: 14 }}>
                <span>{r.label}{r.note && <span style={{ color: "#9a958c", fontSize: 12 }}> · {r.note}</span>}</span>
                <b>{r.value === null ? "set rate" : `$${r.value.toFixed(4)}`}</b>
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#9a958c", marginTop: 10 }}>
              Reference only. Marketing is country-specific (UAE not published) — set it in <code>lib/rates.ts</code>.
              Estimated floor for this window: <b>{cur} {(s!.messages * RATES.twilioPerMessage).toFixed(2)}</b> ({s!.messages} msgs × ${RATES.twilioPerMessage}).
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#9a958c", marginTop: 14 }}>
            Spend is computed from Twilio message prices for the selected window. Balance is your live Twilio prepaid balance.
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: "#6B6862", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9a958c", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const tab: React.CSSProperties = { padding: "8px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const tabActive: React.CSSProperties = { background: "#141414", color: "#fff", borderColor: "#141414" };
const errBox: React.CSSProperties = { background: "#fdecea", color: "#b00020", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 };
