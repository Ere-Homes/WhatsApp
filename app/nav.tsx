"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Inbox" },
  { href: "/templates", label: "Templates" },
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
        padding: "0 18px",
        height: 48,
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: "Georgia, serif", letterSpacing: 3, marginRight: 22, fontSize: 14 }}>
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
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: 13,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
