import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "template-media";

// Accepts a multipart image upload, stores it in a public Supabase Storage
// bucket, and returns a public URL usable as a WhatsApp card header.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.type.startsWith("image/"))
      return NextResponse.json({ error: "Image files only" }, { status: 400 });
    if (file.size > 5 * 1024 * 1024)
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });

    const sb = supabaseAdmin();
    // Idempotent: ignore "already exists" on repeat calls.
    await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `cards/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await sb.storage.from(BUCKET).upload(key, buf, {
      contentType: file.type,
      upsert: false,
    });
    if (error) throw new Error(error.message);

    const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
    return NextResponse.json({ url: data.publicUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
