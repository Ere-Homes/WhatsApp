"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RATES } from "@/lib/rates";
import { supabaseBrowser } from "@/lib/supabase";
import { formatPhone } from "@/lib/format";

type Tpl = { sid: string; name: string; status: string; body: string | null; variables: Record<string, string> };

const BATCH = 25;
// CRM fields a template variable can be personalized from.
const CRM_VAR_FIELDS = [
  { id: "first_name", label: "First name" },
  { id: "name", label: "Full name" },
  { id: "community", label: "Community" },
  { id: "building", label: "Building" },
  { id: "unit_number", label: "Unit number" },
  { id: "nationality", label: "Nationality" },
  { id: "tier", label: "Tier" },
];
function recordValue(rec: any, field: string): string {
  if (!rec) return "";
  if (field === "first_name") return String(rec.name || "").trim().split(/\s+/)[0] || "";
  return rec[field] != null ? String(rec[field]) : "";
}
// Warm-up profiles. A brand-new WhatsApp sender shouldn't blast its full tier
// on day one - Meta ramps you (250 -> 1K -> 10K -> 100K) only while quality
// stays high. Each profile sets a safe 24h cap and a recommended drip pace.
const WARMUP = [
  { id: "new", label: "Brand-new", sub: "first few days", cap: 50, batch: 25, interval: 180 },
  { id: "warming", label: "Warming up", sub: "week 1-2", cap: 250, batch: 50, interval: 120 },
  { id: "established", label: "Established", sub: "good quality rating", cap: 1000, batch: 100, interval: 60 },
] as const;

