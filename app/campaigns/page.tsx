"use client";
import { useEffect, useState } from "react";
import { RATES } from "@/lib/rates";

type Tpl = { sid: string; name: string; status: string; body: string | null; variables: Record<string, string> };

const BATCH = 25;

export default function Campaigns() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tplSid, setTplSid] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [sendAt, setSendAt] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; sent: number; skipped: number; failed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => {
      const approved = (d.templates || []).filter((t: any) => t.status === "approved");
      setTpls(approved);
    });
  }, []);

  const tpl = tpls.find((t) => t.sid === tplSid);
  const tplVars = tpl ? Object.keys(tpl.variables || {}) : [];

  // Parse phone numbers from pasted text or CSV (first phone-like token per line)
  const numbers = Array.from(
    new Set(
      raw.split(/[\n,;]+/).map((s) => {
        const m = s.match(/\+?\d[\d\s-]{7,}\d/);
        return m ? m[0].replace(/[^0-9+]/g, "") : "";
      }).filter(Boolean)
    )
  );

  const estUsd = numbers.length * RATES.twilioPerMessage;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setRaw((prev) => (prev ? prev + "\n" : "") + String(reader.result || ""));
    reader.readAsText(f);
  }

  async function run() {
    setErr(null);
    setDoneMsg(null);
    if (!tplSid) return setErr("Pick an approved template.");
    if (numbers.length === 0) return setErr("Add at least one recipient.");

    let iso: string | undefined;
    if (schedule) {
      if (!sendAt) return setErr("Pick a schedule time.");
      const t = new Date(sendAt).getTime();
      const mins = (t - Date.now()) / 60000;
      if (mins < 15 || mins > 7 * 24 * 60) return setErr("Schedule must be 15 minutes to 7 days from now.");
      iso = new Date(sendAt).toISOString();
    }

    const label = renderLabel(tpl, vars);
    const verb = schedule ? `schedule for ${new Date(sendAt).toLocaleString()}` : "send now";
    if (!confirm(`This will ${verb} to ${numbers.length} recipient(s) using "${tpl?.name}". Blacklisted contacts are skipped. Continue?`)) return;

    setRunning(true);
    const recipients = numbers.map((p) => ({ phone: p, vars: Object.keys(vars).length ? vars : undefined }));
    let done = 0, sent = 0, skipped = 0, failed = 0;
    setProgress({ done: 0, total: recipients.length, sent: 0, skipped: 0, failed: 0 });
    try {
      for (let i = 0; i < recipients.length; i += BATCH) {
        const batch = recipients.slice(i, i + BATCH);
        const res = await fetch("/api/campaign/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: batch, contentSid: tplSid, label, sendAt: iso }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Batch failed");
        for (const r of d.results) {
          done++;
          if (r.status === "skipped_blacklist") skipped++;
          else if (r.status === "failed" || r.status === "invalid") failed++;
          else sent++;
        }
        setProgress({ done, total: recipients.length, sent, skipped, failed });
      }
      setDoneMsg(`${schedule ? "Scheduled" : "Sent"} ${sent} · skipped ${skipped} (blacklisted) · failed ${failed}.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px" }}>
      <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: "0 0 6px" }}>Campaigns</h1>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        Send an approved template to many contacts at once. Blacklisted contacts are skipped automatically.
      </p>

      <Section title="1 · Template">
        <select value={tplSid} onChange={(e) => { setTplSid(e.target.value); setVars({}); }} style={input}>
          <option value="">Select an approved template…</option>
          {tpls.map((t) => <option key={t.sid} value={t.sid}>{t.name}</option>)}
        </select>
        {tpl?.body && <div style={{ marginTop: 10, padding: 12, background: "#F7F5F0", borderRadius: 8, fontSize: 14, whiteSpace: "pre-wrap" }}>{renderLabel(tpl, vars)}</div>}
        {tplVars.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{`{{${k}}}`}</span>
            <input value={vars[k] || ""} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} placeholder="value used for all recipients" style={{ ...input, marginBottom: 0 }} />
          </div>
        ))}
      </Section>

      <Section title="2 · Recipients">
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Paste numbers, one per line (e.g. +9715XXXXXXXX)" style={{ ...input, resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
          <label style={{ fontSize: 13, color: "#6B6862", cursor: "pointer" }}>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ fontSize: 13 }} />
          </label>
          <span style={{ fontSize: 13, color: numbers.length ? "#137333" : "#9a958c", fontWeight: 600 }}>{numbers.length} valid recipient{numbers.length === 1 ? "" : "s"}</span>
        </div>
      </Section>

      <Section title="3 · Schedule (optional)">
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} /> Schedule for later (15 min – 7 days)
        </label>
        {schedule && <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} style={{ ...input, marginTop: 8, maxWidth: 280 }} />}
      </Section>

      <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: "#6B6862" }}>Recipients</span><b>{numbers.length}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 6 }}>
          <span style={{ color: "#6B6862" }}>Est. cost floor (Twilio fee)</span><b>${estUsd.toFixed(2)}</b>
        </div>
        <div style={{ fontSize: 11, color: "#9a958c", marginTop: 6 }}>Plus Meta marketing rate per message (country-specific). Outside the 24h window, template sending is required — which this uses.</div>
      </div>

      {err && <div style={errBox}>{err}</div>}
      {doneMsg && <div style={{ background: "#e7f4ea", color: "#137333", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 }}>{doneMsg}</div>}

      {progress && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ height: 8, background: "#E4E1DB", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(progress.done / progress.total) * 100}%`, background: "#137333" }} />
          </div>
          <div style={{ fontSize: 12, color: "#6B6862", marginTop: 6 }}>
            {progress.done}/{progress.total} processed · {progress.sent} {schedule ? "scheduled" : "sent"} · {progress.skipped} skipped · {progress.failed} failed
          </div>
        </div>
      )}

      <button onClick={run} disabled={running} style={{ ...btn, background: "#137333", opacity: running ? 0.6 : 1 }}>
        {running ? "Working…" : schedule ? "Schedule campaign" : "Send campaign"}
      </button>

      <div style={{ marginTop: 22, fontSize: 12, color: "#9a958c" }}>
        Pulling segments from the ERE CRM database is coming next — share that database’s URL + key to enable it.
      </div>
    </div>
  );
}

function renderLabel(tpl: Tpl | undefined, vars: Record<string, string>) {
  let s = tpl?.body || (tpl ? `[${tpl.name}]` : "");
  for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v || `{{${k}}}`);
  return s;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, letterSpacing: 0.3 }}>{title}</div>
      {children}
    </div>
  );
}

const btn: React.CSSProperties = { padding: "12px 22px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, letterSpacing: 1, textTransform: "uppercase" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const errBox: React.CSSProperties = { background: "#fdecea", color: "#b00020", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 };
