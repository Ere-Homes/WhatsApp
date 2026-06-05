"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon, IC, PageHead, LANG_LABEL, CHECK2 } from "@/lib/ui";
import { CAMPAIGNS, CAMP_STATUS, SEGMENTS, SEED_TEMPLATES, type Campaign, type Segment, type Tpl } from "@/lib/fixtures";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function MiniPreview({ tpl }: { tpl: Tpl | null }) {
  if (!tpl) return <div className="mini-empty">Pick a template to preview the message your contacts will receive.</div>;
  const render = (t?: string | null) => (t || "").replace(/\{\{(\d+)\}\}/g, (_, n) => (n === "1" ? "Aisha" : tpl.variables?.[n] || `{{${n}}}`));
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="wa-top"><div className="wa-ava">E</div><div><div className="wa-name">ERE Homes</div><div className="wa-status">online</div></div></div>
      <div className="wa-chat">
        <div className="wa-bubble"><div className="bbody">{render(tpl.body)}</div><div className="btime">12:30 PM <span style={{ color: "#53bdeb" }}>{CHECK2}</span></div></div>
        {tpl.replyButtons.length > 0 && <div className="wa-replies">{tpl.replyButtons.map((b, i) => <div key={i} className="wa-reply"><Icon d={IC.reply} s={13} /> {b}</div>)}</div>}
      </div>
    </div>
  );
}

