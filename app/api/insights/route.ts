import { NextRequest, NextResponse } from "next/server";
import { twilioCreds, twilioGet } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Twilio messaging insights + logs, computed from the Messages list API.
// Mirrors the Console "Messaging Insights" page: volume, delivery/read rate,
// error-code breakdown, by-day trend, plus the raw message log.
export async function GET(req: NextRequest) {
  try {
    const { sid } = twilioCreds();
    const maxPages = Math.min(parseInt(req.nextUrl.searchParams.get("maxPages") || "10", 10), 40);

    // Window: explicit from/to (ISO) take priority; otherwise fall back to days.
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");
    const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") || "1", 10), 1), 365);
    const fromMs = fromParam ? Date.parse(fromParam) : Date.now() - days * 24 * 60 * 60 * 1000;
    const toMs = toParam ? Date.parse(toParam) : Date.now();
    const fromDate = new Date(isNaN(fromMs) ? Date.now() - 86400000 : fromMs);
    const toDate = new Date(isNaN(toMs) ? Date.now() : toMs);

    // Filter by DateCreated, not DateSent: Twilio only stamps DateSent once a
    // message leaves the queue, so queued/sending/accepted messages have none and
    // a DateSent filter silently drops them (50 sent can read as 25 mid-flight).
    // DateCreated is set the instant Twilio accepts the message, so all count.
    // It's date-granular; widen the lower bound by a day, then filter precisely below.
    const sinceStr = new Date(fromDate.getTime() - 86400000).toISOString().slice(0, 10);
    const untilStr = toDate.toISOString().slice(0, 10);

    let url: string | null =
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json` +
      `?PageSize=200&DateCreated%3E=${sinceStr}&DateCreated%3C=${untilStr}`;

    const raw: any[] = [];
    let pages = 0;
    while (url && pages++ < maxPages) {
      const data: any = await twilioGet(url);
      raw.push(...(data.messages || []));
      url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
    }

    // Precise timestamp filter to the exact [from, to] window.
    const messages = raw.filter((m) => {
      const ts = Date.parse(m.date_created || m.date_sent || "");
      return !isNaN(ts) && ts >= fromDate.getTime() && ts <= toDate.getTime();
    });

    // WhatsApp error codes that mean "this number cannot receive WhatsApp" (a dead
    // number), as opposed to a content/template problem we caused. These are not real
    // delivery failures, so they should not drag down the delivery rate.
    const NOT_ON_WHATSAPP = new Set(["63049", "63003"]);

    // Aggregate
    const byStatus: Record<string, number> = {};
    const byErr: Record<string, number> = {};
    const byDay: Record<string, { out: number; in: number }> = {};
    let outbound = 0,
      inbound = 0,
      delivered = 0,
      read = 0,
      failed = 0,
      undelivered = 0,
      notOnWhatsApp = 0,
      priceTotal = 0;
    let currency = "USD";

    for (const m of messages) {
      const status = m.status || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;

      const isOut = (m.direction || "").startsWith("outbound");
      if (isOut) outbound++;
      else inbound++;

      if (status === "delivered") delivered++;
      if (status === "read") read++;
      if (status === "failed") failed++;
      if (status === "undelivered") undelivered++;

      if (m.error_code) {
        const k = String(m.error_code);
        byErr[k] = (byErr[k] || 0) + 1;
        if (isOut && NOT_ON_WHATSAPP.has(k)) notOnWhatsApp++;
      }

      if (m.price) {
        priceTotal += Math.abs(parseFloat(m.price));
        if (m.price_unit) currency = m.price_unit;
      }

      const d = (m.date_created || m.date_sent || "").slice(0, 16); // "Wed, 03 Jun 2026"
      const dayKey = m.date_created ? new Date(m.date_created).toISOString().slice(0, 10) : d;
      if (!byDay[dayKey]) byDay[dayKey] = { out: 0, in: 0 };
      if (isOut) byDay[dayKey].out++;
      else byDay[dayKey].in++;
    }

    // delivered+read count as reaching the handset
    const reached = delivered + read;
    // "Real" sends exclude numbers that aren't on WhatsApp - those were never deliverable
    // and shouldn't be counted as sent or held against the delivery rate.
    const validOutbound = Math.max(0, outbound - notOnWhatsApp);
    const deliveryRate = outbound ? Math.round((reached / outbound) * 1000) / 10 : 0;
    // Delivery rate among reachable (on-WhatsApp) numbers only - the honest one.
    const deliveryRateValid = validOutbound ? Math.round((reached / validOutbound) * 1000) / 10 : 0;
    const readRate = reached ? Math.round((read / reached) * 1000) / 10 : 0;
    const failRate = outbound ? Math.round(((failed + undelivered) / outbound) * 1000) / 10 : 0;

    const logs = messages.map((m) => ({
      sid: m.sid,
      date: m.date_sent || m.date_created,
      direction: m.direction,
      from: m.from,
      to: m.to,
      status: m.status,
      error_code: m.error_code || null,
      body: (m.body || "").slice(0, 140),
      price: m.price || null,
    }));

    return NextResponse.json({
      range: { from: fromDate.toISOString(), to: toDate.toISOString() },
      totals: {
        total: messages.length,
        outbound,
        validOutbound,
        notOnWhatsApp,
        inbound,
        delivered,
        read,
        failed,
        undelivered,
        deliveryRate,
        deliveryRateValid,
        readRate,
        failRate,
        priceTotal: Math.round(priceTotal * 10000) / 10000,
        currency,
        capped: pages >= maxPages,
      },
      byStatus,
      byErr,
      byDay: Object.entries(byDay)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([day, v]) => ({ day, ...v })),
      logs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load insights" }, { status: 500 });
  }
}
