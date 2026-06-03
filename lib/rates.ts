// WhatsApp pricing reference — source: twilio.com/en-us/whatsapp/pricing (2026-06).
// NOTE: the Billing page's "actual spend" comes from Twilio's reported per-message
// price (the real bill). These rates are a REFERENCE + estimator for sanity checks
// and for messages whose price hasn't posted yet.
//
// Marketing is country-specific and Twilio doesn't publish the UAE number on that
// page — drop your UAE marketing rate into `meta.marketing` when you have it.
export const RATES = {
  source: "https://www.twilio.com/en-us/whatsapp/pricing",
  updated: "2026-06-03",
  twilioPerMessage: 0.005, // Twilio platform fee, inbound or outbound
  meta: {
    marketing: null as number | null, // country-specific (set your UAE rate)
    utility: 0.0034, // free during the 24h customer-service window
    authentication: 0.0034,
    service: 0, // free-form within the 24h window
  },
};

// Estimated all-in cost of one outbound message for a given template category.
export function estimatePerMessage(category?: string | null): number {
  const cat = (category || "").toLowerCase();
  const meta = (RATES.meta as Record<string, number | null>)[cat];
  const metaFee = typeof meta === "number" ? meta : 0;
  return Math.round((RATES.twilioPerMessage + metaFee) * 10000) / 10000;
}

export const RATE_ROWS = [
  { label: "Twilio fee (per message, in/out)", value: RATES.twilioPerMessage, note: "always applies" },
  { label: "Meta — Marketing", value: RATES.meta.marketing, note: "country-specific" },
  { label: "Meta — Utility", value: RATES.meta.utility, note: "free in 24h window" },
  { label: "Meta — Authentication", value: RATES.meta.authentication, note: "" },
  { label: "Meta — Service / free-form", value: RATES.meta.service, note: "free in 24h window" },
];
