import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Role } from "@/lib/database.types";

// Per-user staff management — super_admin only.
// PATCH  = change role and/or set a new password.
// DELETE = remove the staff account (profile cascades via FK).
//
// A super_admin can never change their OWN role or delete themselves, which
// also guarantees at least one super_admin always remains.

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["super_admin", "reservation_desk"];
const MIN_PASSWORD = 8;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.status === 401 ? "unauthorized" : "forbidden" },
        { status: guard.status }
      );
    }
    const id = params.id;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }

    const p = (await req.json().catch(() => null)) as {
      role?: unknown;
      password?: unknown;
    } | null;
    const role =
      p && typeof p.role === "string" ? (p.role as Role) : undefined;
    const password =
      p && typeof p.password === "string" ? p.password : undefined;

    if (role === undefined && password === undefined) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (role !== undefined && !ROLES.includes(role)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    if (password !== undefined && password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: "password_too_short" }, { status: 400 });
    }
    if (role !== undefined && id === guard.userId) {
      return NextResponse.json(
        { error: "cannot_change_own_role" },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    if (password !== undefined) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) {
        if (error.status === 404) {
          return NextResponse.json({ error: "not_found" }, { status: 404 });
        }
        throw error;
      }
    }

    if (role !== undefined) {
      const { data: updated, error } = await admin
        .from("profiles")
        .update({ role })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/users/[id] failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const guard = await requireSuperAdmin();
    if (!guard.ok) {
      return NextResponse.json(
        { error: guard.status === 401 ? "unauthorized" : "forbidden" },
        { status: guard.status }
      );
    }
    const id = params.id;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 });
    }
    if (id === guard.userId) {
      return NextResponse.json({ error: "cannot_delete_self" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      if (error.status === 404) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/users/[id] failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
