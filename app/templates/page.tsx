"use client";
import { useEffect, useState } from "react";

type Tpl = {
  sid: string;
  name: string;
  language: string;
  type: string | null;
  category: string | null;
  status: string;
  rejection_reason: string | null;
  variables: Record<string, string>;
  body: string | null;
  updated: string;
};

const STATUS_COLOR: Record<string, string> = {
  approved: "#137333",
  pending: "#9a6700",
  received: "#9a6700",
  rejected: "#b00020",
  unsubmitted: "#6B6862",
};

export default function Templates() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setTpls(data.templates || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>
          WhatsApp Templates
        </h1>
        <button onClick={load} style={btn}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {!err && !loading && tpls.length === 0 && (
        <div style={{ color: "#6B6862" }}>No content templates found on this Twilio account.</div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {tpls.map((t) => (
          <div key={t.sid} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#9a958c", marginTop: 2 }}>
                  {t.sid} · {t.type || "—"} · {t.language || "—"}
                </div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "#fff",
                  background: STATUS_COLOR[t.status] || "#6B6862",
                  padding: "4px 10px",
                  borderRadius: 20,
                  whiteSpace: "nowrap",
                }}
              >
                {t.status}
              </span>
            </div>

            {t.category && (
              <div style={{ fontSize: 12, color: "#6B6862", marginTop: 8 }}>Category: {t.category}</div>
            )}
            {t.body && (
              <div style={{ marginTop: 10, padding: 12, background: "#F7F5F0", borderRadius: 8, fontSize: 14, whiteSpace: "pre-wrap" }}>
                {t.body}
              </div>
            )}
            {Object.keys(t.variables || {}).length > 0 && (
              <div style={{ fontSize: 12, color: "#6B6862", marginTop: 8 }}>
                Variables: {Object.entries(t.variables).map(([k, v]) => `{{${k}}}=${v}`).join(", ")}
              </div>
            )}
            {t.rejection_reason && (
              <div style={{ fontSize: 12, color: "#b00020", marginTop: 8 }}>
                Rejected: {t.rejection_reason}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "9px 18px",
  background: "#141414",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
};
const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E4E1DB",
  borderRadius: 12,
  padding: 18,
};
const errBox: React.CSSProperties = {
  background: "#fdecea",
  color: "#b00020",
  padding: 12,
  borderRadius: 8,
  marginBottom: 14,
  fontSize: 14,
};
