"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Login failed");
      router.replace(params.get("next") || "/");
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: "#fff", border: "1px solid #E4E1DB", borderRadius: 16, padding: 28 }}>
        <div style={{ fontFamily: "Georgia, serif", letterSpacing: 2, fontSize: 15, marginBottom: 4 }}>ERE HOMES</div>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 22, margin: "0 0 18px" }}>WhatsApp Console</h1>

        <label style={{ fontSize: 13, color: "#6B6862" }}>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" placeholder="marketing@erehomes.ae" style={inp} />

        <label style={{ fontSize: 13, color: "#6B6862" }}>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" style={inp} />

        {err && <div style={{ background: "#fdecea", color: "#b00020", padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: "100%", padding: "12px", background: "#141414", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", letterSpacing: 1, textTransform: "uppercase", fontSize: 13, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={{ fontSize: 11, color: "#9a958c", marginTop: 14, textAlign: "center" }}>Access restricted to the ERE Homes marketing team.</div>
      </form>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1px solid #E4E1DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginTop: 4, marginBottom: 14 };
