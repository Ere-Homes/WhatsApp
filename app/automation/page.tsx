"use client";
import { useEffect, useState } from "react";

type Rule = {
  id?: string;
  trigger: string;
  reply: string | null;
  block: boolean;
  push_pipedrive: boolean;
  enabled: boolean;
};

const BLANK: Rule = { trigger: "", reply: "", block: false, push_pipedrive: false, enabled: true };

export default function Automation() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/auto-replies");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setRules(d.rules || []);
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save(r: Rule) {
    setErr(null);
    const res = await fetch("/api/auto-replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
    const d = await res.json();
    if (!res.ok) { setErr(d.error); return; }
    setEditing(null);
    load();
  }
  async function remove(id?: string) {
    if (!id || !confirm("Delete this rule?")) return;
    await fetch(`/api/auto-replies?id=${id}`, { method: "DELETE" });
    load();
  }
  async function toggle(r: Rule) {
    await save({ ...r, enabled: !r.enabled });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>Auto-replies</h1>
        <button onClick={() => setEditing({ ...BLANK })} style={btn}>+ New rule</button>
      </div>
      <p style={{ color: "#6B6862", fontSize: 14, marginTop: 0, marginBottom: 18 }}>
        When a contact taps a button or texts a keyword that matches a <b>trigger</b>, the app can auto-reply,
        block them, and/or create a Hot lead in Pipedrive. Triggers match the button text exactly (case-insensitive).
      </p>

      {err && <div style={errBox}>{err}</div>}
      {loading && <div style={{ color: "#6B6862" }}>Loading…</div>}

      {editing && <RuleForm rule={editing} onCancel={() => setEditing(null)} onSave={save} />}

      <div style={{ display: "grid", gap: 10 }}>
        {rules.map((r) => (
          <div key={r.id} style={{ ...card, opacity: r.enabled ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  “{r.trigger}”
                  {r.block && <Tag c="#b00020">blocks</Tag>}
                  {r.push_pipedrive && <Tag c="#137333">→ Pipedrive</Tag>}
                  {!r.enabled && <Tag c="#6B6862">off</Tag>}
                </div>
                {r.reply && <div style={{ fontSize: 13, color: "#6B6862", marginTop: 6, whiteSpace: "pre-wrap" }}>{r.reply}</div>}
                {!r.reply && !r.block && !r.push_pipedrive && <div style={{ fontSize: 12, color: "#9a958c", marginTop: 4 }}>No action set</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => toggle(r)} style={action}>{r.enabled ? "Disable" : "Enable"}</button>
                <button onClick={() => setEditing(r)} style={action}>Edit</button>
                <button onClick={() => remove(r.id)} style={{ ...action, color: "#b00020" }}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {!loading && rules.length === 0 && <div style={{ color: "#9a958c" }}>No rules yet. Add one to start auto-replying to button taps.</div>}
      </div>
    </div>
  );
}

function RuleForm({ rule, onCancel, onSave }: { rule: Rule; onCancel: () => void; onSave: (r: Rule) => void }) {
  const [r, setR] = useState<Rule>({ ...rule, reply: rule.reply || "" });
  return (
    <div style={{ ...card, background: "#FBFAF7", marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>{rule.id ? "Edit rule" : "New rule"}</div>
      <label style={lbl}>Trigger (button text / keyword)</label>
      <input value={r.trigger} onChange={(e) => setR({ ...r, trigger: e.target.value })} placeholder="e.g. MANAGE" style={input} />
      <label style={lbl}>Auto-reply message (optional)</label>
      <textarea value={r.reply || ""} onChange={(e) => setR({ ...r, reply: e.target.value })} rows={3} placeholder="Message to send back automatically" style={{ ...input, resize: "vertical" }} />
      <div style={{ display: "flex", gap: 18, margin: "10px 0 14px" }}>
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={r.push_pipedrive} onChange={(e) => setR({ ...r, push_pipedrive: e.target.checked })} /> Create Hot lead in Pipedrive
        </label>
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={r.block} onChange={(e) => setR({ ...r, block: e.target.checked })} /> Block (opt-out)
        </label>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave(r)} style={{ ...btn, background: "#137333" }}>Save rule</button>
        <button onClick={onCancel} style={action}>Cancel</button>
      </div>
    </div>
  );
}

function Tag({ c, children }: { c: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 11, color: "#fff", background: c, padding: "2px 8px", borderRadius: 12, marginLeft: 8, verticalAlign: "middle" }}>{children}</span>;
}

const btn: React.CSSProperties = { padding: "9px 18px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, letterSpacing: 1, textTransform: "uppercase" };
const action: React.CSSProperties = { padding: "7px 14px", background: "#fff", border: "1px solid #E4E1DB", borderRadius: 8, cursor: "pointer", fontSize: 13 };
const card: React.CSSProperties = { background: "#fff", border: "1px solid #E4E1DB", borderRadius: 12, padding: 16 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 6, background: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "#6B6862", marginBottom: 4, marginTop: 6 };
const errBox: React.CSSProperties = { background: "#fdecea", color: "#b00020", padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 14 };
