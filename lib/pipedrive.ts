// Direct Pipedrive integration (no Ulgebra). Pushes a WhatsApp lead into
// Pipedrive: find-or-create the person by phone, then open a Hot lead + note.
const clean = (v?: string) => (v || "").replace(/^\uFEFF/, "").trim();
const TOKEN = () => clean(process.env.PIPEDRIVE_API_TOKEN);
const BASE = "https://api.pipedrive.com/v1";

// Lead label ids (ERE Homes Pipedrive)
const LABEL_HOT = "d1b2a296-7a18-44d2-ac63-5b096641a3af";

async function pd(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}api_token=${TOKEN()}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `Pipedrive ${res.status}`);
  }
  return data.data;
}

export async function findPersonByPhone(phone: string) {
  const term = encodeURIComponent(phone.replace(/^whatsapp:/, ""));
  const data = await pd(`/persons/search?term=${term}&fields=phone&exact_match=false&limit=1`);
  const items = data?.items || [];
  return items.length ? items[0].item : null;
}

export async function pushLeadFromWhatsApp(opts: { phone: string; name?: string; note?: string }) {
  const phone = opts.phone.startsWith("+") ? opts.phone : `+${opts.phone}`;
  let person = await findPersonByPhone(phone);
  let created = false;
  if (!person) {
    person = await pd(`/persons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: opts.name || phone,
        phone: [{ value: phone, primary: true, label: "mobile" }],
      }),
    });
    created = true;
  }

  const lead = await pd(`/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${opts.name || phone} — WhatsApp`,
      person_id: person.id,
      label_ids: [LABEL_HOT],
    }),
  });

  if (opts.note) {
    await pd(`/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: opts.note, lead_id: lead.id }),
    }).catch(() => {});
  }

  return { personId: person.id, leadId: lead.id, personCreated: created };
}
