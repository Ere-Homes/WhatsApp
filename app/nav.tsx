"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/templates", label: "Templates" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/insights", label: "Insights" },
  { href: "/billing", label: "Billing" },
];

export default function Nav() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState(false);

  // Live unread count + browser notification when a new inbound reply lands.
  useEffect(() => {
    if (path === "/login") return;
    const sb = supabaseBrowser();
    async function refresh() {
      const { count } = await sb.from("conversations").select("id", { count: "exact", head: true }).eq("unread", true);
      setUnread(count ?? 0);
    }
    refresh();
    if (typeof Notification !== "undefined") setAlerts(Notification.permission === "granted");

    const ch = sb
      .channel("nav-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "direction=eq.in" }, (p: any) => {
        refresh();
        // Don't notify if you're already looking at the inbox.
        const onInbox = typeof document !== "undefined" && document.visibilityState === "visible" && window.location.pathname.startsWith("/inbox");
        if (!onInbox && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification("New WhatsApp reply", { body: (p.new?.body || "New message").slice(0, 90) });
          n.onclick = () => { window.focus(); window.location.href = "/inbox"; };
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, refresh)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [path]);

  if (path === "/login") return null; // no chrome on the login screen

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  async function enableAlerts() {
    if (typeof Notification === "undefined") return alert("This browser doesn't support notifications.");
    const p = await Notification.requestPermission();
    setAlerts(p === "granted");
  }
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "#141414",
        color: "#fff",
        padding: "0 12px",
        height: 48,
        flexShrink: 0,
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontFamily: "Georgia, serif", letterSpacing: 2, margin: "0 16px 0 6px", fontSize: 13, flexShrink: 0 }}>
        ERE HOMES
      </span>
      {TABS.map((t) => {
        const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              color: active ? "#141414" : "#cfccc6",
              background: active ? "#fff" : "transparent",
              textDecoration: "none",
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 13,
              letterSpacing: 1,
              textTransform: "uppercase",
              flexShrink: 0,
            }}
          >
            {t.label}
            {t.href === "/inbox" && unread > 0 && (
              <span style={{ marginLeft: 8, background: "#137333", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{unread}</span>
            )}
          </Link>
        );
      })}
      <button
        onClick={enableAlerts}
        title={alerts ? "Lead alerts on" : "Turn on lead alerts"}
        style={{
          marginLeft: "auto",
          color: alerts ? "#7Cd992" : "#cfccc6",
          background: "transparent",
          border: "1px solid #3a3a3a",
          cursor: "pointer",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={alerts ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
      </button>
      <button
        onClick={logout}
        title="Sign out"
        style={{
          color: "#cfccc6",
          background: "transparent",
          border: "1px solid #3a3a3a",
          cursor: "pointer",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 12,
          letterSpacing: 1,
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
