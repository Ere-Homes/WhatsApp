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

// DELETE against content.twilio.com (Content API). 204 = success, no body.
export async function twilioContentDelete(path: string) {
  const { authHeader } = twilioCreds();
  const res = await fetch(`https://content.twilio.com${path}`, {
    method: "DELETE",
    headers: { Authorization: authHeader },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || `Twilio DELETE ${res.status}`);
  }
}

// Delivery-status callback URL; bypass param lets Twilio through Vercel protection.
function statusCallbackUrl() {
  const base =
    cleanEnv(process.env.PUBLIC_BASE_URL) ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${cleanEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL)}` : "");
  if (!base) return "";
  const bypass = cleanEnv(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  return `${base}/api/twilio/status${bypass ? `?x-vercel-protection-bypass=${bypass}&x-vercel-set-bypass-cookie=true` : ""}`;
}

// Messaging Service SID — required for Twilio's native scheduled sends.
const MESSAGING_SERVICE_SID = () => cleanEnv(process.env.TWILIO_MESSAGING_SERVICE_SID);

// Available WhatsApp sender numbers. Comma-separated TWILIO_WHATSAPP_SENDERS
// overrides; falls back to the single TWILIO_WHATSAPP_FROM.
export function whatsappSenders(): string[] {
  const list = cleanEnv(process.env.TWILIO_WHATSAPP_SENDERS);
  const items = (list ? list.split(",") : [cleanEnv(process.env.TWILIO_WHATSAPP_FROM)])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("whatsapp:") ? s : `whatsapp:${s}`));
  return Array.from(new Set(items));
}

async function postMessage(form: URLSearchParams, opts?: { sendAt?: string; from?: string }) {
  const sid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const token = cleanEnv(process.env.TWILIO_AUTH_TOKEN);

  // Scheduled sends require a Messaging Service + ScheduleType=fixed; immediate
  // sends use the chosen From number (or the default).
  if (opts?.sendAt && MESSAGING_SERVICE_SID()) {
    form.set("MessagingServiceSid", MESSAGING_SERVICE_SID());
    form.set("ScheduleType", "fixed");
    form.set("SendAt", opts.sendAt);
  } else {
    const from = opts?.from ? (opts.from.startsWith("whatsapp:") ? opts.from : `whatsapp:${opts.from}`) : cleanEnv(process.env.TWILIO_WHATSAPP_FROM);
    form.set("From", from);
  }
  const cb = statusCallbackUrl();
  if (cb) form.set("StatusCallback", cb);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || "Twilio send failed");
  return data; // includes sid, status
}

const waTo = (toE164: string) => (toE164.startsWith("whatsapp:") ? toE164 : `whatsapp:${toE164}`);

// Free-form message (only valid inside the 24h customer-service window).
export async function sendWhatsApp(toE164: string, body: string, from?: string) {
  return postMessage(new URLSearchParams({ To: waTo(toE164), Body: body }), from ? { from } : undefined);
}

// Approved template message (works outside the 24h window). Pass sendAt (ISO)
// to schedule it via Twilio (15 min to 7 days out), and/or a from sender.
export async function sendTemplate(toE164: string, contentSid: string, variables?: Record<string, string>, sendAt?: string, from?: string) {
  const form = new URLSearchParams({ To: waTo(toE164), ContentSid: contentSid });
  if (variables && Object.keys(variables).length) form.set("ContentVariables", JSON.stringify(variables));
  return postMessage(form, { sendAt, from });
}
