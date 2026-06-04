// Display-only phone formatting. Keeps the stored value untouched; only the
// shown text gets country code + grouped digits (e.g. +1 220 242 4577).
export function formatPhone(raw: string): string {
  const d = (raw || "").replace(/[^0-9]/g, "");
  if (!d) return raw || "";
  let cc = "", rest = d;
  if (d.startsWith("971")) { cc = "971"; rest = d.slice(3); }
  else if (d.startsWith("1") && d.length === 11) { cc = "1"; rest = d.slice(1); }
  else if (d.startsWith("44")) { cc = "44"; rest = d.slice(2); }
  else if (d.length > 10) { cc = d.slice(0, d.length - 10); rest = d.slice(cc.length); }

  const groups: string[] = [];
  let r = rest;
  while (r.length > 4) { groups.push(r.slice(0, 3)); r = r.slice(3); }
  if (r) groups.push(r);
  return `+${cc}${cc ? " " : ""}${groups.join(" ")}`.trim();
}
