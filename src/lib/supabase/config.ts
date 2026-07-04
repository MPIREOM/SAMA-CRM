// Supabase connection values.
//
// The URL and anon key are PUBLISHABLE (they ship in the browser bundle by
// design; RLS is the security boundary), so the live project's values are
// safe as fallbacks — this lets a fresh deployment work before any env vars
// are configured. Environment variables always take precedence, and secret
// values (service role key etc.) have NO fallbacks anywhere.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vsxesrhoovabgsmvodvh.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeGVzcmhvb3ZhYmdzbXZvZHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTQzODksImV4cCI6MjA5Nzg5MDM4OX0.kxf8ywEdoUGtCuofVLgLAHPrguoyLafrn-JJEIMsnF4";
