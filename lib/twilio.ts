// Strip a leading UTF-8 BOM / stray whitespace that can sneak into env vars
// (e.g. when set from a BOM-encoded file) and break Basic auth / API keys.
export const cleanEnv = (v?: string) => (v || "").replace(/^\uFEFF/, "").trim();

// Minimal Twilio WhatsApp via REST (no SDK needed).
export function twilioCreds() {
  const sid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const token = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  return {
    sid,
    token,
    authHeader: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
  };
}

// GET against any Twilio host (api.twilio.com or content.twilio.com).
// `url` may be a full URL or a path beginning with "/".
export async function twilioGet(url: string) {
  const { authHeader } = twilioCreds();
  const full = url.startsWith("http") ? url : `https://api.twilio.com${url}`;
  const res = await fetch(full, { headers: { Authorization: authHeader } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Twilio GET ${res.status}`);
  return data;
}

// JSON POST against content.twilio.com (Content API).
export async function twilioContentPost(path: string, body: any) {
  const { authHeader } = twilioCreds();
  const res = await fetch(`https://content.twilio.com${path}`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Twilio POST ${res.status}`);
  return data;
}

export async function sendWhatsApp(toE164: string, body: string) {
  const sid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const token = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const from = cleanEnv(process.env.TWILIO_WHATSAPP_FROM); // e.g. whatsapp:+12202424577
  const to = toE164.startsWith("whatsapp:") ? toE164 : `whatsapp:${toE164}`;

  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Twilio send failed");
  return data; // includes sid, status
}
