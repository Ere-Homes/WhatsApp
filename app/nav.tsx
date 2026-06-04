"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/inbox", label: "Inbox" },
  { href: "/templates", label: "Templates" },
  { href: "/automation", label: "Auto-replies" },
  { href: "/insights", label: "Insights" },
  { href: "/billing", label: "Billing" },
];

export default function Nav() {
  const path = usePathname();
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
    </nav>
  );
}