function CampaignModal({ approved, onClose, onLaunch, initialWhen }: { approved: Tpl[]; onClose: () => void; onLaunch: (c: Campaign) => void; initialWhen: "now" | "schedule" }) {
  const [step, setStep] = useState(1);
  const [tpl, setTpl] = useState<Tpl | null>(null);
  const [seg, setSeg] = useState<Segment | null>(null);
  const [name, setName] = useState("");
  const [when, setWhen] = useState<"now" | "schedule">(initialWhen);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const canNext = step === 1 ? !!tpl : step === 2 ? !!seg : !!name.trim() && (when === "now" || !!date);
  const STEPS: [number, string][] = [[1, "Template"], [2, "Audience"], [3, "Schedule"]];

  function launch() {
    if (!tpl || !seg) return;
    setBusy(true);
    // Best-effort: log the campaign to the real backend if it's configured.
    fetch("/api/campaign/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), templateSid: tpl.sid, templateName: tpl.name, mode: when === "now" ? "now" : "later", total: seg.count, finishAt: when === "schedule" && date ? new Date(date).toISOString() : null }),
    }).catch(() => {});
    setTimeout(() => onLaunch({
      name: name.trim(), template: tpl.name, segment: seg.name, audience: seg.count,
      sent: when === "now" ? seg.count : 0,
      delivered: when === "now" ? Math.round(seg.count * 0.97) : 0,
      read: when === "now" ? Math.round(seg.count * 0.62) : 0,
      replied: 0,
      status: when === "now" ? "sending" : "scheduled",
      date: when === "now" ? "Today" : date ? new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Scheduled",
    }), 650);
  }

  return (
    <div className="modal">
      <div className="modal-head">
        <button className="icon-btn" onClick={onClose}><Icon d={IC.x} s={18} /></button>
        <div><div className="mt">New campaign</div><div className="ms">Broadcast an approved template to an audience segment</div></div>
        <div className="mr">
          {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 3 && <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>}
          {step === 3 && <button className="btn btn-primary" disabled={!canNext || busy} onClick={launch}><Icon d={IC.send} s={15} f="currentColor" w={0} />{busy ? "Launching…" : when === "now" ? "Send now" : "Schedule"}</button>}
        </div>
      </div>
      <div className="modal-body">
        <div className="composer-form">
          <div className="steps-ind">
            {STEPS.map(([n, l], i) => (
              <span key={n} style={{ display: "contents" }}>
                <div className={`step-chip ${step >= n ? "on" : ""}`}><span className="n">{step > n ? <Icon d={IC.check} s={13} /> : n}</span>{l}</div>
                {i < STEPS.length - 1 && <span className="step-sep" />}
              </span>
            ))}
          </div>

          {step === 1 && (
            <div className="sect">
              <div className="sect-t">Choose a template</div>
              <div className="sect-d">Only Meta-approved templates can be broadcast.</div>
              {approved.map((t) => (
                <div key={t.sid} className={`pick ${tpl?.sid === t.sid ? "on" : ""}`} onClick={() => { setTpl(t); if (!name) setName(`${t.name} broadcast`); }}>
                  <span className="pk-radio" />
                  <div className="pk-main"><div className="pk-t mono">{t.name}</div><div className="pk-s">{(t.body || "").replace(/\s+/g, " ").trim()}</div></div>
                  <span className="pk-meta">{LANG_LABEL(t.language)}</span>
                </div>
              ))}
              {approved.length === 0 && <div className="empty sm">No approved templates yet. Create one under Templates.</div>}
            </div>
          )}

          {step === 2 && (
            <div className="sect">
              <div className="sect-t">Choose an audience</div>
              <div className="sect-d">Saved segments from your owner database.</div>
              {SEGMENTS.map((s) => (
                <div key={s.name} className={`pick ${seg?.name === s.name ? "on" : ""}`} onClick={() => setSeg(s)}>
                  <span className="pk-radio" />
                  <div className="pk-main"><div className="pk-t">{s.name}</div><div className="pk-s">{s.community}</div></div>
                  <span className="pk-meta">{s.count.toLocaleString()} contacts</span>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <>
              <div className="sect">
                <div className="sect-t">Campaign name</div>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring Palm offer" />
              </div>
              <div className="sect">
                <div className="sect-t">When to send</div>
                <div className="radio-line"><label><input type="radio" checked={when === "now"} onChange={() => setWhen("now")} /> Send now</label></div>
                <div className="radio-line"><label><input type="radio" checked={when === "schedule"} onChange={() => setWhen("schedule")} /> Schedule for later</label></div>
                {when === "schedule" && <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />}
              </div>
              <div className="sect">
                <div className="sect-t">Review</div>
                <div className="review">
                  <div className="review-row"><span className="rk">Template</span><span className="rv mono">{tpl?.name}</span></div>
                  <div className="review-row"><span className="rk">Audience</span><span className="rv">{seg?.name}</span></div>
                  <div className="review-row"><span className="rk">Recipients</span><span className="rv">{seg?.count.toLocaleString()}</span></div>
                  <div className="review-row"><span className="rk">Send</span><span className="rv">{when === "now" ? "Immediately" : date || "Not set"}</span></div>
                  <div className="review-row"><span className="rk">Est. cost</span><span className="rv">${(seg ? seg.count * 0.0384 : 0).toFixed(2)}</span></div>
                </div>
              </div>
            </>
          )}
          <div style={{ height: 20 }} />
        </div>
        <div className="composer-aside"><div className="sticky"><div className="preview-lab">Message preview</div><MiniPreview tpl={tpl} /></div></div>
      </div>
    </div>
  );
}

export default function Campaigns() {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<Campaign[]>(CAMPAIGNS);
  const [modal, setModal] = useState<null | "now" | "schedule">(null);
  const [approved, setApproved] = useState<Tpl[]>(SEED_TEMPLATES.filter((t) => t.status === "approved"));

  // Real approved templates when Twilio is configured; otherwise the fixtures.
  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => {
        const a = (d.templates || []).filter((t: Tpl) => t.status === "approved");
        if (a.length) setApproved(a);
      })
      .catch(() => {});
  }, []);

  const list = rows.filter((c) => tab === "all" || c.status === tab || (tab === "sent" && c.status === "sending"));
  const totals = rows.reduce((a, c) => ({ sent: a.sent + c.sent, delivered: a.delivered + c.delivered, read: a.read + c.read, replied: a.replied + c.replied }), { sent: 0, delivered: 0, read: 0, replied: 0 });

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Campaigns" sub="Broadcast an approved template to a saved audience segment, and track delivery and replies.">
        <Link className="btn btn-ghost" href="/campaigns/new"><Icon d={IC.bolt} s={15} />Advanced</Link>
        <button className="btn btn-sec" onClick={() => setModal("schedule")}><Icon d={IC.cal} s={15} />Schedule</button>
        <button className="btn btn-primary" onClick={() => setModal("now")}><Icon d={IC.plus} s={16} />New campaign</button>
      </PageHead>

      <div className="kpis k4">
        <div className="kpi"><div className="kl">Messages sent</div><div className="kv">{totals.sent.toLocaleString()}</div><div className="ks">last 90 days</div></div>
        <div className="kpi"><div className="kl">Delivered</div><div className="kv">{pct(totals.delivered, totals.sent)}%</div><div className="ks">{totals.delivered.toLocaleString()} messages</div></div>
        <div className="kpi"><div className="kl">Read</div><div className="kv">{pct(totals.read, totals.delivered)}%</div><div className="ks">of delivered</div></div>
        <div className="kpi"><div className="kl">Replied</div><div className="kv">{totals.replied}</div><div className="ks">conversations started</div></div>
      </div>

      <div className="bar">
        <div className="tabs">
          {[["all", "All"], ["sent", "Sent"], ["scheduled", "Scheduled"], ["draft", "Drafts"]].map(([id, l]) => (
            <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
              {l}<span className="cnt">{id === "all" ? rows.length : rows.filter((c) => c.status === id || (id === "sent" && c.status === "sending")).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        {list.length > 0 ? (
          <table className="ttable">
            <thead><tr><th>Campaign</th><th>Audience</th><th>Delivered</th><th>Read</th><th>Replied</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const s = CAMP_STATUS[c.status];
                return (
                  <tr key={c.name} className="norow">
                    <td><div className="camp-name"><div className="cn-t">{c.name}</div><div className="cn-s mono">{c.template} · {c.segment}</div></div></td>
                    <td className="tcol-muted">{c.audience.toLocaleString()}</td>
                    <td>{c.sent ? <div className="prog"><div className="prog-bar"><div className="prog-fill" style={{ width: `${pct(c.delivered, c.sent)}%` }} /></div><span>{pct(c.delivered, c.sent)}%</span></div> : <span className="tcol-muted">—</span>}</td>
                    <td className="tcol-muted">{c.sent ? `${pct(c.read, c.delivered)}%` : "—"}</td>
                    <td className="tcol-muted">{c.replied || "—"}</td>
                    <td><span className="badge" style={{ color: s.fg, background: s.bg, borderColor: s.bd }}><span className="bd" style={{ background: s.dot }} />{s.label}</span></td>
                    <td className="tcol-muted" style={{ whiteSpace: "nowrap" }}>{c.date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty"><div className="ei"><Icon d={IC.camp} s={22} /></div><h4>No campaigns here</h4><div>Create a campaign, or switch tabs to see others.</div></div>
        )}
      </div>

      {modal && <CampaignModal approved={approved} initialWhen={modal} onClose={() => setModal(null)} onLaunch={(c) => { setRows((p) => [c, ...p]); setModal(null); }} />}
    </div></div>
  );
}
