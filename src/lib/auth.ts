import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/database.types";

/** Current user + profile for server components / route handlers. */
export async function getSessionProfile(): Promise<{
  userId: string;
  email: string | null;
  profile: Profile | null;
  role: Role | null;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    role: (profile?.role as Role | undefined) ?? null,
  };
}

/** Route-handler guard: only a signed-in super_admin passes. */
export async function requireSuperAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; status: 401 | 403 }
> {
  const session = await getSessionProfile();
  if (!session) return { ok: false, status: 401 };
  if (session.role !== "super_admin") return { ok: false, status: 403 };
  return { ok: true, userId: session.userId };
}
