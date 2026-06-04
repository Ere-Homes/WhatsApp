import { NextRequest, NextResponse } from "next/server";
import { signSession, ALLOWED_EMAIL, APP_PASSWORD, COOKIE, COOKIE_MAX_AGE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { email, password } -> sets a signed session cookie if it's the one
// allowed account with the correct password.
export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  if (!APP_PASSWORD()) return NextResponse.json({ error: "Login is not configured yet (no password set)." }, { status: 503 });

  const ok = String(email).trim().toLowerCase() === ALLOWED_EMAIL() && String(password) === APP_PASSWORD();
  if (!ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const token = await signSession(ALLOWED_EMAIL());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: COOKIE_MAX_AGE });
  return res;
}
