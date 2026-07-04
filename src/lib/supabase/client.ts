"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase/config";
import type { Database } from "@/lib/database.types";

// Singleton browser client (RLS-scoped via the signed-in user's JWT).
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
