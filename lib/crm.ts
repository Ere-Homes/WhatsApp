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

// Contactable phone numbers matching the chosen filters.
export async function crmContacts(filters: Record<string, string>, limit: number) {
  const parts = [
    "select=phone",
    "phone=not.is.null",
    "do_not_call=eq.N",
    "is_uncontactable=not.is.true",
    "phone_is_switchboard=not.is.true",
  ];
  for (const [k, v] of Object.entries(filters || {})) {
    if (v && FILTERABLE.includes(k)) parts.push(`${k}=eq.${encodeURIComponent(v)}`);
  }
  parts.push(`limit=${Math.min(Math.max(limit || 500, 1), 5000)}`);
  const rows = await crmGet(`contacts?${parts.join("&")}`);
  const phones = Array.from(new Set((rows || []).map((r: any) => r.phone).filter(Boolean)));
  return phones;
}
