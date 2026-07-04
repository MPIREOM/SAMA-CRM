import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";
import type { Database } from "@/lib/database.types";

// Service-role client — bypasses RLS. SERVER ONLY (webhooks, kiosk, senders).
// The service key has NO fallback — it must come from the environment.
export function createAdminClient() {
  const url = SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || serviceKey.includes("YOUR_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Set it in .env.local (see .env.example)."
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
