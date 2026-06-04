import { createClient } from "@supabase/supabase-js";

// Strip a leading UTF-8 BOM / stray whitespace that can sneak into env vars
// (e.g. when set from a BOM-encoded file) and break realtime auth / keys.
const clean = (v?: string) => (v || "").replace(/^\uFEFF/, "").trim();

// Fallbacks keep the build from hard-failing if an env var is briefly
// missing at prerender time; real values are injected at build/runtime.
const URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL) || "https://placeholder.supabase.co";

// Browser/anon client (read for the inbox UI)
export const supabaseBrowser = () =>
  createClient(
    URL,
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || "placeholder"
  );

// Server/service client (writes from API routes only - never import in client code)
export const supabaseAdmin = () =>
  createClient(
    URL,
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) || "placeholder",
    { auth: { persistSession: false } }
  );
