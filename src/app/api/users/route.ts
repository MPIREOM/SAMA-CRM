import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/database.types";

// Staff user management — super_admin only.
// GET  = list all staff accounts (auth.users joined with profiles).
// POST = create a staff account with an explicit role.

export const dynamic = "force-dynamic";

export interface StaffUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  created_at: string;
  last_sign_in_at: string | null;
}

const ROLES: Role[] = ["super_admin", "reservation_desk"];
const MIN_PASSWORD = 8;

export async function GET() {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.status === 401 ? "unauthorized" : "forbidden" },
        { status: guard.status }
      );
    }

    const admin = createAdminClient();
    const [{ data: authData, error: authErr }, { data: profiles, error: profErr }] =
      await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from("profiles").select("id, full_name, role"),
      ]);
    if (authErr) throw authErr;
    if (profErr) throw profErr;

    const byId = new Map(profiles?.map((p) => [p.id, p]) ?? []);
    const users: StaffUser[] = (authData?.users ?? [])
      .map((u) => {
        const profile = byId.get(u.id);
        return {
          id: u.id,
          email: u.email ?? null,
          full_name: profile?.full_name ?? null,
          role: (profile?.role as Role | undefined) ?? "reservation_desk",
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("GET /api/users failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.status === 401 ? "unauthorized" : "forbidden" },
        { status: guard.status }
      );
    }

    const p = (await req.json().catch(() => null)) as {
      full_name?: unknown;
      email?: unknown;
      password?: unknown;
      role?: unknown;
    } | null;

    const full_name =
      p && typeof p.full_name === "string" ? p.full_name.trim() : "";
    const email =
      p && typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
    const password = p && typeof p.password === "string" ? p.password : "";
    const role = p && typeof p.role === "string" ? (p.role as Role) : null;

    if (
      !full_name ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      password.length < MIN_PASSWORD ||
      !role ||
      !ROLES.includes(role)
    ) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) {
      const msg = createErr.message?.toLowerCase() ?? "";
      if (msg.includes("already") || createErr.status === 422) {
        return NextResponse.json({ error: "email_exists" }, { status: 409 });
      }
      throw createErr;
    }
    const user = created.user;

    // The on_auth_user_created trigger always inserts the profile as
    // reservation_desk (security fix in migration 0004) — stamp the role the
    // admin actually chose, service-role bypasses profiles RLS.
    const { error: profErr } = await admin
      .from("profiles")
      .upsert({ id: user.id, full_name, role });
    if (profErr) throw profErr;

    const staff: StaffUser = {
      id: user.id,
      email: user.email ?? email,
      full_name,
      role,
      created_at: user.created_at,
      last_sign_in_at: null,
    };
    return NextResponse.json({ user: staff }, { status: 201 });
  } catch (err) {
    console.error("POST /api/users failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
