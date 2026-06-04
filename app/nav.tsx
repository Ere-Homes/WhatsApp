"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  if (path === "/login") return null; // no chrome on the login screen

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
          </Link>
        );
      })}
      <button
        onClick={logout}
        title="Sign out"
        style={{
          marginLeft: "auto",
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
