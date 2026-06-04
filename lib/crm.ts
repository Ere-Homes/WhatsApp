// Read-only access to the ERE audience CRM (Supabase) for building segments.
const clean = (v?: string) => (v || "").replace(/^\uFEFF/, "").trim();
const URL = () => clean(process.env.CRM_SUPABASE_URL);
const KEY = () => clean(process.env.CRM_SUPABASE_KEY);

const FILTERABLE = ["community", "nationality", "unit_type", "building", "tier"];

async function crmGet(path: string) {
  const res = await fetch(`${URL()}/rest/v1/${path}`, {
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`CRM ${res.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

// Distinct values + counts for a filter column (from the small filter_options table).
export async function crmOptions(col: string) {
  if (!FILTERABLE.includes(col)) throw new Error("Unsupported column");
  const rows = await crmGet(`filter_options?col=eq.${col}&select=val,n&order=n.desc&limit=400`);
  return (rows || []).filter((r: any) => r.val && r.val !== "#N/A");
}

// Shared WHERE clause: only contactable numbers (has phone, not do-not-call,
// not uncontactable, not a switchboard) plus any chosen filters.
function contactableParts(filters: Record<string, string>) {
  const parts = [
    "phone=not.is.null",
    "do_not_call=eq.N",
    "is_uncontactable=not.is.true",
    "phone_is_switchboard=not.is.true",
  ];
  for (const [k, v] of Object.entries(filters || {})) {
    if (v && FILTERABLE.includes(k)) parts.push(`${k}=eq.${encodeURIComponent(v)}`);
  }
  return parts;
}

// Contactable phone numbers matching the chosen filters.
export async function crmContacts(filters: Record<string, string>, limit: number) {
  const parts = ["select=phone", ...contactableParts(filters)];
  parts.push(`limit=${Math.min(Math.max(limit || 500, 1), 5000)}`);
  const rows = await crmGet(`contacts?${parts.join("&")}`);
  const phones = Array.from(new Set((rows || []).map((r: any) => r.phone).filter(Boolean)));
  return phones;
}

// Look up a single CRM contact by a WhatsApp number (E.164 digits, no +).
// CRM phones are stored inconsistently (e.g. ".0502077152", local "05..."),
// so we try several format variants against an indexed equality/in lookup.
const CRM_CONTACT_COLS = "name,community,building,tier,nationality,unit_type,total_transaction_value_aed,number_of_transactions,has_bought_before,has_sold_before,last_transaction_date,do_not_call";

function phoneVariants(wa: string): string[] {
  const digits = (wa || "").replace(/[^0-9]/g, "");
  if (!digits) return [];
  const set = new Set<string>([`+${digits}`, digits]);
  // UAE: strip 971 country code -> national number, add leading 0 + dotted forms
  let national = digits;
  if (digits.startsWith("971")) national = digits.slice(3);
  for (const n of [national, `0${national}`]) {
    set.add(n);
    set.add(`.${n}`); // observed leading-dot format
  }
  return Array.from(set);
}

export async function crmContactByPhone(wa: string) {
  const variants = phoneVariants(wa);
  if (!variants.length) return null;
  // Only the `phone` column is indexed — querying `phone2` too (via OR) forces a
  // full-table scan on 9.48M rows and times out, so we match on `phone` only.
  const inList = variants.map((v) => `"${v}"`).join(",");
  const rows = await crmGet(`contacts?phone=in.(${inList})&select=${CRM_CONTACT_COLS}&limit=1`);
  return (rows && rows[0]) || null;
}

// Approximate count of contactable contacts matching filters. Uses the
// planner's row estimate (Prefer: count=estimated) so it's fast and never
// trips the anon statement timeout on the 9.48M-row contacts table.
export async function crmCount(filters: Record<string, string>) {
  const parts = ["select=phone", ...contactableParts(filters), "limit=1"];
  const res = await fetch(`${URL()}/rest/v1/contacts?${parts.join("&")}`, {
    headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, Prefer: "count=estimated" },
  });
  if (!res.ok) throw new Error(`CRM ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const total = parseInt((res.headers.get("content-range") || "").split("/")[1] || "0", 10);
  return isNaN(total) ? 0 : total;
}
