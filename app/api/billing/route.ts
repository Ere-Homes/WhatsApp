import { NextRequest, NextResponse } from "next/server";
import { twilioCreds, twilioGet } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Account balance + messaging spend computed from message prices.
export async function GET(req: NextRequest) {
  try {
    const { sid } = twilioCreds();
    const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") || "30", 10), 1), 90);
    const maxPages = Math.min(parseInt(req.nextUrl.searchParams.get("maxPages") || "10", 10), 40);

    // Remaining account balance
    let balance: { balance: string; currency: string } | null = null;
    try {
      const b: any = await twilioGet(`/2010-04-01/Accounts/${sid}/Balance.json`);
      balance = { balance: b.balance, currency: b.currency };
    } catch {
      balance = null;
    }

    // Spend from message prices over the range
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceStr = since.toISOString().slice(0, 10);
    let url: string | null =
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=200&DateSent%3E=${sinceStr}`;

    let total = 0,
      priced = 0,
      count = 0;
    let currency = balance?.currency || "USD";
    const byDay: Record<string, number> = {};
    const byDir: Record<string, number> = { outbound: 0, inbound: 0 };
    let pages = 0;

    while (url && pages++ < maxPages) {
      const data: any = await twilioGet(url);
      for (const m of data.messages || []) {
        count++;
        if (m.price) {
          const p = Math.abs(parseFloat(m.price));
          total += p;
          priced++;
          if (m.price_unit) currency = m.price_unit;
          const day = m.date_sent ? new Date(m.date_sent).toISOString().slice(0, 10) : "—";
          byDay[day] = (byDay[day] || 0) + p;
          const dir = (m.direction || "").startsWith("outbound") ? "outbound" : "inbound";
          byDir[dir] += p;
        }
      }
      url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
    }

    return NextResponse.json({
      balance,
      range: { days, since: sinceStr },
      spend: {
        total: Math.round(total * 10000) / 10000,
        currency,
        messages: count,
        pricedMessages: priced,
        avgPerMessage: priced ? Math.round((total / priced) * 10000) / 10000 : 0,
        outbound: Math.round(byDir.outbound * 10000) / 10000,
        inbound: Math.round(byDir.inbound * 10000) / 10000,
        capped: pages >= maxPages,
      },
      byDay: Object.entries(byDay)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([day, v]) => ({ day, spend: Math.round(v * 10000) / 10000 })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to load billing" }, { status: 500 });
  }
}