export default function Campaigns() {
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [tplSid, setTplSid] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [varMap, setVarMap] = useState<Record<string, string>>({}); // var -> "fixed" | CRM field id
  const [crmRecips, setCrmRecips] = useState<any[]>([]); // detailed CRM records for personalization
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
  const [mobileOnly, setMobileOnly] = useState(true); // WhatsApp delivers to mobiles only

  // Filters sent to the API: the dropdown filters plus the mobile-only flag.
  const effFilters = { ...crmFilters, mobile_only: mobileOnly ? "1" : "0" };

  const wu = WARMUP.find((w) => w.id === warmup)!;
  const DAILY_CAP = wu.cap;

  // Lazy-load CRM filter dropdowns the first time the segment tab opens
  useEffect(() => {
    if (source !== "crm" || options.community) return;
    ["community", "nationality", "unit_type", "building"].forEach((col) => {
      fetch(`/api/crm/options?col=${col}`).then((r) => r.json()).then((d) => {
        if (d.values) setOptions((prev) => ({ ...prev, [col]: d.values }));
      });
    });
  }, [source]); // eslint-disable-line

  // Live, approximate segment size - so you can sanity-check the audience
  // before loading it. Debounced; recomputes whenever filters change.
  useEffect(() => {
    if (source !== "crm") return;
    setCrmMatch(null);
    const t = setTimeout(() => {
      fetch("/api/crm/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: effFilters }),
      })
        .then((r) => r.json())
        .then((d) => setCrmMatch(typeof d.count === "number" ? d.count : null))
        .catch(() => setCrmMatch(null));
    }, 400);
    return () => clearTimeout(t);
  }, [source, JSON.stringify(crmFilters), mobileOnly]); // eslint-disable-line

  async function loadSegment() {
    setErr(null);
    setCrmLoading(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: effFilters, limit: crmLimit }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load segment");
      const recs = d.recipients || [];
      if (!recs.length) { setErr("No contactable numbers matched that segment."); setRaw(""); setCrmRecips([]); }
      else { setCrmRecips(recs); setRaw(recs.map((r: any) => r.phone).join("\n")); }
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

    // WhatsApp rejects template params that are empty or contain newlines/tabs/
    // 4+ spaces (error 63024). Clean every value to avoid that.
    const clean = (s: string) => (s || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

    // Build per-recipient variables: fixed text, or pulled from each contact's
    // CRM record (falling back to the fixed text when a field is empty).
    const recMap = new Map(crmRecips.map((r) => [String(r.phone).replace(/[^0-9]/g, ""), r]));
    const hasMapping = tplVars.length > 0;
    let blanks = 0;
    const recipients = numbers.map((p) => {
      if (!hasMapping) return { phone: p, vars: undefined };
      const rec = recMap.get(p.replace(/[^0-9]/g, ""));
      const v: Record<string, string> = {};
      for (const k of tplVars) {
        const src = varMap[k] || "fixed";
        const val = clean(src === "fixed" ? (vars[k] || "") : (recordValue(rec, src) || vars[k] || ""));
        if (!val) blanks++;
        v[k] = val;
      }
      return { phone: p, vars: v };
    });

    // Empty variables are the #1 cause of 63024 — warn before sending.
    if (blanks > 0 && !confirm(`Heads up: ${blanks} variable value(s) are blank across your recipients (missing CRM data and no fallback). WhatsApp rejects blank variables (error 63024). Set a fallback for each variable, or continue and those sends may fail. Continue anyway?`)) return;

    const calls = buildPlan(recipients); // [{ batch, sendAt? }]
    const verb = mode === "now" ? "send now" : mode === "later" ? `schedule for ${new Date(sendAt).toLocaleString()}` : `drip ${perBatch} every ${humanInterval(intervalMin)} (finishes ${drip?.finishLabel})`;
    if (!confirm(`This will ${verb} to ${numbers.length} recipient(s) using "${tpl?.name}". Blacklisted contacts are skipped. Continue?`)) return;

    const label = renderLabel(tpl, vars);
    const finishAtIso =
      mode === "later" ? new Date(sendAt).toISOString()
      : mode === "drip" ? new Date(Date.now() + dripDurationMin * 60000).toISOString()
      : null;

    setRunning(true);
    let done = 0, sent = 0, scheduled = 0, skipped = 0, failed = 0;
    let campaignId: string | undefined;
    setProgress({ done: 0, total: recipients.length, sent: 0, skipped: 0, failed: 0 });
    try {
      // Record the campaign first so it appears in the log immediately.
      const cr = await fetch("/api/campaign/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tpl?.name, templateSid: tplSid, templateName: tpl?.name, sender, mode, total: recipients.length, finishAt: finishAtIso }),
      });
      const cd = await cr.json();
      if (cr.ok) campaignId = cd.id;

      for (const call of calls) {
        const res = await fetch("/api/campaign/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: call.batch, contentSid: tplSid, label, sendAt: call.sendAt, from: sender || undefined, campaignId }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Batch failed");
        for (const r of d.results) {
          done++;
          if (r.status === "skipped_blacklist" || r.status === "skipped_invalid") skipped++;
          else if (r.status === "failed" || r.status === "invalid") failed++;
          else if (r.status === "scheduled") scheduled++;
          else sent++;
        }
        setProgress({ done, total: recipients.length, sent: sent + scheduled, skipped, failed });
      }
      const tail = mode === "drip" ? ` Drip continues until ${drip?.finishLabel}.` : "";
      const sch = scheduled ? `, scheduled ${scheduled}` : "";
      // Compile recipients that aren't in the Audience CRM into the Google Sheet,
      // with where they came from, so they can be added. Best-effort - never
      // blocks or fails the send.
      let uncrmNote = "";
      try {
        const ex = await fetch("/api/campaign/export-uncrm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, campaignName: tpl?.name, mode: source, phones: numbers, sentAt: new Date().toISOString() }),
        });
        const ed = await ex.json();
        if (ex.ok && ed.notInCrm > 0) {
          uncrmNote = ed.logged
            ? ` · ${ed.notInCrm} not in CRM → added to the Sheet.`
            : ` · ${ed.notInCrm} not in CRM (Sheet not configured).`;
        }
      } catch { /* ignore - export is best-effort */ }
      setDoneMsg(`Sent ${sent}${sch} · skipped ${skipped} (blacklisted) · failed ${failed}.${tail}${uncrmNote} See it in the campaign log.`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      // Always record the outcome (even on partial failure) so the log is accurate.
      if (campaignId) {
        await fetch("/api/campaign/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: campaignId, sent, scheduled, failed, skipped }),
        }).catch(() => {});
      }
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: "0 0 6px" }}>Campaigns</h1>
        <Link href="/campaigns/history" style={{ fontSize: 13, color: "#6B6862", textDecoration: "none", whiteSpace: "nowrap" }}>Campaign log →</Link>
      </div>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        Send an approved template to many contacts at once. Blacklisted contacts are skipped automatically.
      </p>

      <Section title="1 · Template">
        <select value={tplSid} onChange={(e) => { setTplSid(e.target.value); setVars({}); setVarMap({}); }} style={input}>
          <option value="">Select an approved template…</option>
          {tpls.map((t) => <option key={t.sid} value={t.sid}>{t.name}</option>)}
        </select>
        {tpl?.body && <div style={{ marginTop: 10, padding: 12, background: "#F5F5F5", borderRadius: 8, fontSize: 14, whiteSpace: "pre-wrap" }}>{renderLabel(tpl, vars)}</div>}
        {tplVars.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: "#6B6862", marginBottom: 4 }}>Fill each variable with fixed text or a CRM field (personalized per recipient).</div>
            {tplVars.map((k) => {
              const src = varMap[k] || "fixed";
              return (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, width: 42, flexShrink: 0 }}>{`{{${k}}}`}</span>
                  <select value={src} onChange={(e) => setVarMap({ ...varMap, [k]: e.target.value })} style={{ ...input, width: 160, marginBottom: 0 }}>
                    <option value="fixed">Fixed text</option>
                    {CRM_VAR_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <input value={vars[k] || ""} onChange={(e) => setVars({ ...vars, [k]: e.target.value })} placeholder={src === "fixed" ? "value for all recipients" : "fallback if missing"} style={{ ...input, flex: 1, minWidth: 150, marginBottom: 0 }} />
                </div>
              );
            })}
            {Object.values(varMap).some((v) => v !== "fixed") && source !== "crm" && (
              <div style={{ fontSize: 12, color: "#9a6700", marginTop: 6 }}>CRM fields only fill for recipients loaded from a CRM segment - pasted numbers will use the fallback text.</div>
            )}
          </div>
        )}
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
              {(["community", "nationality", "unit_type", "building"] as const).map((col) => (
                <select key={col} value={crmFilters[col] || ""} onChange={(e) => setCrmFilters({ ...crmFilters, [col]: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                  <option value="">{col.replace("_", " ")}: any</option>
                  {(options[col] || []).map((o: any) => <option key={o.val} value={o.val}>{o.val} ({o.n})</option>)}
                </select>
              ))}
              <select value={crmFilters.number_of_properties || ""} onChange={(e) => setCrmFilters({ ...crmFilters, number_of_properties: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                <option value="">properties: any</option>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map((n) => <option key={n} value={n}>{n} {n === "1" ? "property" : "properties"}</option>)}
              </select>
              <select value={crmFilters.verified_source || ""} onChange={(e) => setCrmFilters({ ...crmFilters, verified_source: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                <option value="">source: any</option>
                {["Property Finder", "Bayut", "AiLookup", "Property Monitor", "Dubizzle"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#6B6862" }}>Value AED
                <input type="number" value={crmFilters.value_min || ""} min={0} placeholder="min" onChange={(e) => setCrmFilters({ ...crmFilters, value_min: e.target.value })} style={{ ...input, width: 110, marginLeft: 6, marginBottom: 0, display: "inline-block" }} />
              </label>
              <span style={{ color: "#9a958c" }}>to</span>
              <input type="number" value={crmFilters.value_max || ""} min={0} placeholder="max" onChange={(e) => setCrmFilters({ ...crmFilters, value_max: e.target.value })} style={{ ...input, width: 110, marginBottom: 0 }} />
              <label style={{ fontSize: 13, color: "#3a3a3a", display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <input type="checkbox" checked={mobileOnly} onChange={(e) => setMobileOnly(e.target.checked)} /> Mobile numbers only
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, color: "#6B6862" }}>Max recipients
                <input type="number" value={crmLimit} min={1} max={5000} onChange={(e) => setCrmLimit(parseInt(e.target.value || "500", 10))} style={{ ...input, width: 90, marginLeft: 6, marginBottom: 0, display: "inline-block" }} />
              </label>
              <button onClick={loadSegment} disabled={crmLoading} style={{ ...pillActive, padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer" }}>
                {crmLoading ? "Loading…" : "Load recipients"}
              </button>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, padding: "8px 12px", background: "#F5F5F5", borderRadius: 8, color: "#3a3a3a" }}>
              {crmMatch == null ? "Counting matching contacts…" : (
                <><b>~{crmMatch.toLocaleString()}</b> contactable contact{crmMatch === 1 ? "" : "s"} match this segment.{crmMatch > crmLimit && <> You’ll load the first <b>{crmLimit.toLocaleString()}</b>.</>}</>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#9a958c", marginTop: 6 }}>Approximate, before mobile-only filtering. Excludes do-not-call, uncontactable, and switchboards.{mobileOnly && " Mobile-only is on, so the loaded list will be smaller than this count."}</div>
          </div>
        )}

        <div style={{ fontSize: 13, color: numbers.length ? "#137333" : "#9a958c", fontWeight: 600, marginTop: 10 }}>{numbers.length} valid recipient{numbers.length === 1 ? "" : "s"}</div>
      </Section>

      <Section title="3 · Send from">
        <select value={sender} onChange={(e) => setSender(e.target.value)} style={{ ...input, maxWidth: 280 }}>
          {senders.length === 0 && <option value="">(no sender configured)</option>}
          {senders.map((s) => <option key={s} value={s}>{formatPhone(s)}</option>)}
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
            <div style={{ fontSize: 13, color: "#6B6862", marginBottom: 8 }}>Send a small batch, wait, repeat - the gentle way to protect your number. Pick a pace:</div>
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
                  ? `${numbers.length} recipients in ${drip.chunks} batch${drip.chunks === 1 ? "" : "es"} - first batch now, finishes around ${drip.finishLabel}.`
                  : `Too slow for this list - it would take over 7 days (Twilio's limit). Use a bigger batch or shorter interval.`}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Compliance - keeps the number's quality rating healthy */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Before you send</div>
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I confirm these recipients <b>opted in</b> to receive WhatsApp messages from ERE Homes.</span>
        </label>
        <div style={{ fontSize: 13, background: "#FFF8E6", border: "1px solid #F0E2B8", borderRadius: 8, padding: "8px 12px", marginBottom: 10, color: "#6b5a16" }}>
          + Make sure this template gives a clear way out (e.g. “Reply STOP to unsubscribe”). When someone replies STOP they’re blacklisted automatically and never messaged again.
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
          <span style={{ color: "#6B6862" }}>Recipients</span><b>{numbers.length}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 6 }}>
          <span style={{ color: "#6B6862" }}>Est. cost floor (Twilio fee)</span><b>${estUsd.toFixed(2)}</b>
        </div>
        <div style={{ fontSize: 11, color: "#9a958c", marginTop: 6 }}>Plus Meta marketing rate per message (country-specific). Outside the 24h window, template sending is required - which this uses.</div>
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

      {doneMsg && (
        <div style={{ marginTop: 16 }}>
          <Link href="/campaigns/history" style={{ fontSize: 13, color: "#137333" }}>View campaign log →</Link>
        </div>
      )}
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
