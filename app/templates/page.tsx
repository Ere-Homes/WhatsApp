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
  const [showNew, setShowNew] = useState(false);

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

  const [busySid, setBusySid] = useState<string | null>(null);

  async function deleteTpl(t: Tpl) {
    if (!confirm(`Delete template "${t.name}"? This removes it from Twilio and cannot be undone.`)) return;
    setBusySid(t.sid);
    setErr(null);
    try {
      const res = await fetch(`/api/templates?sid=${encodeURIComponent(t.sid)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setTpls((prev) => prev.filter((x) => x.sid !== t.sid));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusySid(null);
    }
  }

  async function duplicateTpl(t: Tpl) {
    const name = prompt(`New name for the copy of "${t.name}"`, `${t.name}_copy`);
    if (!name) return;
    setBusySid(t.sid);
    setErr(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateOf: t.sid, name: name.toLowerCase(), category: t.category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate failed");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusySid(null);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 24, margin: 0 }}>
          WhatsApp Templates
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowNew((s) => !s)} style={{ ...btn, background: showNew ? "#6B6862" : "#137333" }}>
            {showNew ? "Close" : "+ New template"}
          </button>
          <button onClick={load} style={btn}>{loading ? "Loading…" : "Refresh"}</button>
        </div>
      </div>

      {showNew && (
        <NewTemplate
          onCreated={() => {
            setShowNew(false);
            load();
          }}
        />
      )}

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

            <div style={{ display: "flex", gap: 8, marginTop: 14, borderTop: "1px solid #F0EEE9", paddingTop: 12 }}>
              <button onClick={() => duplicateTpl(t)} disabled={busySid === t.sid} style={action}>
                {busySid === t.sid ? "…" : "Duplicate"}
              </button>
              <button onClick={() => deleteTpl(t)} disabled={busySid === t.sid} style={{ ...action, color: "#b00020", borderColor: "#f0c5c0" }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Btn = { type: "url" | "phone" | "quick-reply"; title: string; url?: string; phone?: string };

function NewTemplate({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<"text" | "card" | "quick-reply">("text");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("MARKETING");
  const [language, setLanguage] = useState("en");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setMediaUrl(d.url);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setUploading(false);
    }
  }

  const maxButtons = kind === "quick-reply" ? 3 : 2;
  function addButton() {
    if (buttons.length >= maxButtons) return;
    setButtons([...buttons, { type: kind === "quick-reply" ? "quick-reply" : "url", title: "" }]);
  }
  function setBtn(i: number, patch: Partial<Btn>) {
    setButtons(buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  async function submit() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const payload: any = { name, category, language, kind };
      if (kind === "text") payload.body = body;
      if (kind === "card") {
        payload.title = title;
        if (subtitle) payload.subtitle = subtitle;
        if (mediaUrl) payload.mediaUrl = mediaUrl;
        payload.buttons = buttons;
      }
      if (kind === "quick-reply") {
        payload.body = body;
        payload.buttons = buttons;
      }
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.approvalError) {
        setMsg(`Created ${data.sid}, but approval submit failed: ${data.approvalError}`);
      } else {
        setMsg(`Submitted "${data.name}" — status: ${data.status}. Refreshing…`);
        setTimeout(onCreated, 900);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 18, background: "#FBFAF7" }}>
      <div style={{ fontWeight: 600, marginBottom: 14 }}>New WhatsApp template</div>

      {/* Type selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([["text", "Text"], ["card", "WhatsApp Card"], ["quick-reply", "Quick Reply"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => { setKind(k); setButtons([]); }}
            style={{ ...pill, ...(kind === k ? pillActive : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px", gap: 10, marginBottom: 12 }}>
        <Field label="Name (a-z, 0-9, _)">
          <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="property_offer_v2" style={input} />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
            <option>MARKETING</option>
            <option>UTILITY</option>
            <option>AUTHENTICATION</option>
          </select>
        </Field>
        <Field label="Lang">
          <input value={language} onChange={(e) => setLanguage(e.target.value)} style={input} />
        </Field>
      </div>

      {/* Type-specific fields */}
      {kind === "card" && (
        <>
          <Field label="Title / headline">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="List your property with ERE" style={input} />
          </Field>
          <Field label="Subtitle (optional)">
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} style={input} />
          </Field>
          <Field label="Header image (optional)">
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ fontSize: 13 }} />
              {uploading && <span style={{ fontSize: 12, color: "#9a6700" }}>Uploading…</span>}
            </div>
            <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="…or paste an image URL" style={input} />
            {mediaUrl && !uploading && (
              <img src={mediaUrl} alt="header preview" style={{ maxHeight: 90, marginTop: 8, borderRadius: 8, border: "1px solid #E4E1DB" }} />
            )}
          </Field>
        </>
      )}
      {(kind === "text" || kind === "quick-reply") && (
        <Field label={`Body  (use {{1}}, {{2}} for variables)`}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Hi {{1}}, here's your update…" style={{ ...input, resize: "vertical" }} />
        </Field>
      )}

      {/* Buttons for card + quick-reply */}
      {(kind === "card" || kind === "quick-reply") && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "#6B6862" }}>
              Buttons {kind === "quick-reply" ? "(quick replies, up to 3)" : "(up to 2: link or call)"}
            </span>
            <button onClick={addButton} disabled={buttons.length >= maxButtons} style={{ ...pill, padding: "4px 12px" }}>+ Add</button>
          </div>
          {buttons.map((bt, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              {kind === "card" && (
                <select value={bt.type} onChange={(e) => setBtn(i, { type: e.target.value as any })} style={{ ...input, width: 120 }}>
                  <option value="url">Link</option>
                  <option value="phone">Call</option>
                  <option value="quick-reply">Reply</option>
                </select>
              )}
              <input value={bt.title} onChange={(e) => setBtn(i, { title: e.target.value })} placeholder="Button text" style={{ ...input, flex: 1 }} />
              {kind === "card" && bt.type === "url" && (
                <input value={bt.url || ""} onChange={(e) => setBtn(i, { url: e.target.value })} placeholder="https://…" style={{ ...input, flex: 1 }} />
              )}
              {kind === "card" && bt.type === "phone" && (
                <input value={bt.phone || ""} onChange={(e) => setBtn(i, { phone: e.target.value })} placeholder="+9715…" style={{ ...input, flex: 1 }} />
              )}
              <button onClick={() => setButtons(buttons.filter((_, idx) => idx !== i))} style={{ ...pill, padding: "6px 10px", color: "#b00020" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ ...errBox, marginTop: 12 }}>{err}</div>}
      {msg && <div style={{ background: "#e7f4ea", color: "#137333", padding: 12, borderRadius: 8, marginTop: 12, fontSize: 14 }}>{msg}</div>}

      <div style={{ marginTop: 14 }}>
        <button onClick={submit} disabled={busy} style={{ ...btn, background: "#137333" }}>
          {busy ? "Submitting…" : "Create & submit for approval"}
        </button>
        <span style={{ fontSize: 12, color: "#9a958c", marginLeft: 12 }}>
          Goes to Meta for review; status shows here as pending → approved/rejected.
        </span>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12, color: "#6B6862", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
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
const pill: React.CSSProperties = {
  padding: "8px 16px",
  background: "#fff",
  border: "1px solid #E4E1DB",
  borderRadius: 20,
  cursor: "pointer",
  fontSize: 13,
};
const pillActive: React.CSSProperties = { background: "#141414", color: "#fff", borderColor: "#141414" };
const action: React.CSSProperties = {
  padding: "7px 16px",
  background: "#fff",
  border: "1px solid #E4E1DB",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #E4E1DB",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
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
