import { NextResponse } from "next/server";
import { whatsappSenders } from "@/lib/twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Available WhatsApp sender numbers (for the "send from" dropdown).
export async function GET() {
  const senders = whatsappSenders().map((s) => s.replace(/^whatsapp:/, ""));
  return NextResponse.json({ senders });
}
