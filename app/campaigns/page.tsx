"use client";
import { useEffect, useState } from "react";
import { RATES } from "@/lib/rates";
import { supabaseBrowser } from "@/lib/supabase";

type Tpl = { sid: string; name: string; status: string; body: string | null; variables: Record<string, string> };

const BATCH = 25;
// Warm-up profiles. A brand-new WhatsApp sender shouldn't blast its full tier
// on day one — Meta ramps you (250 -> 1K -> 10K -> 100K) only while quality
// stays high. Each profile sets a safe 24h cap and a recommended drip pace.
const WARMUP = [
  { id: "new", label: "Brand-new", sub: "first few days", cap: 50, batch: 25, interval: 180 },
  { id: "warming", label: "Warming up", sub: "week 1–2", cap: 250, batch: 50, interval: 120 },
  { id: "established", label: "Established", sub: "good quality rating", cap: 1000, batch: 100, interval: 60 },
] as const;

export default function Campaigns() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tplSid, setTplSid] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<"now" | "later" | "drip">("now");
  const [sendAt, setSendAt] = useState(""); // for "later"
  const [perBatch, setPerBatch] = useState(50); // drip: recipients per batch
  const [intervalMin, setIntervalMin] = useState(120); // drip: minutes between batches
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; sent: number; skipped: number; failed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [senders, setSenders] = useState<string[]>([]);
  const [sender, setSender] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [sentToday, setSentToday] = useState<number | null>(null);
  const [warmup, setWarmup] = useState<typeof WARMUP[number]["id"]>("warming");
  const [source, setSource] = useState<"manual" | "crm">("manual");
  const [crmFilters, setCrmFilters] = useState<Record<string, string>>({});
  const [crmLimit, setCrmLimit] = useState(500);
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmMatch, setCrmMatch] = useState<number | null>(null); // live segment size
  const [options, setOptions] = useState<Record<string, any[]>>({});

  const wu = WARMUP.find((w) => w.id === warmup)!;
  const DAILY_CAP = wu.cap;

  // Lazy-load CRM filter dropdowns the first time the segment tab opens
  useEffect(() => {
    if (source !== "crm" || options.community) return;
    ["community", "nationality", "unit_type"].forEach((col) => {
      fetch(`/api/crm/options?col=${col}`).then((r) => r.json()).then((d) => {
        if (d.values) setOptions((prev) => ({ ...prev, [col]: d.values }));
      });
    });
  }, [source]); // eslint-disable-line

  // Live, approximate segment size — so you can sanity-check the audience
  // before loading it. Debounced; recomputes whenever filters change.
  useEffect(() => {
    if (source !== "crm") return;
    setCrmMatch(null);
    const t = setTimeout(() => {
      fetch("/api/crm/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: crmFilters }),
      })
        .then((r) => r.json())
        .then((d) => setCrmMatch(typeof d.count === "number" ? d.count : null))
        .catch(() => setCrmMatch(null));
    }, 400);
    return () => clearTimeout(t);
  }, [source, JSON.stringify(crmFilters)]); // eslint-disable-line

  async function loadSegment() {
    setErr(null);
    setCrmLoading(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: crmFilters, limit: crmLimit }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load segment");
      if (!d.phones?.length) { setErr("No contactable numbers matched that segment."); setRaw(""); }
      else setRaw(d.phones.join("\n"));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCrmLoading(false);
    }
  }

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => {
      setTpls((d.templates || []).filter((t: any) => t.status === "approved"));
    });
    fetch("/api/senders").then((r) => r.json()).then((d) => {
      setSenders(d.senders || []);
      if (d.senders?.length) setSender(d.senders[0]);
    });
    // Outbound messages in the last 24h (for the daily-cap guard)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabaseBrowser()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("direction", "out")
      .gte("created_at", since)
      .then(({ count }) => setSentToday(count ?? 0));
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

  // Drip plan summary (batches every interval; first batch now)
  const dripChunks = Math.ceil(numbers.length / Math.max(perBatch, 1));
  const dripDurationMin = Math.max(0, dripChunks - 1) * intervalMin;
  const drip = numbers.length
    ? { chunks: dripChunks, fits: dripDurationMin <= 7 * 24 * 60, finishLabel: new Date(Date.now() + dripDurationMin * 60000).toLocaleString() }
    : null;

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
    if (!optIn) return setErr("Please confirm these recipients opted in to WhatsApp messages.");
    if (sentToday != null && sentToday + numbers.length > DAILY_CAP) {
      if (!confirm(`Heads up: this would push you to ${sentToday + numbers.length} sends in 24h, over the recommended ${DAILY_CAP} cap for a ramping number. Sending too much too fast can drop your quality rating and pause templates. Continue anyway?`)) return;
    }

    // Validate timing per mode
    if (mode === "later") {
      if (!sendAt) return setErr("Pick a date & time.");
      const mins = (new Date(sendAt).getTime() - Date.now()) / 60000;
      if (mins < 15 || mins > 7 * 24 * 60) return setErr("Pick a time between 15 minutes and 7 days from now.");
    }
    if (mode === "drip" && drip && !drip.fits) {
      return setErr(`At ${perBatch} every ${humanInterval(intervalMin)}, this would take longer than Twilio's 7-day limit. Use a bigger batch, a shorter interval, or fewer recipients.`);
    }

    const recipients = numbers.map((p) => ({ phone: p, vars: Object.keys(vars).length ? vars : undefined }));
    const calls = buildPlan(recipients); // [{ batch, sendAt? }]
    const verb = mode === "now" ? "send now" : mode === "later" ? `schedule for ${new Date(sendAt).toLocaleString()}` : `drip ${perBatch} every ${humanInterval(intervalMin)} (finishes ${drip?.finishLabel})`;
    if (!confirm(`This will ${verb} to ${numbers.length} recipient(s) using "${tpl?.name}". Blacklisted contacts are skipped. Continue?`)) return;

    const label = renderLabel(tpl, vars);
    setRunning(true);
    let done = 0, sent = 0, skipped = 0, failed = 0;
    setProgress({ done: 0, total: recipients.length, sent: 0, skipped: 0, failed: 0 });
    try {
      for (const call of calls) {
        const res = await fetch("/api/campaign/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: call.batch, contentSid: tplSid, label, sendAt: call.sendAt, from: sender || undefined }),
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
      const tail = mode === "drip" ? ` Will keep sending until ${drip?.finishLabel}.` : "";
      setDoneMsg(`${mode === "now" ? "Sent" : "Scheduled"} ${sent} · skipped ${skipped} (blacklisted) · failed ${failed}.${tail}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  }

  // Build the list of API calls (each <=25 recipients) with per-batch send times.
  function buildPlan(recipients: any[]) {
    const calls: { batch: any[]; sendAt?: string }[] = [];
    const push = (arr: any[], sendAt?: string) => { for (let i = 0; i < arr.length; i += BATCH) calls.push({ batch: arr.slice(i, i + BATCH), sendAt }); };
    if (mode === "now") push(recipients);
    else if (mode === "later") push(recipients, new Date(sendAt).toISOString());
    else {
      // drip: chunk of perBatch every intervalMin; first chunk goes now
      for (let c = 0, i = 0; i < recipients.length; c++, i += perBatch) {
        const chunk = recipients.slice(i, i + perBatch);
        const sendAt = c === 0 ? undefined : new Date(Date.now() + c * intervalMin * 60000).toISOString();
        push(chunk, sendAt);
      }
    }
    return calls;
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
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["manual", "crm"] as const).map((m) => (
            <button key={m} onClick={() => setSource(m)} style={{ ...pill, ...(source === m ? pillActive : {}) }}>
              {m === "manual" ? "Paste / CSV" : "From CRM segment"}
            </button>
          ))}
        </div>

        {source === "manual" && (
          <>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={5} placeholder="Paste numbers, one per line (e.g. +9715XXXXXXXX)" style={{ ...input, resize: "vertical" }} />
            <label style={{ fontSize: 13, color: "#6B6862", cursor: "pointer" }}>
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ fontSize: 13 }} />
            </label>
          </>
        )}

        {source === "crm" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8 }}>
              {(["community", "nationality", "unit_type"] as const).map((col) => (
                <select key={col} value={crmFilters[col] || ""} onChange={(e) => setCrmFilters({ ...crmFilters, [col]: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                  <option value="">{col.replace("_", " ")}: any</option>
                  {(options[col] || []).map((o: any) => <option key={o.val} value={o.val}>{o.val} ({o.n})</option>)}
                </select>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#6B6862" }}>Max recipients
                <input type="number" value={crmLimit} min={1} max={5000} onChange={(e) => setCrmLimit(parseInt(e.target.value || "500", 10))} style={{ ...input, width: 90, marginLeft: 6, marginBottom: 0, display: "inline-block" }} />
              </label>
              <button onClick={loadSegment} disabled={crmLoading} style={{ ...pillActive, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer" }}>
                {crmLoading ? "Loading…" : "Load recipients"}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, padding: "8px 12px", background: "#F7F5F0", borderRadius: 8, color: "#3a3a3a" }}>
              {crmMatch == null ? "Counting matching contacts…" : (
                <><b>~{crmMatch.toLocaleString()}</b> contactable contact{crmMatch === 1 ? "" : "s"} match this segment.{crmMatch > crmLimit && <> You’ll load the first <b>{crmLimit.toLocaleString()}</b>.</>}</>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#9a958c", marginTop: 6 }}>Approximate. Excludes do-not-call, uncontactable, and switchboards.</div>
          </div>
        )}

        <div style={{ fontSize: 13, color: numbers.length ? "#137333" : "#9a958c", fontWeight: 600, marginTop: 10 }}>{numbers.length} valid recipient{numbers.length === 1 ? "" : "s"}</div>
      </Section>

      <Section title="3 · Send from">
        <select value={sender} onChange={(e) => setSender(e.target.value)} style={{ ...input, maxWidth: 280 }}>
          {senders.length === 0 && <option value="">(no sender configured)</option>}
          {senders.map((s) => <option key={s} value={s}>+{s}</option>)}
        </select>

        <div style={{ fontSize: 13, color: "#6B6862", margin: "14px 0 8px" }}>How established is this number? Sets a safe daily cap so a young number doesn’t get flagged.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WARMUP.map((w) => (
            <button
              key={w.id}
              onClick={() => { setWarmup(w.id); if (mode === "drip") { setPerBatch(w.batch); setIntervalMin(w.interval); } }}
              style={{ ...pill, textAlign: "left", lineHeight: 1.3, ...(warmup === w.id ? pillActive : {}) }}
            >
              <div style={{ fontWeight: 600 }}>{w.label}</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>{w.sub} · cap {w.cap}/day</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="4 · When to send">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["now", "Send now"], ["later", "Send later"], ["drip", "Spread it out"]] as const).map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} style={{ ...pill, ...(mode === m ? pillActive : {}) }}>{lbl}</button>
          ))}
        </div>

        {mode === "later" && (
          <div style={{ marginTop: 12 }}>
            <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} style={{ ...input, maxWidth: 280 }} />
            <div style={{ fontSize: 12, color: "#9a958c", marginTop: 6 }}>Anytime from 15 minutes to 7 days from now.</div>
          </div>
        )}

        {mode === "drip" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: "#6B6862", marginBottom: 8 }}>Send a small batch, wait, repeat — the gentle way to protect your number. Pick a pace:</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {[{ p: 50, m: 120, l: "50 every 2 hours" }, { p: 100, m: 60, l: "100 every hour" }, { p: 25, m: 30, l: "25 every 30 min" }].map((x) => (
                <button key={x.l} onClick={() => { setPerBatch(x.p); setIntervalMin(x.m); }} style={{ ...pill, ...(perBatch === x.p && intervalMin === x.m ? pillActive : {}) }}>{x.l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
              <span style={{ color: "#6B6862" }}>Send</span>
              <input type="number" value={perBatch} min={1} max={250} onChange={(e) => setPerBatch(parseInt(e.target.value || "50", 10))} style={{ ...input, width: 80, marginBottom: 0 }} />
              <span style={{ color: "#6B6862" }}>recipients every</span>
              <select value={intervalMin} onChange={(e) => setIntervalMin(parseInt(e.target.value, 10))} style={{ ...input, width: 130, marginBottom: 0 }}>
                {[30, 60, 120, 180, 240, 360, 720, 1440].map((m) => <option key={m} value={m}>{humanInterval(m)}</option>)}
              </select>
            </div>
            {drip && (
              <div style={{ marginTop: 10, fontSize: 13, color: drip.fits ? "#137333" : "#b00020", background: drip.fits ? "#e7f4ea" : "#fdecea", padding: 10, borderRadius: 8 }}>
                {drip.fits
                  ? `${numbers.length} recipients in ${drip.chunks} batch${drip.chunks === 1 ? "" : "es"} — first batch now, finishes around ${drip.finishLabel}.`
                  : `Too slow for this list — it would take over 7 days (Twilio's limit). Use a bigger batch or shorter interval.`}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Compliance — keeps the number's quality rating healthy */}
      <div style={{ background: "#FBFAF7", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Before you send</div>
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I confirm these recipients <b>opted in</b> to receive WhatsApp messages from ERE Homes.</span>
        </label>
        <div style={{ fontSize: 13, background: "#FFF8E6", border: "1px solid #F0E2B8", borderRadius: 8, padding: "8px 12px", marginBottom: 10, color: "#6b5a16" }}>
          + Make sure this template gives a clear way out (e.g. “Reply STOP to unsubscribe”). When someone replies STOP they’re blacklisted automatically and never messaged again.
        </div>
        <ul style={{ fontSize: 12, color: "#6B6862", margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Last 24h sent: <b style={{ color: sentToday != null && sentToday + numbers.length > DAILY_CAP ? "#b00020" : "#137333" }}>{sentToday == null ? "…" : sentToday}</b> · this campaign +{numbers.length} (cap for a <b>{wu.label.toLowerCase()}</b> number: {DAILY_CAP}/24h)</li>
          <li>Template-only (works outside the 24h window) · blacklisted/opted-out contacts are skipped</li>
          <li>Paced well under Twilio’s 80 msg/sec limit; build volume gradually to keep your quality rating high</li>
        </ul>
      </div>

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
            {progress.done}/{progress.total} processed · {progress.sent} {mode === "now" ? "sent" : "scheduled"} · {progress.skipped} skipped · {progress.failed} failed
          </div>
        </div>
      )}

      <button onClick={run} disabled={running} style={{ ...btn, background: "#137333", opacity: running ? 0.6 : 1 }}>
        {running ? "Working…" : mode === "now" ? "Send campaign" : mode === "later" ? "Schedule campaign" : "Start drip campaign"}
      </button>

      <div style={{ marginTop: 22, fontSize: 12, color: "#9a958c" }}>
        Pulling segments from the ERE CRM database is coming next — share that database’s URL + key to enable it.
      </div>
    </div>
  );
}

function humanInterval(min: number) {
  if (min % 60 === 0) { const h = min / 60; return `${h} hour${h === 1 ? "" : "s"}`; }
  return `${min} min`;
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
const pill: React.CSSProperties = { padding: "8px 16px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 20, cursor: "pointer", fontSize: 13 };
const pillActive: React.CSSProperties = { background: "#141414", color: "#fff", borderColor: "#141414" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", background: "#fff" };
const errBox: React.CSSProperties = { background: "#fdecea", color: "#b00020", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 };
