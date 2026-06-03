import { createClient } from "@supabase/supabase-js";

// Fallbacks keep the build from hard-failing if an env var is briefly
// missing at prerender time; real values are injected at build/runtime.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";

// Browser/anon client (read for the inbox UI)
export const supabaseBrowser = () =>
  createClient(
    URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
  );

// Server/service client (writes from API routes only — never import in client code)
export const supabaseAdmin = () =>
  createClient(
    URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
    { auth: { persistSession: false } }
  );
