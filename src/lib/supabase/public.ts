import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import type { Database } from "@/lib/database.types";

// Anonymous, cookie-less client for the PUBLIC guest site (server components
// and route handlers). RLS + SECURITY DEFINER RPCs are the security boundary:
// anon can read active room types and call bk_availability / bk_quote /
// bk_public_settings — nothing else.
export function createPublicClient() {
  return createSupabaseClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
