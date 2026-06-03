// Minimal Twilio WhatsApp send via REST (no SDK needed).
export async function sendWhatsApp(toE164: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!; // e.g. whatsapp:+12202424577
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
