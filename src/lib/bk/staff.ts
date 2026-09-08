import "server-only";

import { getSessionProfile } from "@/lib/auth";
import type { Role } from "@/lib/database.types";
import type { Actor } from "./audit";

// Role model for the back-office (reuses CRM `profiles`):
//   super_admin      → everything (rates, settings, rooms, staff, audit, export)
//   reservation_desk → reservations, calendar, blocks, messaging queue

export const FRONT_DESK_ROLES: Role[] = ["super_admin", "reservation_desk"];
export const ADMIN_ROLES: Role[] = ["super_admin"];

export type StaffSession = { actor: Actor; role: Role };

/** Server-action guard. Throws a plain Error the action can surface as a message. */
export async function requireStaff(allowed: Role[] = FRONT_DESK_ROLES): Promise<StaffSession> {
  const session = await getSessionProfile();
  if (!session) throw new Error("unauthorized");
  const role = (session.role ?? "reservation_desk") as Role;
  if (!allowed.includes(role)) throw new Error("forbidden");
  return { actor: { userId: session.userId, email: session.email }, role };
}

export function canManageRates(role: Role): boolean {
  return role === "super_admin";
}
